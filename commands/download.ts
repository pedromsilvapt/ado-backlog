import { LoggerInterface, SharedLoggerInterface, pp } from 'clui-logger';
import { AzureClient } from '../common/azure';
import { Cache } from '../common/cache';
import { BacklogConfig, BacklogContentConfig, BacklogContentDefaultsConfig, BacklogContentSortConfig, BacklogOutputConfig, TfsConfig } from '../common/config';
import { Command } from './command';
import yargs from 'yargs';
import { HTMLExporter } from '../common/exporters/html';
import { JsonExporter } from '../common/exporters/json';
import { Backlog } from '../common/model';
import { ExporterManager } from '../common/exporterManager';
import { passign } from '../common/utils';
import path from 'path';

export class DownloadCommand extends Command {
    static description = 'Download the backlog as file(s) into the hard-drive';

    public readonly name: string = "download [backlogs...]";

    public readonly usage: string = "download [backlogs...]";

    public configure(yargs: yargs.Argv<{}>): void {
        yargs.positional('backlogs', {
            type: 'string',
            default: null,
            describe: 'name of backlogs defined in config file, to download (if empty, download all)',
            demandOption: false,
            array: true,
        });

        yargs.option('overwrite', {
            describe: 'overwrite existing output folder',
            type: 'boolean',
            boolean: true,
        });

        yargs.option('profile', {
            describe: 'collect performance statistics about the execution of the command and print them in the end',
            type: 'boolean',
            boolean: false,
        });

        yargs.option('output', {
            alias: 'o',
            describe: 'output folder to write the contents to',
            type: 'string',
        });

        yargs.option('config', {
            alias: 'c',
            describe: 'output folder to write the contents to',
            type: 'string',
            default: './config.kdl'
        });
    }

    /**
     * Returns the list of backlog configs for the provided args.
     * If no backlogs are explicitly set in the args object, then all backlog configs found in the file are returned.
     *
     * @param args
     * @returns
     */
    public getBacklogConfigs(args: DownloadCommandOptions): BacklogConfig[] {
        let configs: BacklogConfig[] = [];

        let errorFound = false;

        const backlogArgs = args.backlogs?.filter(name => name != null);

        if (!backlogArgs || backlogArgs.length == 0) {
            configs = this.config!.backlogs;
        } else {
            configs = [];

            for (const backlog of backlogArgs) {
                const backlogConfig = this.config!.backlogs.find(b => b.name == backlog);

                if (backlogConfig == null) {
                    this.logger!.error(pp`No backlog found in the configuration file named ${backlog}`);
                    errorFound = true;
                } else {
                    configs.push(backlogConfig);
                }
            }
        }

        if (!errorFound && configs.length == 0) {
            this.logger!.error(`No backlog was found in the configuration file!`);
            errorFound = true;
        }

        if (errorFound) {
            return [];
        }

        return configs;
    }

    async run(args: DownloadCommandOptions): Promise<void> {
        const config = this.config!;
        const logger = this.logger!;
        const metrics = this.metrics!;

        const cache = new Cache(config.cache, config.api.organizationUrl);

        // Configure Azure Client
        const azure = new AzureClient(logger.service('tfs'), cache, config, metrics.for('azure'));

        const backlogConfigs = this.getBacklogConfigs(args);

        for (const backlogConfig of backlogConfigs) {
            const project = await azure.getProjectByName(backlogConfig.project);

            if (project == null) {
                logger.error(pp`No project found in the TFS named ${backlogConfig.project}`);
                return;
            }

            logger.info(pp`Downloading backlog content workitems...`);

            const queryResults = await azure.getQueryWorkItems(project, backlogConfig);

            let content: BacklogContentConfig[] = backlogConfig.content;

            if (content == null) {
                logger.error(pp`Backlog has no content (work item types) defined in the configuration.`);
                return;
            }

            const tree = await azure.buildContent(queryResults, content, backlogConfig.contentDefaults);

            const workItemTypes = await azure.getWorkItemTypes(project.id!);

            const workItemStateColors = await azure.getWorkItemStates(project.name!, workItemTypes.map(t => t.name));

            const views: Record<string, number[]> = await passign(backlogConfig.views, 4, async view => {
                logger.info(pp`Downloading query results for view ${view.name}...`);

                // When both the backlog and the view are retrieved using a WIQL
                // query directly in the code, we combine both queries for the view
                if (backlogConfig.query != null && view.query != null) {
                    // NOTE: Concatenate the view query first, and only then the backlog query,
                    // to allow the backlog query to have additional clauses (such as ORDER BY)
                    return {
                        [view.name]: await azure.getQueryResults(project, {
                                query: `(${view.query.trim()}) AND (${backlogConfig.query.trim()})`
                        })
                    };
                } else {
                    return {
                        [view.name]: await azure.getQueryResults(project, view)
                    };
                }
            });

            let outputConfigs = args.output != null
                ? [new BacklogOutputConfig(args.output)]
                : backlogConfig.outputs;

            // Boolean flag which indicates if the output we will be using is the default provided one. Used to print a message in such cases,
            // Informing the user that the default output is being used, and that they can use custom outputs.
            let isDefaultOutput = false;

            // The default output is an HTML file on the current working directory with the name of the backlog
            if (outputConfigs == null || outputConfigs.length == 0) {
                outputConfigs = [new BacklogOutputConfig('{{it.backlogConfig.name}}.html')];

                isDefaultOutput = true;
            }

            const backlog = new Backlog(workItemTypes, workItemStateColors, backlogConfig, config.toc, config.workItems, tree, views);

            const exporter = new ExporterManager(logger, azure, backlog, backlogConfig, config.templates, metrics.for("output"));
            exporter.addFormat(HTMLExporter);
            exporter.addFormat(JsonExporter);
            exporter.addFormat(HTMLExporter);

            for (const outputConfig of outputConfigs) {
                const output = path.resolve(exporter.interpolate(outputConfig.path));

                if (isDefaultOutput) {
                    logger.info(pp`No outputs configured for backlog ${backlogConfig.name}, using ${output} as a default.`);
                }

                await exporter.run(output, outputConfig.format, {
                    overwrite: args.overwrite ?? outputConfig.overwrite ?? false,
                    mkdir: outputConfig.mkdir ?? false,
                });
            }
        }

        await cache.flush();
    }
}

export interface DownloadCommandOptions {
    backlogs?: string[];
    overwrite?: boolean;
    output: string;
}
