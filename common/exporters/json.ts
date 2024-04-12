import { Exporter, ExporterOptions } from './exporter';
import * as fs from 'fs/promises';
import TurndownService from 'turndown';

export class JsonExporter extends Exporter {
    protected turndownService = new TurndownService();

    public async run(file: string, options: ExporterOptions = {}): Promise<void> {
        if (file == null) {
            throw new Error(`Argument 'folder' cannot be null.`);
        }

        if (options == null) {
            throw new Error(`Argument 'options' cannot be null.`);
        }

        if (await fs.access(file).catch(() => false)) {
            if (options.overwrite) {
                await fs.rm(file, { recursive: true, force: true } as any);
            } else {
                throw new Error(`Output file '${file}' already exists. Pass the '--overwrite' argument to delete the file and write again.`);
            }
        }

        await fs.writeFile(file, JSON.stringify(this.backlog, undefined, 4), { encoding: 'utf8' });
    }
}
