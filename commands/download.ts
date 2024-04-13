import { LoggerInterface, SharedLoggerInterface, pp } from 'clui-logger';
import { AzureClient } from '../common/azure';
import { BacklogContentConfig, TfsConfig } from '../common/config';
import { Command } from './command';
import yargs from 'yargs';
import { Exporter } from '../common/exporters/exporter';
import { HTMLExporter } from '../common/exporters/html';
import { JsonExporter } from '../common/exporters/json';
import { Backlog } from '../common/model';

export class DownloadCommand extends Command {
    static description = 'Download the backlog as file(s) into the hard-drive';

    public readonly name: string = "download";

    public readonly usage: string = "download [backlog]";

    public configure (yargs: yargs.Argv<{}>): void {
        yargs.positional('name', {
            type: 'string',
            default: null,
            describe: 'name of backlog defined in config file, to download (if empty, download first one)',
            demandOption: false
        });

        yargs.option('overwrite', {
            describe: 'overwrite existing output folder',
            type: 'boolean',
            boolean: true,
        });

        yargs.option('output', {
            alias: 'o',
            describe: 'output folder to write the contents to',
            type: 'string',
            default: './out'
        });
    }

    async run (args: DownloadCommandOptions): Promise<void> {
        // Configure Azure Client
        const azure = new AzureClient(this.logger.service('tfs'), this.config);

        const backlogConfig = args.backlog
            ? this.config.backlogs.find(b => b.name == args.backlog)
            : this.config.backlogs[0];

        if (backlogConfig == null) {
            if (args.backlog) {
                this.logger.error(pp`No backlog found in the configuration file named ${args.backlog}`);
            } else {
                this.logger.error(`No backlog was found in the configuration file!`);
            }
            return;
        }

        const project = await azure.getProjectByName(backlogConfig.project);

        if (project == null) {
            this.logger.error(pp`No project found in the TFS named ${backlogConfig.project}`);
            return;
        }

        this.logger.info(pp`Downloading backlog content workitems...`);

        const queryResults = await azure.getQueryWorkItems(project, backlogConfig);

        let content: BacklogContentConfig[] = backlogConfig.content;

        if (content == null) {
            this.logger.error(pp`Backlog has no content (work item types) defined in the configuration.`);
            return;
        }

        const tree = await azure.buildContent(queryResults, content);

        const workItemTypes = await azure.getWorkItemTypes(project.id!);

        const workItemStateColors = await azure.getWorkItemStates(project.name!);

        const views: Record<string, number[]> = {};

        for (const view of backlogConfig.views) {
            if (view.name in views) {
                this.logger.error(pp`Duplicate view with name ${view.name} found in config, skipping it.`);
                continue;
            }

            this.logger.info(pp`Downloading query results for view ${view.name}...`);

            // When both the backlog and the view are retrieved using a WIQL
            // query directly in the code, we combine both queries for the view
            if (backlogConfig.query != null && view.query != null) {
                // NOTE: Concatenate the view query first, and only then the backlog query,
                // to allow the backlog query to have additional clauses (such as ORDER BY)
                views[view.name] = await azure.getQueryResults(project, {
                    query: `(${view.query.trim()}) AND ${backlogConfig.query.trim()}`
                });
            } else {
                views[view.name] = await azure.getQueryResults(project, view);
            }
        }

        const backlog = new Backlog(workItemTypes, workItemStateColors, backlogConfig, this.config.toc, this.config.workItems, tree, views);

        // const exporter: Exporter = new JsonExporter(backlog, workItemTypes, tree, this.config.templates);
        const exporter: Exporter = new HTMLExporter(this.logger, azure, backlog, this.config.templates);

        this.logger.info(pp`Rendering output into ${args.output}...`);

        await exporter.run(args.output, {
            overwrite: args.overwrite
        });
    }

    // public static define( yargv : yargs.Argv ) : yargs.Argv {
    //     return yargv.command( 'download', 'download [backlog]', (yargs) => {
    //         yargs.positional('name', {
    //           type: 'string',
    //           default: null,
    //           describe: 'name of backlog defined in config file, to download (if empty, download first one)',
    //           demandOption: false
    //         });
    //     }, function (argv) {
    //         console.log('hello', argv.name, 'welcome to yargs!')
    //     } );
    // }
}

export interface DownloadCommandOptions {
    backlog?: string;
    overwrite?: boolean;
    output: string;
}
