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
}

export class BacklogConfig {
    @Value(0, String)
    name!: string;

    @Property('query', String)
    query!: string;

    @Property('project', String)
    project!: string;

    @Children('content', BacklogContentConfig)
    content!: BacklogContentConfig[];
}

export class TableOfContentsValueConfig {
    @Optional() @Property("width", String)
    width?: string;

    @Optional() @Property("align", String)
    align?: TableCellAlignment;

    @Property("header", String)
    header!: string;

    @Property("field", String)
    field!: string;
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

    @Children("backlog", BacklogConfig)
    backlogs!: BacklogConfig[];

    @Child("toc", TableOfContentsConfig)
    toc!: TableOfContentsConfig;

    @Children("template", TemplateConfig)
    templates!: TemplateConfig[];
}

export const TfsConfigSchema = SchemaUtils.schemaOf(Child('config', TfsConfig));

export const TfsConfigFormat = new KDLFormat(TfsConfigSchema);
