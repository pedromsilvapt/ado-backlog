import { KDLFormat } from '@gallant/config';
import {
    Tag, Any, Child, Children, Property, Value, Optional, Default, SchemaUtils, Values
} from '@gallant/config/kdl';

export class ApiConfig {
    @Property("organizationUrl", String)
    organizationUrl!: string;

    @Property("deployementUrl", String)
    deployementUrl!: string;

    @Property("token", String)
    token!: string;

    @Default() @Property("ignoreSsl", Boolean)
    ignoreSsl!: boolean;
}

export class WorkItemsTypeStateConfig {
    @Value(0, String)
    name!: string;

    @Property("color", String)
    color?: string;
}

export class WorkItemsTypeConfig {
    @Value(0, String)
    name!: string;

    @Children("state", WorkItemsTypeStateConfig)
    states!: WorkItemsTypeStateConfig[];

    @Optional() @Property("icon", String)
    icon?: string;

    @Optional() @Property("color", String)
    color?: string;
}

export class WorkItemsConfig {
    @Children("type", WorkItemsTypeConfig)
    types!: WorkItemsTypeConfig[];
}

export class BacklogContentSortConfig {
    @Value(0, String)
    field!: string;

    @Value(1, String)
    direction?: "asc" | "desc";
}

export class BacklogContentConfig {
    @Values(0, String)
    workItemTypes!: string[];

    @Optional() @Child("sort", BacklogContentSortConfig)
    sort?: BacklogContentSortConfig;

    @Optional() @Children('content', BacklogContentConfig)
    content!: BacklogContentConfig[];

    public * allWorkItemTypes() : IterableIterator<string> {
        yield * this.workItemTypes;

        if (this.content != null) {
            for (const content of this.content) {
                yield * content.allWorkItemTypes();
            }
        }
    }
}

export class BacklogViewConfig {
    @Value(0, String)
    name!: string;

    @Optional() @Property('query', String)
    query?: string;

    @Optional() @Property('queryId', String)
    queryId?: string;

    @Optional() @Property('queryName', String)
    queryName?: string;
}

export class BacklogOutputConfig {
    public constructor(path?: string) {
        this.path = path!;
    }
    
    @Value(0, String)
    path!: string;

    @Optional() @Property("format", String)
    format?: string;

    @Optional() @Property("overwrite", Boolean)
    overwrite?: boolean;

    @Optional() @Property("mkdir", Boolean)
    mkdir?: boolean;
}

export class BrandConfig {
    @Value(0, String)
    logo!: string;
}

export class BacklogAppendixConfig {
    @Optional() @Property('title', String)
    title?: string;

    @Optional() @Value(0, String)
    content?: string;
}

export class BacklogConfig {
    @Value(0, String)
    name!: string;

    @Optional() @Property('query', String)
    query?: string;

    @Optional() @Property('query-id', String)
    queryId?: string;

    @Optional() @Property('query-name', String)
    queryName?: string;

    @Property('project', String)
    project!: string;

    @Children('brand', BrandConfig)
    brands!: BrandConfig[];

    @Children('content', BacklogContentConfig)
    content!: BacklogContentConfig[];

    @Optional() @Children('view', BacklogViewConfig)
    views!: BacklogViewConfig[];

    @Children('output', BacklogOutputConfig)
    outputs!: BacklogOutputConfig[];

    @Children('appendix', BacklogAppendixConfig)
    appendixes!: BacklogAppendixConfig[];

    public * allWorkItemTypes() : IterableIterator<string> {
        for (const content of this.content) {
            yield * content.allWorkItemTypes();
        }
    }
}

export class TableOfContentsValueConfig {
    @Optional() @Property("width", String)
    width?: string;

    @Optional() @Property("align", String)
    align?: TableCellAlignment;

    @Property("header", String)
    header!: string;

    @Optional() @Property("field", String)
    field?: string;

    @Optional() @Child("workItems", SchemaUtils.schemaOf(Values(0, String)))
    workItems?: string[];
}

export enum TableCellAlignment {
    Left = 'left',
    Center = 'center',
    Right = 'right',
}

export enum TableOfContentsMode {
    List = 'list',
    Grid = 'grid'
}

export class TableOfContentsConfig {
    @Property("mode", String)
    mode!: TableOfContentsMode;

    @Optional() @Property("hide-header", Boolean)
    hideHeader?: boolean;

    @Children("value", TableOfContentsValueConfig)
    values!: TableOfContentsValueConfig[];

    * valuesFor(workItemType: string) {
        for (const value of this.values) {
            // If this is a conditional value based on the WorkItem type,
            // and this is not one of those work item types, then skip it
            if (value.workItems == null || value.workItems.length == 0 || value.workItems.includes(workItemType)) {
                yield value;
            }
        }
    }
}

const BlockConfigTags: Record<string, any> = {}

export class TemplateTagsConfig {
    @Optional() @Property("single", Boolean)
    single!: boolean;
}

BlockConfigTags['tags'] = TemplateTagsConfig;

export class TemplateLinksConfig {
    @Property("label", String)
    label!: string;

    @Optional() @Property("single", Boolean)
    single!: boolean;

    @Values(0, String)
    relations!: string[];
}

BlockConfigTags['links'] = TemplateLinksConfig;

export class TemplateSectionConfig {
    @Optional() @Property("header", String)
    header!: string;

    @Property("field", String)
    field!: string;

    @Optional() @Property("richText", Boolean)
    richText!: boolean;
}

BlockConfigTags['section'] = TemplateSectionConfig;

export class TemplateMetadataColumnConfig {
    @Children(BlockConfigTags)
    blocks!: TemplateBlockConfig[];

    @Optional() @Property("colspan", Number)
    colspan!: number;
}

export class TemplateMetadataRowConfig {
    @Children(BlockConfigTags)
    blocks!: TemplateBlockConfig[];
}

export type TemplateMetadataCellConfig = TemplateMetadataRowConfig | TemplateMetadataColumnConfig;

export class TemplateMetadataConfig {
    @Optional() @Property("header", String)
    header!: string;

    @Property("columns", Number)
    columns!: number;

    @Children({
        row: TemplateMetadataRowConfig,
        column: TemplateMetadataColumnConfig
    })
    cells!: TemplateMetadataCellConfig[];
}

BlockConfigTags['metadata'] = TemplateMetadataConfig;

export type TemplateBlockConfig = TemplateSectionConfig | TemplateLinksConfig | TemplateTagsConfig | TemplateMetadataConfig;

export class TemplateConfig {
    @Value(0, String)
    workItemType!: string;

    @Children(BlockConfigTags)
    blocks!: TemplateBlockConfig[];
}

export class TfsConfig {
    @Default() @Child("debug", Boolean)
    debug!: boolean;

    @Child("api", ApiConfig)
    api!: ApiConfig;

    @Optional() @Child("workItems", WorkItemsConfig)
    workItems?: WorkItemsConfig;

    @Children("backlog", BacklogConfig)
    backlogs!: BacklogConfig[];

    @Child("toc", TableOfContentsConfig)
    toc!: TableOfContentsConfig;

    @Children("template", TemplateConfig)
    templates!: TemplateConfig[];
}

export const TfsConfigSchema = SchemaUtils.schemaOf(Child('config', TfsConfig));

export const TfsConfigFormat = new KDLFormat(TfsConfigSchema);
