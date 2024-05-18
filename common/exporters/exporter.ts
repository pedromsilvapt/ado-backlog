import { LoggerInterface } from 'clui-logger';
import { BacklogConfig, TemplateConfig } from '../config';
import { Backlog, BacklogWorkItem, BacklogWorkItemType } from '../model';
import { AzureClient } from '../azure';

export abstract class Exporter {
    public abstract readonly name: string;
    
    public logger: LoggerInterface;

    public azure: AzureClient;

    public backlog: Backlog;

    public templates: TemplateConfig[];

    public constructor(logger: LoggerInterface, azure : AzureClient, backlog: Backlog, templates: TemplateConfig[]) {
        this.logger = logger;
        this.azure = azure;
        this.backlog = backlog;
        this.templates = templates;
    }

    public abstract accepts(output: string): boolean;

    public abstract run(output: string, options?: ExporterOptions): Promise<void>;
}

export interface ExporterOptions {
    overwrite?: boolean;
    mkdir?: boolean;
}
