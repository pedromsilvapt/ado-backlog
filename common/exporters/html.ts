import { BacklogWorkItem, BacklogWorkItemType } from '../model';
import * as fs from 'fs/promises';
import TurndownService from 'turndown';
import { Exporter, ExporterOptions } from './exporter';
import { TableCellAlignment, TableOfContentsMode, TemplateBlockConfig, TemplateConfig, TemplateLinksConfig, TemplateMetadataColumnConfig, TemplateMetadataConfig, TemplateMetadataRowConfig, TemplateSectionConfig, TemplateTagsConfig } from '../config';
import * as he from 'he';
import * as cheerio from 'cheerio';
import * as luxon from 'luxon';

export class HTMLExporter extends Exporter {
    protected turndownService = new TurndownService();

    public async run(output: string, options: ExporterOptions = {}): Promise<void> {
        if (output == null) {
            throw new Error(`Argument 'output' cannot be null.`);
        }

        if (options == null) {
            throw new Error(`Argument 'options' cannot be null.`);
        }

        if (await fs.access(output).catch(() => false)) {
            if (options.overwrite) {
                await fs.rm(output, { recursive: true, force: true } as any);
            } else {
                throw new Error(`Output file '${output}' already exists. Pass the '--overwrite' argument to delete the file and write again.`);
            }
        }

        const buffer: string[] = [];
        buffer.push(`<!doctype html>
        <html lang="en">
        <head>
        <meta charset="UTF-8">
        <title>${this.backlog.config.name}</title>
        <style>${HTMLStylesheetAir}</style>
        </head>
        <body>\n`);

        await this.exportHeader(buffer);

        await this.exportTableOfContents(buffer);

        buffer.push(`<div class="centered-layout">`);

        await this.backlog.visitAsync(wi => this.exportWorkItem(buffer, wi));

        await this.exportFooter(buffer);

        buffer.push(`</div>`);

        buffer.push(HTMLScript);

        buffer.push(`
        </body>
        </html>`);

        await fs.writeFile(output, buffer.join(''), { encoding: 'utf8' });
    }

    public tagIcon = `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" xmlns:xlink="http://www.w3.org/1999/xlink" enable-background="new 0 0 512 512">
    <g>
      <path d="m368.4,90.3c-30.3,0-54.9,24.6-54.9,54.9s24.6,54.9 54.9,54.9c30.3,0 54.9-24.6 54.9-54.9s-24.6-54.9-54.9-54.9zm0,69.1c-7.8,0-14.2-6.3-14.2-14.2s6.3-14.2 14.2-14.2c7.8,0 14.2,6.3 14.2,14.2s-6.4,14.2-14.2,14.2z"/>
      <path d="m54.4,312.2l142.4,144.5 262.8-259-22.9-119.7-119.4-24.8-262.9,259h2.13163e-14zm142.4,188c-9.2,0-17.9-3.6-24.4-10.2l-151.6-153.9c-13.2-13.4-13.1-35.1 0.4-48.4l270-266c8.1-8 19.9-11.5 31-9.1l127,26.4c13.6,2.8 24,13.5 26.7,27.1l24.5,127.4c2.2,11.3-1.4,22.8-9.6,30.9l-270,266c-6.4,6.3-15,9.8-24,9.8z"/>
    </g>
  </svg>`;

    public expandIcon = `<svg fill="#000000" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <g> <path d="M12.36,1H3.64A2.64,2.64,0,0,0,1,3.64v8.72A2.64,2.64,0,0,0,3.64,15h8.72A2.64,2.64,0,0,0,15,12.36V3.64A2.64,2.64,0,0,0,12.36,1ZM13.6,12.36a1.25,1.25,0,0,1-1.24,1.24H3.64A1.25,1.25,0,0,1,2.4,12.36V3.64A1.25,1.25,0,0,1,3.64,2.4h8.72A1.25,1.25,0,0,1,13.6,3.64ZM8.7,4H7.3V7.31H4v1.4H7.3V12H8.7V8.71H12V7.31H8.7Z"></path> </g> </g></svg>`;

    public collapseIcon = `<svg fill="#000000" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <g> <path d="M12.36,1H3.64A2.64,2.64,0,0,0,1,3.64v8.72A2.64,2.64,0,0,0,3.64,15h8.72A2.64,2.64,0,0,0,15,12.36V3.64A2.64,2.64,0,0,0,12.36,1ZM13.6,12.36a1.25,1.25,0,0,1-1.24,1.24H3.64A1.25,1.25,0,0,1,2.4,12.36V3.64A1.25,1.25,0,0,1,3.64,2.4h8.72A1.25,1.25,0,0,1,13.6,3.64ZM4,8.71h8V7.31H4Z"></path> </g> </g></svg>`;

    protected getIcon(iconSvg: string, size: number = 13): string {
        // **NOTE** Important one white space at the end!
        return `<span style="display: inline-block; width: ${size}px; height: ${size}px">${iconSvg}</span> `;
    }

    protected async exportWorkItemField(buffer: string[], workItem: BacklogWorkItem, field: string, richText: boolean = false) {
        const value = workItem.workItem.fields?.[field];

        if (value != null && value != "") {
            // TODO Remove hard-coded type validation
            if (field == 'System.State') {
                const color = this.backlog.workItemStateColors[workItem.type][value];

                buffer.push(`<span class="state-indicator" style="background-color: #${color}"></span> ${value}`);
            } else if (field == 'System.ChangedDate') {
                var date = new Date(value);

                var shortDate = date.toLocaleDateString('en-us', { weekday:"long", year:"numeric", month:"short", day:"numeric"});
                var longDate = date.toLocaleString();

                buffer.push(`<span title=${JSON.stringify(longDate)}>${shortDate}</span>`)
            } else if (richText) {
                var dom = cheerio.load(value ?? '');

                for (const imgElem of dom('img')) {
                    var src = dom(imgElem).attr('src');

                    if (src != null) {
                        // TODO Test src http if it matches TFS url
                        var imageStream = await this.azure.downloadAttachmentUrlBase64(src);

                        dom(imgElem).attr('src', imageStream);
                    }
                }

                buffer.push(dom.html());
            } else if (typeof value === 'string') {
                buffer.push(he.encode(value));
            } else {
                buffer.push(value ?? '');
            }
        }
    }

    protected async exportHeader(buffer: string[]) {
        buffer.push(`<header id="top">
        <h1 style="text-align: center">${this.backlog.config.name}</h1>
        <p style="text-align: center; margin-top: 0;"><small>${luxon.DateTime.now().toFormat("DDDD")}</small></p>
        <p style="text-align: center; margin-top: 0;">`);

        for (const wit of this.backlog.getDistinctUsedWorkItemTypes()) {
            buffer.push(`<span title=${JSON.stringify(wit.name)}>`);
            buffer.push(this.getIcon(wit.icon));
            buffer.push(`</span>`);
        }

        buffer.push(`</p>\n</header>\n`);
    }

    protected async exportTableOfContents(buffer: string[]) {
        const tocConfig = this.backlog.toc;

        if (tocConfig.mode == TableOfContentsMode.List) {
            await this.exportTableOfContentsList(buffer);
        } else if (tocConfig.mode == TableOfContentsMode.Grid) {
            await this.exportTableOfContentsDataGrid(buffer);
        } else {
            this.logger.error(`Invalid TableOfContentsMode '${tocConfig.mode}', expected '${TableOfContentsMode.List}' or '${TableOfContentsMode.Grid}'`);
        }
    }

    protected async exportTableOfContentsDataGrid(buffer: string[]) {
        const tocConfig = this.backlog.toc;

        buffer.push(`<nav id="toc">`);

        if (!tocConfig.hideHeader) {
            buffer.push(`<h1>Table of Contents</h1>\n`);
        }

        // buffer.push(`
        // <p style="text-align: right; margin: 0; margin-bottom: 5px;">
        //     <a data-grid-action="collapse-all" data-grid-selector="#toc-grid" style="cursor: pointer">Collapse All</a>
        //     <a data-grid-action="expand-all" data-grid-selector="#toc-grid" style="cursor: pointer">Expand All</a>
        // </p>`);

        buffer.push(`<table id="toc-grid" class="data-grid collapsible-data-grid">
            <thead>
                <tr>
                    <th>
                        <span title="Expand All" data-grid-action="expand-all" data-grid-selector="#toc-grid" class="icon-small-button">${this.getIcon(this.expandIcon)}</span>
                        <span title="Collapse All" data-grid-action="collapse-all" data-grid-selector="#toc-grid" class="icon-small-button">${this.getIcon(this.collapseIcon)}</span>
                        Title
                    </th>\n`);

        for (const value of tocConfig.values) {
            buffer.push(`<th title=${JSON.stringify(value.header)} style="width: ${value.width ?? 'auto'}; max-width: ${value.width ?? 'auto'};">${value.header}</th>`);
        }

        buffer.push(`</tr>
            </thead>
            <tbody>
        `);

        let depth = 0;
        const ancestors: BacklogWorkItem[] = [];

        await this.backlog.visitAsync(async (wi, end) => {
            if (!end) {
                const workItemType = this.backlog.getWorkItemType(wi.type);

                if (ancestors.length == 0) {
                    buffer.push(`<tr data-grid-row-id="${wi.id}" data-grid-row-level="${depth}">`);
                } else {
                    const parentWi = ancestors[ancestors.length - 1];

                    buffer.push(`<tr data-grid-row-id="${wi.id}" data-grid-parent-row-id="${parentWi.id}" data-grid-row-level="${depth}">`);
                }

                buffer.push(`
                    <td class="data-grid-caret-column" style="padding-left: ${16 * (depth + 1)}px">
                        ${this.getIcon(workItemType.icon)} ${wi.id} <a href="#${wi.id}">${he.encode(wi.title)}</a>
                    </td>
                `);


                for (const value of tocConfig.values) {
                    buffer.push(`<td style="text-align: ${value.align ?? TableCellAlignment.Left}">`);
                    await this.exportWorkItemField(buffer, wi, value.field, false);
                    buffer.push(`</td>`);
                }


                buffer.push(`</tr>\n`);

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
        buffer.push(`</table>`);

        buffer.push(`<hr class="end-of-work-item" />
        </nav>\n`);

        buffer.push(`</div>`);
    }

    protected async exportTableOfContentsList(buffer: string[]) {
        buffer.push(`<div class="centered-layout">`);

        buffer.push(`<nav id="toc">
        <h1>Table of Contents</h1>\n`);

        buffer.push(`
        <p style="text-align: right; margin: 0; margin-bottom: 5px;">
            <span title="Expand All" data-list-action="expand-all" data-list-selector="#toc-list" class="icon-small-button">${this.getIcon(this.expandIcon)}</span>
            <span title="Collapse All" data-list-action="collapse-all" data-list-selector="#toc-list" class="icon-small-button">${this.getIcon(this.collapseIcon)}</span>
        </p>`);

        buffer.push(`<ul id="toc-list" style="margin-top: 5px;" class="collapsible-list">`);
        this.backlog.visit((wi, end) => {
            if (!end) {
                const workItemType = this.backlog.getWorkItemType(wi.type);

                buffer.push(`<li style="list-style-type: none">
                ${this.getIcon(workItemType.icon)} ${wi.id} <a href="#${wi.id}">${he.encode(wi.title)}</a></li>`)

                if (wi.hasChildren && wi.children.length > 0) {
                    buffer.push(`<ul style="margin-top: 5px;">`);
                }
            } else {
                if (wi.hasChildren && wi.children.length > 0) {
                    buffer.push(`</ul>`);
                }
            }
        }, /* root: */ null, /* visitEnd: */ true);
        buffer.push(`</ul>`);

        buffer.push(`<hr class="end-of-work-item" />
        </nav>\n`);

        buffer.push(`</div>`);
    }

    protected async exportFooter(buffer: string[]) {
        buffer.push(`<footer style="text-align: center; color: gray">
            Critical Manufacturing. Document generated in ${luxon.DateTime.now().toFormat("DDDD")}.
        </footer>`);
    }

    protected async exportWorkItemTemplate(buffer: string[], template: TemplateConfig, workItem: BacklogWorkItem) {
        const level = 2;

        const workItemType = this.backlog.getWorkItemType(workItem.type);

        buffer.push(`<article class="" id="${workItem.id}" data-wi-id="${workItem.id}" data-wi-title=${JSON.stringify(workItem.title)} class="workitem ${workItem.typeSlug}">\n`);
        buffer.push(`<p style="margin-bottom: 0; margin-top: 0;">
        ${this.getIcon(workItemType.icon)}
        ${workItem.type.toUpperCase()} ${workItem.id}
        </p>\n`);
        buffer.push(`<h${level}>${workItem.title}</h${level}>\n`);

        for (const block of template.blocks) {
            await this.exportWorkItemTemplateBlock(buffer, block, workItem, level + 1, {});
        }

        buffer.push(`<hr class="end-of-work-item" />\n`);
        buffer.push(`</article>\n`);
    }

    protected async exportWorkItemTemplateBlock(buffer: string[], block: TemplateBlockConfig, workItem: BacklogWorkItem, level: number, options : BlockRenderOptions) {
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

    protected async exportWorkItemTemplateTags(buffer: string[], block: TemplateTagsConfig, workItem: BacklogWorkItem, level: number, options : BlockRenderOptions) {
        const tags = workItem.tags;

        if (tags != null && tags.length > 0) {
            const margin = options.inline ? 0 : 8;
            buffer.push(`<section data-wi-tags style="margin-bottom: ${margin}px;">
                <strong>Tags</strong>
                ${this.getIcon(this.tagIcon)} ${tags.join(', ')}
            </section>`);
        }
    }

    protected async exportWorkItemTemplateLinks(buffer: string[], block: TemplateLinksConfig, workItem: BacklogWorkItem, level: number, options : BlockRenderOptions) {
        const links = this.backlog.getLinks([workItem], block.relations);

        if (links.length > 0) {
            if (block.single) {
                buffer.push(`<section data-wi-links>`);

                if (!options.inline) {
                    buffer.push(`<p style="margin-bottom: 0">`);
                }

                buffer.push(`    <strong style="margin-right: 7px">${block.label}</strong>
                `);

                const relatedWorkItem = links[0];

                const workItemType = this.backlog.getWorkItemType(relatedWorkItem.type);

                buffer.push(`
                    ${this.getIcon(workItemType.icon)} <span style="color: #868686">${relatedWorkItem.id}</span> <a href="#${relatedWorkItem.id}">${he.encode(relatedWorkItem.title)}</a>
                `);

                if (!options.inline) {
                    buffer.push(`</p>`);
                }

                buffer.push(`</section>\n`);
            } else {
                buffer.push(`<section data-wi-links>
                    <p style="margin-bottom: 0"><strong>${block.label}</strong></p>
                    <ul style="margin-top: 5px;">\n`);

                for (const relatedWorkItem of links) {
                    const workItemType = this.backlog.getWorkItemType(relatedWorkItem.type);

                    buffer.push(`
                        <li style="list-style-type: none">
                        ${this.getIcon(workItemType.icon)} <span style="color: #868686">${relatedWorkItem.id}</span> <a href="#${relatedWorkItem.id}">${he.encode(relatedWorkItem.title)}</a></li>
                    `);
                }
                buffer.push(`
                    </ul>
                </section>\n`);
            }
        }
    }

    protected async exportWorkItemTemplateSection(buffer: string[], block: TemplateSectionConfig, workItem: BacklogWorkItem, level: number, options : BlockRenderOptions) {
        var fieldBuffer: string[] = [];

        await this.exportWorkItemField(fieldBuffer, workItem, block.field, block.richText);

        if (fieldBuffer.length > 0) {
            buffer.push(`<section data-wi-field-name=${JSON.stringify(block.field)}>`);

            if (block.header != null) {
                if (options.inline) {
                    buffer.push(`<strong>${block.header}</strong>`);
                } else {
                    buffer.push(`<h${level}>${block.header}</h${level}>`);
                }
            }

            buffer.push(...fieldBuffer);

            buffer.push(`</section>`);
        }
    }

    protected async exportWorkItemTemplateMetadata(buffer: string[], block: TemplateMetadataConfig, workItem: BacklogWorkItem, level: number, options : BlockRenderOptions) {
        const columns = block.columns;

        const cells = (await Promise.all(block.cells.map(async cell => {
            const cellBuffer: string[] = [];

            if (cell.blocks) {
                for (const block of cell.blocks) {
                    await this.exportWorkItemTemplateBlock(cellBuffer, block, workItem, level, { ...options, inline: true });
                }
            }

            return { cell, cellBuffer };
        }))).filter(cell => cell.cellBuffer.length > 0);

        if (cells.length > 0) {
            buffer.push(`<section data-wi-metadata class="workitem-metadata">
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
                    buffer.push(`\n<tr>\n`);
                    startRow = false;
                }

                buffer.push(`<td colspan="${columnSpan}">`);
                buffer.push(...cellBuffer);
                buffer.push(`</td>`);

                columnOffset += columnSpan;

                if (endRow) {
                    buffer.push(`\n</tr>\n`);
                    endRow = false;
                    startRow = true;
                    columnOffset = 0;
                }
            }

            buffer.push(`
                </table>
            </section>`);
        }
    }

    protected async exportWorkItem(buffer: string[], workItem: BacklogWorkItem, level: number = 1) {
        const template = this.templates.find(tpl => tpl.workItemType == workItem.type);

        if (template == null) {
            throw new Error(`Could not find template "${workItem.type}"`);
        }

        await this.exportWorkItemTemplate(buffer, template, workItem);
    }
}

export interface BlockRenderOptions {
    inline?: boolean;
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
</script>`;

const HTMLStylesheetOverrides = `
body {
  text-align: left;
  margin: 6rem 2rem 1rem;
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
