import { BacklogWorkItem } from '../model';
import { createReadStream } from 'fs';
import { ArrayOutputBuffer, Exporter, ExporterOptions, FileOutputBuffer, OutputBuffer, StringOutputBuffer } from './exporter';
import { TableCellAlignment, TableOfContentsMode, TemplateBlockConfig, TemplateConfig, TemplateLinksConfig, TemplateMetadataColumnConfig, TemplateMetadataConfig, TemplateMetadataRowConfig, TemplateSectionConfig, TemplateTagsConfig } from '../config';
import { streamToBase64 } from '../utils';
import { pp } from 'clui-logger';
import marked from 'marked';
import * as fs from 'fs/promises';
import * as he from 'he';
import * as cheerio from 'cheerio';
import * as luxon from 'luxon';
import * as path from 'path';

export class HTMLExporter extends Exporter {
    public readonly name: string = 'html';

    protected _workItemIconName: Record<string, string> = {};

    protected _lastExportedFile: string | undefined;

    public accepts(output: string): boolean {
        const outputLower = output.toLowerCase();

        return outputLower.endsWith('.html') || outputLower.endsWith('.htm');
    }

    public async run(output: string, options: ExporterOptions = {}): Promise<void> {
        if (output == null) {
            throw new Error(`Argument 'output' cannot be null.`);
        }

        if (options == null) {
            throw new Error(`Argument 'options' cannot be null.`);
        }

        const outputFolder = path.dirname(output);
        const folderExists = await fs.access(outputFolder).then(() => true, () => false);

        if (!folderExists) {
            if (options.mkdir) {
                await fs.mkdir(outputFolder, { recursive: true });
            } else {
                throw new Error(`Output folder '${outputFolder}' does not exist. Create it beforehand or configure the "mkdir=true" property on the "output" element in the config file.`);
            }
        }

        const fileExists = await fs.access(output).then(() => true, () => false);

        if (fileExists) {
            if (options.overwrite) {
                await fs.rm(output, { recursive: true, force: true } as any);
            } else {
                throw new Error(`Output file '${output}' already exists. Pass the '--overwrite' argument to delete the file and write again, or configure the "overwrite=true" property on the "output" element in the config file.`);
            }
        }

        if (this._lastExportedFile != null) {
            await fs.copyFile(this._lastExportedFile, output);
            return;
        }

        const buffer = new FileOutputBuffer(output);

        buffer.write(`<!doctype html>
        <html lang="en">
        <head>
        <meta charset="UTF-8">
        <title>${this.backlog.config.name}</title>
        <style>${HTMLStylesheetAir}</style>\n`);

        this.exportIconStyles(buffer);

        buffer.write(`</head>
        <body>\n`);

        await this.exportBrands(buffer);

        await this.exportHeader(buffer);

        await this.exportViewsTabbar(buffer);

        await this.exportTableOfContents(buffer);

        buffer.write(`<div class="centered-layout">`);

        await this.backlog.visitAsync(wi => this.exportWorkItem(buffer, wi));

        await this.exportAppendixes(buffer);

        await this.exportBackToTop(buffer);

        await this.exportFooter(buffer);

        buffer.write(`</div>`);

        buffer.write(HTMLScript);

        buffer.write(`
        </body>
        </html>`);

        buffer.stream.close();

        this._lastExportedFile = output;
    }

    public tagIcon = 'tag';

    public tagIconBody = `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" xmlns:xlink="http://www.w3.org/1999/xlink" enable-background="new 0 0 512 512">
    <g>
      <path d="m368.4,90.3c-30.3,0-54.9,24.6-54.9,54.9s24.6,54.9 54.9,54.9c30.3,0 54.9-24.6 54.9-54.9s-24.6-54.9-54.9-54.9zm0,69.1c-7.8,0-14.2-6.3-14.2-14.2s6.3-14.2 14.2-14.2c7.8,0 14.2,6.3 14.2,14.2s-6.4,14.2-14.2,14.2z"/>
      <path d="m54.4,312.2l142.4,144.5 262.8-259-22.9-119.7-119.4-24.8-262.9,259h2.13163e-14zm142.4,188c-9.2,0-17.9-3.6-24.4-10.2l-151.6-153.9c-13.2-13.4-13.1-35.1 0.4-48.4l270-266c8.1-8 19.9-11.5 31-9.1l127,26.4c13.6,2.8 24,13.5 26.7,27.1l24.5,127.4c2.2,11.3-1.4,22.8-9.6,30.9l-270,266c-6.4,6.3-15,9.8-24,9.8z"/>
    </g>
  </svg>`;

    public expandIcon = 'expand';

    public expandIconBody = `<svg fill="#000000" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <g> <path d="M12.36,1H3.64A2.64,2.64,0,0,0,1,3.64v8.72A2.64,2.64,0,0,0,3.64,15h8.72A2.64,2.64,0,0,0,15,12.36V3.64A2.64,2.64,0,0,0,12.36,1ZM13.6,12.36a1.25,1.25,0,0,1-1.24,1.24H3.64A1.25,1.25,0,0,1,2.4,12.36V3.64A1.25,1.25,0,0,1,3.64,2.4h8.72A1.25,1.25,0,0,1,13.6,3.64ZM8.7,4H7.3V7.31H4v1.4H7.3V12H8.7V8.71H12V7.31H8.7Z"></path> </g> </g></svg>`;

    public collapseIcon = 'collapse';

    public collapseIconBody = `<svg fill="#000000" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <g> <path d="M12.36,1H3.64A2.64,2.64,0,0,0,1,3.64v8.72A2.64,2.64,0,0,0,3.64,15h8.72A2.64,2.64,0,0,0,15,12.36V3.64A2.64,2.64,0,0,0,12.36,1ZM13.6,12.36a1.25,1.25,0,0,1-1.24,1.24H3.64A1.25,1.25,0,0,1,2.4,12.36V3.64A1.25,1.25,0,0,1,3.64,2.4h8.72A1.25,1.25,0,0,1,13.6,3.64ZM4,8.71h8V7.31H4Z"></path> </g> </g></svg>`;

    protected getIcon(iconName: string, size: number = 13): string {
        // **NOTE** Important one white space at the end!
        return `<span class="icon icon-${iconName}" style="width: ${size}px; height: ${size}px"></span> `;
    }

    protected getWIIcon(workItemName: string, size: number = 13): string {
        var slugName = this._workItemIconName[workItemName];

        return this.getIcon('wi-' + slugName, size);
    }

    protected exportIconSvgStyle(buffer: OutputBuffer, name: string, iconSvg: string) {
        const encodedSvg = encodeURIComponent(iconSvg);

        buffer.write(`.icon.icon-${name} {
            background-image: url("data:image/svg+xml,${encodedSvg}");
        }\n\n`);
    }

    protected exportIconStyles(buffer: OutputBuffer) {
        buffer.write(`<style>\n`);

        buffer.write(`.icon {
            background-size: cover;
            display: inline-block;
        }\n\n`);

        this.exportIconSvgStyle(buffer, this.tagIcon, this.tagIconBody);

        this.exportIconSvgStyle(buffer, this.expandIcon, this.expandIconBody);

        this.exportIconSvgStyle(buffer, this.collapseIcon, this.collapseIconBody);

        for (const workItemType of this.backlog.workItemTypes) {
            // TODO Better replace of other possible special characters that are not valid css class names
            var slugName = workItemType.name.replace(' ', '-').toLowerCase();

            // TODO Save slugName associated with work item type
            this._workItemIconName[workItemType.name] = slugName;

            this.exportIconSvgStyle(buffer, 'wi-' + slugName, workItemType.icon);
        }

        buffer.write(`</style>\n`);
    }

    protected async exportWorkItemField(buffer: OutputBuffer, workItem: BacklogWorkItem, field: string, richText: boolean = false, ignoredValues: string[] | null = null) {
        let value = workItem.workItem.fields?.[field];

        if (ignoredValues != null && ignoredValues.includes(value)) {
            value = null;
        }

        if (value != null && value != "") {
            // TODO Remove hard-coded type validation
            if (field == 'System.State') {
                const color = this.backlog.workItemStateColors[workItem.typeName][value];

                const escapedValue = he.encode(value);

                buffer.write(`<span title="${escapedValue}"><span class="state-indicator" style="background-color: #${color}"></span> ${escapedValue}</span>`);
            } else if (field == 'System.ChangedDate') {
                var date = new Date(value);

                var shortDate = date.toLocaleDateString('en-us', { weekday:"long", year:"numeric", month:"short", day:"numeric"});
                var longDate = date.toLocaleString();

                buffer.write(`<span title=${JSON.stringify(longDate)}>${shortDate}</span>`)
            } else if (richText) {
                let dom = cheerio.load(value ?? '');

                let mutated = false;
                for (const imgElem of dom('img')) {
                    var src = dom(imgElem).attr('src');

                    if (src != null) {
                        // TODO Test src http if it matches TFS url
                        var imageStream = await this.azure.downloadAttachmentUrlBase64(src);

                        if (imageStream != null) {
                            dom(imgElem).attr('src', imageStream);

                            mutated = true;
                        }
                    }
                }

                if (mutated) {
                    buffer.write(dom.html());
                } else {
                    buffer.write(value ?? '');
                }
            } else if (typeof value === 'string') {
                const escapedValue = he.encode(value);
                const escapedValueSingleLine = escapedValue.replace('\n', '');

                buffer.write(`<span title=${JSON.stringify(escapedValueSingleLine)}>${escapedValue}</span>\n`);
            } else {
                buffer.write(value ?? '');
            }
        }
    }

    protected async exportBrands(buffer: OutputBuffer) {
        if (this.backlog.config.brands.length > 0) {
            buffer.write(`<div class="brands">\n`);

            for (const brand of this.backlog.config.brands) {
                const brandStream = createReadStream(brand.logo);

                const base64Brand = `data:image/${path.extname(brand.logo).slice(1)};base64,` + await streamToBase64(brandStream);

                buffer.write(`<div class="brand right">
                    <img src="${base64Brand}" />
                </div>`);
            }

            buffer.write(`</div>\n`);
        }
    }

    protected async exportHeader(buffer: OutputBuffer) {
        buffer.write(`<header id="top">
        <h1>${this.backlog.config.name}</h1>
        <p style="text-align: center; margin-top: 0;"><small>${luxon.DateTime.now().toFormat("DDDD")}</small></p>
        <p style="text-align: center; margin-top: 0;">`);

        for (const wit of this.backlog.getDistinctUsedWorkItemTypes()) {
            buffer.write(`<span title=${JSON.stringify(wit.name)}>`);
            buffer.write(this.getWIIcon(wit.name));
            buffer.write(`</span>`);
        }

        buffer.write(`</p>\n</header>\n`);
    }

    protected async exportViewsTabbar(buffer: OutputBuffer) {
        const views = this.backlog.config.views;

        if (views.length > 0) {
            buffer.write(`<nav id="views padding-body">
            <p class="views tabbar" data-tab-callback="onViewSelected">\n`);

            buffer.write(`<a class="tab active" data-tab-context="all">All</a>`);

            for (const view of views) {
                const workItemIds = this.backlog.views[view.name].join(',');

                buffer.write(`<a class="tab" data-tab-context="${workItemIds}">${view.name}</a>`);
            }

            buffer.write(`
                </p>
                <noscript>
                    "Views" functionality is not available without JavaScript enabled.
                    Please download this file and open it locally with your browser.
                </noscript>
            </nav>\n`);
        }
    }

    protected async exportTableOfContents(buffer: OutputBuffer) {
        const tocConfig = this.backlog.toc;

        if (tocConfig.mode == TableOfContentsMode.List) {
            await this.exportTableOfContentsList(buffer);
        } else if (tocConfig.mode == TableOfContentsMode.Grid) {
            await this.exportTableOfContentsDataGrid(buffer);
        } else {
            this.logger.error(`Invalid TableOfContentsMode '${tocConfig.mode}', expected '${TableOfContentsMode.List}' or '${TableOfContentsMode.Grid}'`);
        }
    }

    protected async exportTableOfContentsDataGrid(buffer: OutputBuffer) {
        const tocConfig = this.backlog.toc;

        const contentWorkItemTypes = Array.from(this.backlog.config.allWorkItemTypes());

        // If there is no content defined, there is no table of contents
        if (contentWorkItemTypes.length == 0) {
            return;
        }

        // Validate TOC columns configuration
        const columnVariations: TableOfContentsValuesValidation[] = [];

        // Create a list of, for each work item type, the column's headers and sizes
        for (const workItemType of contentWorkItemTypes) {
            const workItemColumns: TableOfContentsValuesValidation = {
                workItemType: workItemType,
                headers: [],
                sizes: [],
            };

            for (const value of tocConfig.valuesFor(workItemType)) {
                workItemColumns.headers.push(value.header);
                workItemColumns.sizes.push(value.width);
            }

            columnVariations.push(workItemColumns);
        }

        // Validate if, for all work item types, the list of columns:
        //  - has the same number of columns (by counting the headers)
        //  - has the same sizes (by comparing their values)
        for (let i = 1; i < columnVariations.length; i++) {
            if (columnVariations[0].headers.length != columnVariations[i].headers.length) {
                this.logger.error(pp`Work item ${columnVariations[i].workItemType} has different number of columns than work item type ${columnVariations[0].workItemType}\n`
                    + ` - ${columnVariations[i].workItemType}: ${columnVariations[i].headers}\n`
                    + ` - ${columnVariations[0].workItemType}: ${columnVariations[0].headers}`);
            }

            if (columnVariations[0].sizes.some((s, si) => s != columnVariations[i].sizes[si])) {
                this.logger.error(pp`Work item ${columnVariations[i].workItemType} has different column sizes than work item type ${columnVariations[0].workItemType}\n`
                    + ` - ${columnVariations[i].workItemType}: ${columnVariations[i].sizes}\n`
                    + ` - ${columnVariations[0].workItemType}: ${columnVariations[0].sizes}`);
            }
        }

        buffer.write(`<nav id="toc" class="padding-body">`);

        if (!tocConfig.hideHeader) {
            buffer.write(`<h1>Table of Contents</h1>\n`);
        }

        buffer.write(`<table id="toc-grid" class="data-grid collapsible-data-grid">
            <thead>
                <tr>
                    <th>
                        <span title="Expand All" data-grid-action="expand-all" data-grid-selector="#toc-grid" class="icon-small-button">${this.getIcon(this.expandIcon)}</span>
                        <span title="Collapse All" data-grid-action="collapse-all" data-grid-selector="#toc-grid" class="icon-small-button">${this.getIcon(this.collapseIcon)}</span>
                        Title
                    </th>\n`);

        // For the headers, we take information from the first work item type defined in the backlog
        for (const value of tocConfig.valuesFor(contentWorkItemTypes[0])) {
            buffer.write(`<th title=${JSON.stringify(value.header)} style="width: ${value.width ?? 'auto'}; max-width: ${value.width ?? 'auto'};">${value.header}</th>`);
        }

        buffer.write(`</tr>
            </thead>
            <tbody>
        `);

        let depth = 0;
        const ancestors: BacklogWorkItem[] = [];

        await this.backlog.visitAsync(async (wi, end) => {
            if (!end) {
                const workItemType = wi.type;

                if (ancestors.length == 0) {
                    buffer.write(`<tr data-grid-row-id="${wi.id}" data-grid-row-level="${depth}">`);
                } else {
                    const parentWi = ancestors[ancestors.length - 1];

                    buffer.write(`<tr data-grid-row-id="${wi.id}" data-grid-parent-row-id="${parentWi.id}" data-grid-row-level="${depth}">`);
                }

                buffer.write(`
                    <td class="data-grid-caret-column" style="padding-left: ${16 * (depth + 1)}px">
                        ${this.getWIIcon(workItemType.name)} ${wi.id} <a href="#${wi.id}">${he.encode(wi.title)}</a>
                    </td>
                `);

                for (const value of tocConfig.valuesFor(workItemType.name)) {
                    buffer.write(`<td style="text-align: ${value.align ?? TableCellAlignment.Left}">`);

                    // Only print the value of this column if there is a field name. Otherwise, print it as empty
                    if (value.field != null) {
                        await this.exportWorkItemField(buffer, wi, value.field, false);
                    }

                    buffer.write(`</td>`);
                }


                buffer.write(`</tr>\n`);

                depth += 1;

                if (wi.hasChildren && wi.children.length > 0) {
                    ancestors.push(wi);
                }
            } else {
                depth -= 1;

                if (wi.hasChildren && wi.children.length > 0) {
                    ancestors.pop();
                }
            }
        }, /* root: */ null, /* visitEnd: */ true);
        buffer.write(`</table>`);

        buffer.write(`<hr class="end-of-work-item" />
        </nav>\n`);

        buffer.write(`</div>`);
    }

    protected async exportTableOfContentsList(buffer: OutputBuffer) {
        buffer.write(`<div class="centered-layout">`);

        buffer.write(`<nav id="toc">
        <h1>Table of Contents</h1>\n`);

        buffer.write(`
        <p style="text-align: right; margin: 0; margin-bottom: 5px;">
            <span title="Expand All" data-list-action="expand-all" data-list-selector="#toc-list" class="icon-small-button">${this.getIcon(this.expandIcon)}</span>
            <span title="Collapse All" data-list-action="collapse-all" data-list-selector="#toc-list" class="icon-small-button">${this.getIcon(this.collapseIcon)}</span>
        </p>`);

        buffer.write(`<ul id="toc-list" style="margin-top: 5px;" class="collapsible-list">`);
        this.backlog.visit((wi, end) => {
            if (!end) {
                const workItemType = wi.type;

                buffer.write(`<li style="list-style-type: none">
                ${this.getWIIcon(workItemType.name)} ${wi.id} <a href="#${wi.id}">${he.encode(wi.title)}</a></li>`)

                if (wi.hasChildren && wi.children.length > 0) {
                    buffer.write(`<ul style="margin-top: 5px;">`);
                }
            } else {
                if (wi.hasChildren && wi.children.length > 0) {
                    buffer.write(`</ul>`);
                }
            }
        }, /* root: */ null, /* visitEnd: */ true);
        buffer.write(`</ul>`);

        buffer.write(`<hr class="end-of-work-item" />
        </nav>\n`);

        buffer.write(`</div>`);
    }

    protected async exportAppendixes(buffer: OutputBuffer) {
        if (this.backlog.config.appendixes.length > 0) {
            for (const appendix of this.backlog.config.appendixes) {
                buffer.write(`<section class="appendix from-markdown">\n`);

                if (appendix.title != null) {
                    buffer.write(`<h1>${he.encode(appendix.title)}</h1>\n`);
                }

                if (appendix.content != null) {
                    const tokenizer = new marked.Tokenizer();
                    tokenizer.code = (src: string): marked.Tokens.Code | undefined => { return; }

                    buffer.write(`${marked.parse(appendix.content, { tokenizer })}\n`);
                }

                buffer.write(`</section>\n`);
            }
        }
    }

    protected async exportBackToTop(buffer: OutputBuffer) {
        buffer.write(`<a id="back-to-top" href="#top">
            <svg fill="#000000" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="
            width: 45px;
            height: 45px;
            ">
                <g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g>
                <g id="SVGRepo_iconCarrier"><path d="M5 21h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2zm7-14 5 5h-4v5h-2v-5H7l5-5z"></path></g>
            </svg>
        </a>\n`);
    }

    protected async exportFooter(buffer: OutputBuffer) {
        buffer.write(`<footer style="text-align: center; color: gray">
            Critical Manufacturing. Document generated in ${luxon.DateTime.now().toFormat("DDDD")}.
        </footer>`);
    }

    protected async exportWorkItemTemplate(buffer: OutputBuffer, template: TemplateConfig, workItem: BacklogWorkItem) {
        const level = 2;

        const workItemType = workItem.type;

        buffer.write(`<article class="workitem ${workItem.typeSlug}" id="${workItem.id}" data-wi-id="${workItem.id}" data-wi-title=${JSON.stringify(workItem.title)} class="workitem ${workItem.typeSlug}">\n`);
        buffer.write(`<p style="margin-bottom: 0; margin-top: 0;">
        ${this.getWIIcon(workItemType.name)}
        ${workItem.typeName.toUpperCase()} ${workItem.id}
        </p>\n`);
        buffer.write(`<h${level}>${workItem.title}</h${level}>\n`);

        for (const block of template.blocks) {
            await this.exportWorkItemTemplateBlock(buffer, block, workItem, level + 1, {});
        }

        buffer.write(`<hr class="end-of-work-item" />\n`);
        buffer.write(`</article>\n`);
    }

    protected async exportWorkItemTemplateBlock(buffer: OutputBuffer, block: TemplateBlockConfig, workItem: BacklogWorkItem, level: number, options : BlockRenderOptions) {
        if (block instanceof TemplateSectionConfig) {
            await this.exportWorkItemTemplateSection(buffer, block, workItem, level, options);
        } else if (block instanceof TemplateLinksConfig) {
            await this.exportWorkItemTemplateLinks(buffer, block, workItem, level, options);
        } else if (block instanceof TemplateTagsConfig) {
            await this.exportWorkItemTemplateTags(buffer, block, workItem, level, options);
        } else if (block instanceof TemplateMetadataConfig) {
            await this.exportWorkItemTemplateMetadata(buffer, block, workItem, level, options);
        } else {
            this.logger.error(`Could not render block of type ${(block as any)?.constructor?.name ?? 'null'}.`);
        }
    }

    protected async exportWorkItemTemplateTags(buffer: OutputBuffer, block: TemplateTagsConfig, workItem: BacklogWorkItem, level: number, options : BlockRenderOptions) {
        const tags = workItem.tags;

        if (tags != null && tags.length > 0) {
            const margin = options.inline ? 0 : 8;
            buffer.write(`<section data-wi-tags style="margin-bottom: ${margin}px;">
                <strong>Tags</strong>
                ${this.getIcon(this.tagIcon)} ${tags.join(', ')}
            </section>`);
        }
    }

    protected async exportWorkItemTemplateLinks(buffer: OutputBuffer, block: TemplateLinksConfig, workItem: BacklogWorkItem, level: number, options : BlockRenderOptions) {
        const links = this.backlog.getLinks([workItem], block.relations);

        if (links.length > 0) {
            if (block.single) {
                buffer.write(`<section data-wi-links>`);

                if (!options.inline) {
                    buffer.write(`<p style="margin-bottom: 0">`);
                }

                buffer.write(`    <strong style="margin-right: 7px">${block.label}</strong>
                `);

                const relatedWorkItem = links[0];

                const workItemType = relatedWorkItem.type;

                buffer.write(`
                    ${this.getWIIcon(workItemType.name)} <span style="color: #868686">${relatedWorkItem.id}</span> <a href="#${relatedWorkItem.id}">${he.encode(relatedWorkItem.title)}</a>
                `);

                if (!options.inline) {
                    buffer.write(`</p>`);
                }

                buffer.write(`</section>\n`);
            } else {
                buffer.write(`<section data-wi-links>
                    <p style="margin-bottom: 0"><strong>${block.label}</strong></p>
                    <ul style="margin-top: 5px;">\n`);

                for (const relatedWorkItem of links) {
                    const workItemType = relatedWorkItem.type;

                    buffer.write(`
                        <li style="list-style-type: none">
                        ${this.getWIIcon(workItemType.name)} <span style="color: #868686">${relatedWorkItem.id}</span> <a href="#${relatedWorkItem.id}">${he.encode(relatedWorkItem.title)}</a></li>
                    `);
                }
                buffer.write(`
                    </ul>
                </section>\n`);
            }
        }
    }

    protected async exportWorkItemTemplateSection(buffer: OutputBuffer, block: TemplateSectionConfig, workItem: BacklogWorkItem, level: number, options : BlockRenderOptions) {
        var fieldBuffer = new StringOutputBuffer();

        await this.exportWorkItemField(fieldBuffer, workItem, block.field, block.richText, block.ignoredValues);

        if (fieldBuffer.buffer.length > 0) {
            buffer.write(`<section data-wi-field-name=${JSON.stringify(block.field)}>`);

            if (block.header != null) {
                if (options.inline) {
                    buffer.write(`<strong>${block.header}</strong>`);
                } else {
                    buffer.write(`<h${level}>${block.header}</h${level}>`);
                }
            }

            buffer.write(fieldBuffer.buffer);

            buffer.write(`</section>`);
        }
    }

    protected async exportWorkItemTemplateMetadata(buffer: OutputBuffer, block: TemplateMetadataConfig, workItem: BacklogWorkItem, level: number, options : BlockRenderOptions) {
        const columns = block.columns;

        const cells = (await Promise.all(block.cells.map(async cell => {
            const cellBuffer = new StringOutputBuffer();

            if (cell.blocks) {
                for (const block of cell.blocks) {
                    await this.exportWorkItemTemplateBlock(cellBuffer, block, workItem, level, { ...options, inline: true });
                }
            }

            return { cell, cellBuffer };
        }))).filter(cell => cell.cellBuffer.buffer.length > 0);

        if (cells.length > 0) {
            buffer.write(`<section data-wi-metadata class="workitem-metadata">
            <table>`);

            let startRow = true;
            let endRow = false;
            let columnOffset = 0;

            for (let i = 0; i < cells.length; i++) {
                const { cell, cellBuffer } = cells[i];

                const nextCell = cells[i + 1]?.cell;

                let columnSpan = 1;

                // If this cell is a full row, we always want to start and end the row
                // afte this cell
                if (cell instanceof TemplateMetadataRowConfig) {
                    startRow = true;
                    endRow = true;
                } else if (cell instanceof TemplateMetadataColumnConfig) {
                    if (cell.colspan > 0) {
                        columnSpan = cell.colspan;
                    }

                    if (columnSpan > columns) {
                        this.logger.warn(`Invalid cell ${JSON.stringify(cell)}, colspan of ${columnSpan} is higher than the allowed columns value of ${columns}. Skipping.`);
                        continue;
                    }

                    // If there is a next cell, check if it will require a new row to start
                    if (nextCell != null) {
                        if (nextCell instanceof TemplateMetadataRowConfig) {
                            endRow = true;
                        } else if (nextCell instanceof TemplateMetadataColumnConfig) {
                            if (Math.max(nextCell.colspan, 1) + columnSpan + columnOffset > columns) {
                                endRow = true;
                            }
                        }
                    }
                } else {
                    this.logger.warn(`Invalid cell ${JSON.stringify(cell)}, only rows and columns are supported. Skipping.`);
                    continue;
                }

                // If this cell is ending a row, make sure it takes up all the remaining space
                if (!startRow && endRow) {
                    columnSpan = columns - columnOffset;
                } else if (startRow && endRow) {
                    columnSpan = columns;
                }

                // Print to buffer
                if (startRow) {
                    buffer.write(`\n<tr>\n`);
                    startRow = false;
                }

                buffer.write(`<td colspan="${columnSpan}">`);
                buffer.write(cellBuffer.buffer);
                buffer.write(`</td>`);

                columnOffset += columnSpan;

                if (endRow) {
                    buffer.write(`\n</tr>\n`);
                    endRow = false;
                    startRow = true;
                    columnOffset = 0;
                }
            }

            buffer.write(`
                </table>
            </section>`);
        }
    }

    protected async exportWorkItem(buffer: OutputBuffer, workItem: BacklogWorkItem, level: number = 1) {
        const template = this.templates.find(tpl => tpl.workItemType == workItem.typeName);

        if (template == null) {
            throw new Error(`Could not find template "${workItem.typeName}"`);
        }

        await this.exportWorkItemTemplate(buffer, template, workItem);
    }
}

export interface BlockRenderOptions {
    inline?: boolean;
}

export interface TableOfContentsValuesValidation {
    workItemType: string;
    headers: string[];
    sizes: (string | undefined)[];
}

const HTMLScript = `
<script>
    function initCollapsibleLists() {
        var caretIcon = '<svg class="collapsible-list-caret caret-open" margin-left: -17px;" width=13 height=13 class="icon-caret" clip-rule="evenodd" fill-rule="evenodd" stroke-linejoin="round" stroke-miterlimit="2" viewBox="5 5 14 14" xmlns="http://www.w3.org/2000/svg"><path d="m16.843 10.211c.108-.141.157-.3.157-.456 0-.389-.306-.755-.749-.755h-8.501c-.445 0-.75.367-.75.755 0 .157.05.316.159.457 1.203 1.554 3.252 4.199 4.258 5.498.142.184.36.29.592.29.23 0 .449-.107.591-.291 1.002-1.299 3.044-3.945 4.243-5.498z"/></svg>';

        var collapsibleLists = document.querySelectorAll("ul.collapsible-list");

        for (const listRoot of collapsibleLists) {
            for (const li of listRoot.querySelectorAll("li")) {
                var sibling = li.nextElementSibling;

                if (sibling != null && sibling.tagName.toLowerCase() == 'ul') {
                    li.insertAdjacentHTML('afterbegin', caretIcon);
                    li.querySelector(".collapsible-list-caret").addEventListener('click', onCollapsibleListCaretClick);
                }
            }

            collapsibleListSetAllCarets(listRoot, false);
        }

        var listActions = document.querySelectorAll("[data-list-action]");

        for (const actionElem of listActions) {
            var action = actionElem.getAttribute("data-list-action");

            if (action == 'collapse-all') {
                actionElem.addEventListener('click', onCollapsibleListCollapseAll);
            } else if (action == 'expand-all') {
                actionElem.addEventListener('click', onCollapsibleListExpandAll)
            }
        }
    }

    function collapsibleListSetCaret(caret, open) {

        var li = caret.closest("li");

        var children = li && li.nextElementSibling;

        if (li != null && children != null) {
            var classToAdd = open ? 'open' : 'closed';
            var classToRemove = open ? 'closed' : 'open';

            caret.classList.add("caret-" + classToAdd);
            caret.classList.remove("caret-" + classToRemove);

            children.classList.add("children-" + classToAdd);
            children.classList.remove("children-" + classToRemove);
        }
    }


    function collapsibleListSetAllCarets(list, open) {

        var listCarets = list.querySelectorAll(".collapsible-list-caret");

        for (const caret of listCarets) {
            collapsibleListSetCaret(caret, open);
        }
    }


    function onCollapsibleListCaretClick(event) {
        var caret = event.target.closest(".collapsible-list-caret");

        var isOpen = caret.classList.contains('caret-open');

        collapsibleListSetCaret(caret, !isOpen);
    }

    function onCollapsibleListCollapseAll(event) {
        var link = event.target.closest("[data-list-selector]");

        var listSelector = link.getAttribute('data-list-selector');

        collapsibleListSetAllCarets(document.querySelector(listSelector), false);
    }

    function onCollapsibleListExpandAll(event) {
        var link = event.target.closest("[data-list-selector]");

        var listSelector = link.getAttribute('data-list-selector');

        collapsibleListSetAllCarets(document.querySelector(listSelector), true);
    }

    initCollapsibleLists();

    // DATA GRID
    function initCollapsibleDataGrids() {
        var caretIcon = '<svg class="collapsible-data-grid-caret caret-open" margin-left: -17px;" width=13 height=13 class="icon-caret" clip-rule="evenodd" fill-rule="evenodd" stroke-linejoin="round" stroke-miterlimit="2" viewBox="5 5 14 14" xmlns="http://www.w3.org/2000/svg"><path d="m16.843 10.211c.108-.141.157-.3.157-.456 0-.389-.306-.755-.749-.755h-8.501c-.445 0-.75.367-.75.755 0 .157.05.316.159.457 1.203 1.554 3.252 4.199 4.258 5.498.142.184.36.29.592.29.23 0 .449-.107.591-.291 1.002-1.299 3.044-3.945 4.243-5.498z"/></svg>';

        var collapsibleDataGrids = document.querySelectorAll("table.collapsible-data-grid");

        for (const gridRoot of collapsibleDataGrids) {
            for (const td of gridRoot.querySelectorAll("td.data-grid-caret-column")) {
                var tr = td.closest('tr');

                var id = tr.getAttribute('data-grid-row-id');

                var children = gridRoot.querySelectorAll('tr[data-grid-parent-row-id="' + id + '"]');

                if (children != null && children.length > 0) {
                    td.insertAdjacentHTML('afterbegin', caretIcon);
                    td.querySelector(".collapsible-data-grid-caret").addEventListener('click', onCollapsibleDataGridCaretClick);
                }
            }

            collapsibleDataGridSetAllCarets(gridRoot, false);
        }

        var gridActions = document.querySelectorAll("[data-grid-action]");

        for (const actionElem of gridActions) {
            var action = actionElem.getAttribute("data-grid-action");

            if (action == 'collapse-all') {
                actionElem.addEventListener('click', onCollapsibleDataGridCollapseAll);
            } else if (action == 'expand-all') {
                actionElem.addEventListener('click', onCollapsibleDataGridExpandAll)
            }
        }
    }

    function collapsibleDataGridSetCaret(caret, open) {
        var tr = caret.closest("tr");

        var id = tr.getAttribute('data-grid-row-id');

        var gridRoot = tr.closest("table");

        var children = gridRoot.querySelectorAll('tr[data-grid-parent-row-id="' + id + '"]');

        if (children != null && children.length > 0) {
            var classToAdd = open ? 'open' : 'closed';
            var classToRemove = open ? 'closed' : 'open';

            tr.classList.add(classToAdd);
            tr.classList.remove(classToRemove);

            caret.classList.add("caret-" + classToAdd);
            caret.classList.remove("caret-" + classToRemove);

            for (const child of children) {
                collapsibleDataGridSetChild(child, open);
            }
        }
    }

    function collapsibleDataGridSetChild(tr, open) {
        var id = tr.getAttribute('data-grid-row-id');

        var gridRoot = tr.closest("table");

        var classToAdd = open ? 'open' : 'closed';
        var classToRemove = open ? 'closed' : 'open';

        tr.classList.add("parent-" + classToAdd);
        tr.classList.remove("parent-" + classToRemove);

        var caret = tr.querySelector("td .collapsible-data-grid-caret")

        if (caret != null) {
            var isOpen = caret.classList.contains('caret-open');

            if (isOpen) {
                var children = gridRoot.querySelectorAll('tr[data-grid-parent-row-id="' + id + '"]');

                if (children != null && children.length > 0) {
                    for (const child of children) {
                        collapsibleDataGridSetChild(child, open);
                    }
                }
            }
        }
    }


    function collapsibleDataGridSetAllCarets(list, open) {
        var listCarets = list.querySelectorAll(".collapsible-data-grid-caret");

        for (const caret of listCarets) {
            collapsibleDataGridSetCaret(caret, open);
        }
    }

    function onCollapsibleDataGridCaretClick(event) {
        var caret = event.target.closest(".collapsible-data-grid-caret");

        var isOpen = caret.classList.contains('caret-open');

        collapsibleDataGridSetCaret(caret, !isOpen);
    }

    function onCollapsibleDataGridCollapseAll(event) {
        var link = event.target.closest("[data-grid-selector]");

        var gridSelector = link.getAttribute('data-grid-selector');

        collapsibleDataGridSetAllCarets(document.querySelector(gridSelector), false);
    }

    function onCollapsibleDataGridExpandAll(event) {
        var link = event.target.closest("[data-grid-selector]");

        var gridSelector = link.getAttribute('data-grid-selector');

        collapsibleDataGridSetAllCarets(document.querySelector(gridSelector), true);
    }

    initCollapsibleDataGrids();
</script>

<script>
function initTabBars() {
    var tabBars = document.querySelectorAll(".tabbar");

    for (const tabBarRoot of tabBars) {
        for (const tab of tabBarRoot.querySelectorAll(".tab")) {
            tab.addEventListener('click', onTabBarClick);
        }
    }
}

function onTabBarClick(event) {
    var tab = event.target.closest(".tab");

    var isActive = tab.classList.contains("active");

    if (!isActive) {
        var tabbar = tab.closest(".tabbar");

        var allTabs = tabbar.querySelectorAll(".tab");

        for (const otherTab of allTabs) {
            if (otherTab != tab) {
                otherTab.classList.remove("active");
            }
        }

        tab.classList.add("active");

        var context = tab.getAttribute("data-tab-context");
        var callback = tabbar.getAttribute("data-tab-callback");

        window[callback](context, tab);
    }
}

function onViewSelected(idsString, tab) {
    var hiddenWorkItems = document.querySelectorAll(".view-workitem-hidden, .view-workitem-faded");

    for (var elem of hiddenWorkItems) {
        elem.classList.remove("view-workitem-hidden");
        elem.classList.remove("view-workitem-faded");
    }

    let grid = document.querySelector("#toc-grid");
    let list = document.querySelector("#toc-list");

    if (idsString == "all") {
        // Collapse all work items in the TOC
        if (grid != null) collapsibleDataGridSetAllCarets(grid, false);
        if (list != null) collapsibleListSetAllCarets(list, false);

        return;
    }

    // Expand all work items in the TOC
    if (grid != null) collapsibleDataGridSetAllCarets(grid, true);
    if (list != null) collapsibleListSetAllCarets(list, true);

    var ids = new Set(idsString.split(",").map(id => id.trim()));

    // Hide work items contents
    for (const workItem of document.querySelectorAll("article.workitem")) {
        var workItemId = workItem.getAttribute("data-wi-id");

        if (!ids.has(workItemId.trim())) {
            workItem.classList.add("view-workitem-hidden");
        }
    }

    // Hide work item rows in Grid Table Of Contents
    var gridParentsFaded = new Set();
    for (const workItem of document.querySelectorAll("#toc-grid tr[data-grid-row-id]")) {
        var workItemId = workItem.getAttribute("data-grid-row-id")?.trim();

        // If this work item row was faded, skip it:
        //   we already know that it is not in this view, but one of its children is
        if (gridParentsFaded.has(workItemId)) {
            continue;
        }

        if (!ids.has(workItemId)) {
            workItem.classList.add("view-workitem-hidden");
        } else {
            // If this work item is included in the view, we need to check its ancestors
            // If they are included in the view, we do nothing. If they are not, we fade them
            var parentId = workItem.getAttribute("data-grid-parent-row-id")?.trim();

            while (parentId != null && parentId != "") {
                // If this work item is part of the view, stop the fading process
                // It should be visibly, and it itself will handle the  fading of its ancestors
                if (ids.has(parentId)) {
                    break;
                }

                if (gridParentsFaded.has(parentId)) {
                    break;
                }

                var parentRow = document.querySelector('#toc-grid tr[data-grid-row-id="' + parentId + '"]');

                parentRow.classList.add("view-workitem-faded");
                parentRow.classList.remove("view-workitem-hidden");

                gridParentsFaded.add(parentId);

                parentId = parentRow.getAttribute("data-grid-parent-row-id")?.trim();
            }
        }
    }

    // Fade work item parents in Grid Table Of Contents
    var workItemRowsWithCarets = document.querySelectorAll("#toc-grid tr[data-grid-row-id]:has(.collapsible-data-grid-caret)");
    for (const workItem of workItemRowsWithCarets) {
        var workItemId = workItem.getAttribute("data-grid-row-id")?.trim();

        var childWorkItems = document.querySelectorAll('#toc-grid tr[data-grid-parent-row-id="' + workItemId + '"]');

        var areChildrenVisible = false;

        for (const childWorkItem of childWorkItems) {
            var childWorkItemId = childWorkItem.getAttribute("data-grid-row-id")?.trim();

            if (ids.has(childWorkItemId)) {
                areChildrenVisible = true;
                break;
            }
        }

        if (!areChildrenVisible) {
            var caret = workItem.querySelector(".collapsible-data-grid-caret");

            caret.classList.add("view-workitem-hidden");
        }
    }

    // Hide work item rows in List Table Of Contents
    var listParentsFaded = new Set();
    for (const workItem of document.querySelectorAll("#toc-list li[data-list-item-id]")) {
        var workItemId = workItem.getAttribute("data-list-item-id")?.trim();

        // If this work item item was faded, skip it:
        //   we already know that it is not in this view, but one of its children is
        if (listParentsFaded.has(workItemId)) {
            continue;
        }

        if (!ids.has(workItemId)) {
            workItem.classList.add("view-workitem-hidden");
        } else {
            // If this work item is included in the view, we need to check its ancestors
            // If they are included in the view, we do nothing. If they are not, we fade them
            var parentId = workItem.getAttribute("data-list-parent-item-id")?.trim();

            while (parentId != null && parentId != "") {
                // If this work item is part of the view, stop the fading process
                // It should be visibly, and it itself will handle the  fading of its ancestors
                if (ids.has(parentId)) {
                    break;
                }

                if (listParentsFaded.has(parentId)) {
                    break;
                }

                var parentItem = document.querySelector('#toc-list li[data-list-item-id="' + parentId + '"]');

                parentItem.classList.add("view-workitem-faded");
                parentItem.classList.remove("view-workitem-hidden");

                listParentsFaded.add(parentId);

                parentId = parentItem.getAttribute("data-list-parent-item-id")?.trim();
            }
        }
    }

    // Hide work item carets in List Table Of Contents
    var workItemItemsWithCarets = document.querySelectorAll("#toc-list li[data-list-item-id]:has(.collapsible-list-caret)");
    for (const workItem of workItemItemsWithCarets) {
        var workItemId = workItem.getAttribute("data-list-item-id")?.trim();

        var childWorkItems = document.querySelectorAll('#toc-list tr[data-list-parent-item-id="' + workItemId + '"]');

        var areChildrenVisible = false;

        for (const childWorkItem of childWorkItems) {
            var childWorkItemId = childWorkItem.getAttribute("data-list-item-id")?.trim();

            if (ids.has(childWorkItemId)) {
                areChildrenVisible = true;
                break;
            }
        }

        if (!areChildrenVisible) {
            var caret = workItem.querySelector(".collapsible-list-caret");

            caret.classList.add("view-workitem-hidden");
        }
    }
}

initTabBars();
</script>
`;

const HTMLStylesheetOverrides = `
html {
    scroll-padding-top: 70px;
}

body {
  text-align: left;
  margin: 0 0 1rem;
  max-width: 100%;
}

div.centered-layout {
    margin: 6rem auto 1rem;
    max-width: 48rem;
}

strong {
    font-weight: 700;
}

hr.end-of-work-item {
    width: 100%;
    border: 0;
    height: 0px;
    background-image: linear-gradient(to right, rgba(0, 0, 0,0.0), rgba(0, 0, 0, 0.15), rgba(0, 0, 0, 0));
    margin-top: 50px;
    margin-bottom: 50px;
}

.icon-small-button {
    fill: #c7c7c7;
    stroke: #c7c7c7;
    cursor: pointer;

    transition: 0.25s ease-in-out fill, 0.25s ease-in-out stroke;
}

.icon-small-button:hover {
    fill: #646464;
    stroke: #646464;
}

.collapsible-list .collapsible-list-caret {
    fill: #c7c7c7;
    margin-left: -17px;
    cursor: pointer;

    transition: 0.25s ease-in-out transform, 0.25s ease-in-out fill;
}

.collapsible-list .collapsible-list-caret:hover {
    fill: #646464;
}

.collapsible-list .collapsible-list-caret.caret-open {
    transform: rotate(0deg);
}

.collapsible-list .collapsible-list-caret.caret-closed {
    transform: rotate(-90deg);
}

.collapsible-list ul.children-open {
    display: auto;
}

.collapsible-list ul.children-closed {
    display: none;
}

.collapsible-data-grid .collapsible-data-grid-caret {
    fill: #c7c7c7;
    margin-left: -17px;
    cursor: pointer;

    transition: 0.25s ease-in-out transform, 0.25s ease-in-out fill;
}

.collapsible-data-grid .collapsible-data-grid-caret:hover {
    fill: #646464;
}

.collapsible-data-grid .collapsible-data-grid-caret.caret-open {
    transform: rotate(0deg);
}

.collapsible-data-grid .collapsible-data-grid-caret.caret-closed {
    transform: rotate(-90deg);
}

.collapsible-data-grid tr.parent-open {
    display: auto;
}

.collapsible-data-grid tr.parent-closed {
    display: none;
}

article > h1, article > h2, article > h3, article > h4, article > h5 {
    margin-top: 0;
    word-break: break-word;
}

section[data-wi-field-name] img {
    border-radius: 0;
    max-width: 100%;
    height: auto;
    width: auto;
}

section.workitem-metadata {
    box-sizing: border-box;
    /*margin-left: calc((99vw - 100%) / 2 * -1);
    margin-right: calc((99vw - 100%) / 2 * -1);*/
    margin-bottom: 15px;
}
section.workitem-metadata table {
    table-layout: fixed;
    width: 100%;
    border-collapse: collapse;
    background-color: rgb(248, 248, 248);
    border-top: 1px solid rgba(234, 234, 234, 1);
    border-bottom: 1px solid rgba(234, 234, 234, 1);
}

section.workitem-metadata > table tr td {
    vertical-align: top;
    padding: 3px 8px;
}

section.workitem-metadata > table tr td > section {
    margin: 0;
}

section.workitem-metadata > table tr td > section > strong {
    margin-right: 10px;
}

section.workitem-metadata > table tr td > section > p {
    margin: 0;
}

section.workitem-metadata .state-indicator {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
}

section.workitem-metadata .state-indicator.active {
    border-color: rgb(0, 122, 204);
    background-color: rgb(0, 122, 204);
}

table.data-grid {
    table-layout: auto;
    width: 100%;
}

table.data-grid tr:hover {
    background-color: rgb(244, 244, 244)
}

table.data-grid tr td, table.data-grid tr th {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 3px 5px;
    max-width: 0;
}

table.data-grid tr td.level-0 {
    padding-left: 16px;
}

table.data-grid tr td.level-1 {
    padding-left: 32px;
}

table.data-grid tr td.level-2 {
    padding-left: 48px;
}

table.data-grid tr td .state-indicator {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
}

.views {
    text-align: center;
}

.views a.tab {
    display: inline-block;
    padding: 0 8px;
    color: rgba(0, 0, 0, 0.9);
    padding-top: 10px;
    padding-bottom: 10px;
    cursor: pointer;
    margin-bottom: 10px;
    margin-right: 10px;
    border-bottom: 2px solid transparent;

    transition: color ease-in-out 0.25s, background-color ease-in-out 0.25s;
}

.views a.active {
    font-weight: 600;
    border-bottom: 2px solid rgba(0, 120, 212, 1);
}

.view-workitem-hidden {
    display: none;
    visibility: hidden;
}

.view-workitem-faded {
    opacity: 0.3;
}

a#back-to-top {
    position: fixed;
    bottom: 10px;
    right: 20px;
    opacity: 0.1;
    transition: opacity ease-in-out 0.25s;
    cursor: pointer;
}

a#back-to-top:hover {
    opacity: 0.5;
}

header h1 {
    text-align: center;
    margin-top: 40px;
}

.padding-body {
    margin: 0 2rem;
}

.brands {
    position: sticky;
    top: 0;
    background-color: #FFF;
    z-index: 10;

    box-shadow: var(--border-subtle-color,rgba(0, 0, 0, .08)) 0 1px 0;
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    padding: 15px 25px;
}

.brands > .brand {
    flex: 0 1 auto;
    display: flex;
    flex-direction: row;
    align-items: center;
    font-size: 1.7rem;
    font-weight: 600;
    color: #005b9d;
}

.brands > .brand img {
    height: 30px;
    width: auto;
    border-radius: 0;
}

section.appendix {
    margin: 0 0 4rem;
}

.from-markdown table {
    table-layout: auto;
    width: 100%;
}
`;

const HTMLStylesheetAir = `@media print {
    *,
    *:before,
    *:after {
      background: transparent !important;
      color: #000 !important;
      box-shadow: none !important;
      text-shadow: none !important;
    }

    a,
    a:visited {
      text-decoration: underline;
    }

    a[href]:after {
      content: " (" attr(href) ")";
    }

    abbr[title]:after {
      content: " (" attr(title) ")";
    }

    a[href^="#"]:after,
    a[href^="javascript:"]:after {
      content: "";
    }

    pre,
    blockquote {
      border: 1px solid #999;
      page-break-inside: avoid;
    }

    thead {
      display: table-header-group;
    }

    tr,
    img {
      page-break-inside: avoid;
    }

    img {
      max-width: 100% !important;
    }

    p,
    h2,
    h3 {
      orphans: 3;
      widows: 3;
    }

    h2,
    h3 {
      page-break-after: avoid;
    }
  }

  html {
    font-size: 12px;
  }

  @media screen and (min-width: 32rem) and (max-width: 48rem) {
    html {
      font-size: 15px;
    }
  }

  @media screen and (min-width: 48rem) {
    html {
      font-size: 16px;
    }
  }

  body {
    line-height: 1.85;
  }

  p,
  .air-p {
    font-size: 1rem;
    margin-bottom: 1.3rem;
  }

  h1,
  .air-h1,
  h2,
  .air-h2,
  h3,
  .air-h3,
  h4,
  .air-h4 {
    margin: 1.414rem 0 .5rem;
    font-weight: inherit;
    line-height: 1.42;
  }

  h1,
  .air-h1 {
    margin-top: 0;
    font-size: 3.998rem;
  }

  h2,
  .air-h2 {
    font-size: 2.827rem;
  }

  h3,
  .air-h3 {
    font-size: 1.999rem;
  }

  h4,
  .air-h4 {
    font-size: 1.414rem;
  }

  h5,
  .air-h5 {
    font-size: 1.121rem;
  }

  h6,
  .air-h6 {
    font-size: .88rem;
  }

  small,
  .air-small {
    font-size: .707em;
  }

  /* https://github.com/mrmrs/fluidity */

  img,
  canvas,
  iframe,
  video,
  svg,
  select,
  textarea {
    max-width: 100%;
  }

  @import url(http://fonts.googleapis.com/css?family=Open+Sans:300italic,300);

  body {
    color: #444;
    font-family: 'Open Sans', Helvetica, sans-serif;
    font-weight: 300;
    margin: 6rem auto 1rem;
    max-width: 48rem;
    text-align: center;
  }

  img {
    border-radius: 50%;
    height: 200px;
    margin: 0 auto;
    width: 200px;
  }

  a,
  a:visited {
    color: #3498db;
  }

  a:hover,
  a:focus,
  a:active {
    color: #2980b9;
  }

  pre {
    background-color: #fafafa;
    padding: 1rem;
    text-align: left;
  }

  blockquote {
    margin: 0;
    border-left: 5px solid #7a7a7a;
    font-style: italic;
    padding: 1.33em;
    text-align: left;
  }

  ul,
  ol,
  li {
    text-align: left;
  }

  p {
    color: #777;
  }
  ${HTMLStylesheetOverrides}`;
