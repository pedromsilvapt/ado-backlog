import { LoggerInterface, pp } from 'clui-logger';
import { AzureClient } from './azure';
import { Backlog } from './model';
import { BacklogConfig, TemplateConfig } from './config';
import { Exporter, ExporterOptions } from './exporters/exporter';
import * as Sqrl from 'squirrelly';
import { DateTime } from 'luxon';

export class ExporterManager {
    public readonly logger: LoggerInterface;

    public readonly azure: AzureClient;

    public readonly backlog: Backlog;

    public readonly backlogConfig: BacklogConfig;

    public readonly templates: TemplateConfig[];

    public formats: Exporter[];

    public constructor(logger: LoggerInterface, azure: AzureClient, backlog: Backlog, backlogConfig: BacklogConfig, templates: TemplateConfig[]) {
        this.logger = logger;
        this.azure = azure;
        this.backlog = backlog;
        this.backlogConfig = backlogConfig;
        this.templates = templates;
        this.formats = [];
    }

    public addFormat(exporterClass: ExporterClass) {
        const exporter = new exporterClass(this.logger, this.azure, this.backlog, this.templates);

        this.formats.push(exporter);
    }
    
    public interpolate(outputTemplate: string): string {
        return Sqrl.render(outputTemplate, {
            backlogConfig: this.backlogConfig
        });
    }

    public findExporter(output: string, format?: string): Exporter | null {
        for (const exporter of this.formats) {
            if (format != null && exporter.name == format) {
                return exporter;
            }

            if (format == null && exporter.accepts(output)) {
                return exporter;
            }
        }

        return null;
    }

    public async run(output: string, format?: string, options?: ExporterOptions) {
            const exporter = this.findExporter(output, format);

            if (exporter == null) {
                if (format != null) {
                    this.logger.error(pp`No exporter found for output format ${format}`);
                } else {
                    this.logger.error(pp`No exporter found for output ${output}`);
                }

                return;
            }

        this.logger.info(pp`Exporting to ${output} with exporter ${exporter.name}`);
            await exporter.run(output, options);
    }
}

export interface ExporterClass {
    new(logger: LoggerInterface, azure : AzureClient, backlog: Backlog, templates: TemplateConfig[]): Exporter;
}

Sqrl.filters.define('format', (format: string) => {
    return DateTime.now().toFormat(format);
});