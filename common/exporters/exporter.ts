import { LoggerInterface } from 'clui-logger';
import { TemplateConfig } from '../config';
import { Backlog } from '../model';
import { AzureClient } from '../azure';
import assert from 'assert';
import * as fs from 'fs';

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

export interface OutputBuffer {
    get length(): number;

    write(...values: string[]): void;
}

export class ArrayOutputBuffer implements OutputBuffer {
    length: number = 0;

    public buffer: string[] = [];

    write(...values: string[]): void {
        for (let v of values) {
            if (v == null) {
                continue;
            }

            if (typeof v != 'string') {
                v = '' + v;
            }

            this.length += v.length;

            this.buffer.push(v);
        }
    }
}

export class StringOutputBuffer implements OutputBuffer {
    length: number = 0;

    public buffer: string = "";

    write(...values: string[]): void {
        for (let v of values) {
            if (v == null) continue;

            if (typeof v != 'string') {
                v = '' + v;
            }

            this.length += v.length;

            this.buffer += v;
        }
    }
}

export class FileOutputBuffer implements OutputBuffer {
    length: number = 0;

    public stream: fs.WriteStream;

    constructor (file: string, encoding: BufferEncoding = 'utf8') {
        this.stream = fs.createWriteStream(file, { encoding });
    }

    write(...values: string[]): void {
        for (let v of values) {
            if (v == null) {
                continue;
            }

            if (typeof v != 'string') {
                v = '' + v;
            }
            this.stream.write(v);
            this.length += v.length;
        }
    }
}