import { BacklogWorkItem } from '../model';
import { Exporter, ExporterOptions } from './exporter';
import * as fs from 'fs/promises';
import path from 'path';
import sanitizeFilename from 'sanitize-filename';
import TurndownService from 'turndown';

export class MarkdownExporter extends Exporter {
    protected turndownService = new TurndownService();

    public async run (folder: string, options: ExporterOptions = {}): Promise<void> {
        if (folder == null) {
            throw new Error(`Argument 'folder' cannot be null.`);
        }

        if (options == null) {
            throw new Error(`Argument 'options' cannot be null.`);
        }

        if (await fs.access(folder).catch(() => false)) {
            if (options.overwrite) {
                await fs.rm(folder, { recursive: true, force: true } as any);
            } else {
                throw new Error(`Output folder '${folder}' already exists. Pass the '--overwrite' argument to delete the folder and write again.`);
            }
        }

        await fs.mkdir(folder);

        for (const item of this.backlog.workItems) {
            await this.exportWorkItem(item, folder);
        }
    }

    protected async exportWorkItem (workItem: BacklogWorkItem, workingDirectory: string) {
        const baseName = `${workItem.workItem.id!} - ${sanitizeFilename(workItem.workItem.fields!["System.Title"])}`;
        const fileName = `${baseName}.md`;

        await this.exportWorkItemFile(workItem, workingDirectory, fileName);

        if (workItem.hasChildren) {
            await this.exportWorkItemFolder(workItem, workingDirectory, baseName);
        }
    }

    protected async exportWorkItemFile (workItem: BacklogWorkItem, workingDirectory: string, fileName: string) {
        let contents = `#${workItem.workItem.id} - ${workItem.workItem.fields!["System.Title"]}\n`;

        const description = workItem.workItem.fields!["System.Description"];

        if (description) {
            var markdown = (this.turndownService as any).turndown(description);
            contents += `${markdown}\n`;
        }

        const filePath = path.join(workingDirectory, fileName);

        await fs.writeFile(filePath, contents, { encoding: 'utf8' });
    }

    protected async exportWorkItemFolder (workItem: BacklogWorkItem, workingDirectory: string, folderName: string) {
        const folderPath = path.join(workingDirectory, folderName);

        await fs.mkdir(folderPath);

        if (workItem.children != null) {
            for (const item of workItem.children) {
                await this.exportWorkItem(item, folderPath);
            }
        }
    }
}
