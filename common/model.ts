import { WorkItem } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import { BacklogConfig, BacklogContentSortConfig, TableOfContentsConfig, WorkItemsConfig } from './config';

export class Backlog {
    public config: BacklogConfig;

    public toc: TableOfContentsConfig;

    public workItemTypesConfig: WorkItemsConfig | undefined;

    public workItemTypes: BacklogWorkItemType[];

    public workItemStateColors: BacklogWorkItemStateColors;

    public workItems: BacklogWorkItem[];

    public backlogById: Record<number, BacklogWorkItem>;

    public views: Record<string, number[]>;

    public constructor(
        workItemTypes: BacklogWorkItemType[],
        workItemStateColors: BacklogWorkItemStateColors,
        backlogConfig: BacklogConfig,
        tocConfig: TableOfContentsConfig,
        workItemTypesConfig: WorkItemsConfig | undefined,
        workItems: BacklogWorkItem[],
        views: Record<string, number[]>
    ) {
        this.config = backlogConfig;
        this.toc = tocConfig;
        this.workItemTypesConfig = workItemTypesConfig;
        this.workItemTypes = workItemTypes;
        this.workItemStateColors = workItemStateColors;
        this.workItems = workItems;
        this.views = views;

        this.backlogById = {};
        this.visit(wi => this.backlogById[wi.id] = wi);

        this.applyWorkItemTypesOverrides();
    }

    protected applyWorkItemTypesOverrides() {
        for (const wit of this.workItemTypes) {
            const witOverride = this.workItemTypesConfig?.types?.find(type => type.name == wit.name);

            if (witOverride != null) {
                if (witOverride.icon != null) {
                    wit.icon = witOverride.icon;
                }

                if (witOverride.color != null) {
                    wit.color = witOverride.color;
                }

                if (witOverride.states != null && witOverride.states.length > 0) {
                    let stateColors = this.workItemStateColors[wit.name];

                    if (stateColors == null) {
                        this.workItemStateColors[wit.name] = stateColors = {};
                    }

                    for (const stateOverride of witOverride.states) {
                        if (stateOverride.color != null) {
                            stateColors[stateOverride.name] = stateOverride.color;
                        }
                    }
                }
            }
        }
    }

    public visit(visitor : (wi: BacklogWorkItem, end: boolean) => void, root : BacklogWorkItem | null = null, visitEnd : boolean = false) {
        if (!root) {
            for (const wi of this.workItems) {
                this.visit(visitor, wi, visitEnd);
            }
        } else {
            visitor(root, false);

            if (root.hasChildren && root.children != null) {
                for (const child of root.children) {
                    if (child != null) {
                        this.visit(visitor, child, visitEnd);
                    }
                }
            }

            if (visitEnd) {
                visitor(root, true);
            }
        }
    }

    public async visitAsync(visitor : (wi: BacklogWorkItem, end: boolean) => Promise<void>, root : BacklogWorkItem | null = null, visitEnd : boolean = false) {
        if (!root) {
            for (const wi of this.workItems) {
                await this.visitAsync(visitor, wi, visitEnd);
            }
        } else {
            await visitor(root, false);

            if (root.hasChildren && root.children != null) {
                for (const child of root.children) {
                    if (child != null) {
                        await this.visitAsync(visitor, child, visitEnd);
                    }
                }
            }

            if (visitEnd) {
                await visitor(root, true);
            }
        }
    }

    public getLinks(workItems: BacklogWorkItem[], relationsPath: string[], depth : number = 1): BacklogWorkItem[] {
        while (depth > 0) {
            for (const relation of relationsPath) {
                workItems = workItems
                    .flatMap(wi => wi.relations.filter(link => link.relationName == relation))
                    .map(link => this.backlogById[link.workItemId])
                    .filter(wi => wi != null);
            }

            depth -= 1;
        }

        return workItems;
    }

    // public getWorkItemType(typeName: string) {
    //     const workItemType = this.workItemTypes.find(type => type.name == typeName);

    //     if (workItemType == null) {
    //         throw new Error(`No work item type found for '${typeName}'`);
    //     }

    //     return workItemType;
    // }

    public getDistinctUsedWorkItemTypes(): BacklogWorkItemType[] {
        const usedWorkItemTypes: BacklogWorkItemType[] = [];

        this.visit(wi => {
            if (usedWorkItemTypes.findIndex(type => type.name == wi.typeName) < 0) {
                usedWorkItemTypes.push(wi.type);
            }
        });

        return usedWorkItemTypes;
    }
}

export class BacklogWorkItem {
    public workItem: WorkItem;
    public hasChildren: boolean;
    public children: BacklogWorkItem[];
    public relations!: BacklogWorkItemRelation[];
    public type!: BacklogWorkItemType;

    public get id(): number {
        const id = this.workItem.id;

        if (id === null || id === void 0) {
            throw new Error(`WorkItem has no ID defined`);
        }

        return id;
    }

    public get title(): string {
        const title = this.workItem.fields!["System.Title"];

        if (title === null || title === void 0) {
            throw new Error(`WorkItem ${this.workItem.id} has no Title defined`);
        }

        return title.trim();
    }

    public get typeName(): string {
        const type = this.workItem?.fields?.["System.WorkItemType"];

        if (type === null || type === void 0) {
            throw new Error(`WorkItem ${this.workItem.id} has no Title defined`);
        }

        return type;
    }

    public get state(): string {
        const state = this.workItem?.fields?.["System.State"];

        if (state === null || state === void 0) {
            throw new Error(`WorkItem ${this.workItem.id} has no State defined`);
        }

        return state;
    }

    public get typeSlug(): string {
        return this.typeName.replace(' ', '-').toLowerCase();
    }

    public get tags(): string[] | null {
        const tags: string | null = this.workItem?.fields?.["System.Tags"];

        if (tags == null || tags == "") {
            return null;
        }

        return tags.split(";").map(str => str.trim());
    }

    public constructor(type: BacklogWorkItemType, workItem: WorkItem, hasChildren: boolean, children: BacklogWorkItem[] = []) {
        this.workItem = workItem;
        this.hasChildren = hasChildren;
        this.children = children;
        this.type = type;

        this.updateRelations();
    }

    public updateRelations() {
        this.relations = (this.workItem?.relations ?? [])
            .filter(rel => rel.rel != null && rel.url != null)
            .map(rel => new BacklogWorkItemRelation(rel.rel!, BacklogWorkItem.getIdFromUrl(rel.url!)))
            .filter(rel => rel.workItemId != this.id);
    }

    public static getIdFromUrl(url: string): number {
        const segments = url.split("/")!;
        return parseInt(segments[segments.length - 1]);
    }

    public static sort(backlog: BacklogWorkItem[], orderBy: BacklogContentSortConfig[]) {
        const comparators = orderBy.map(config => {
            return (a: BacklogWorkItem, b: BacklogWorkItem) => {
                let result = 0;

                const valueA = a.workItem.fields?.[config.field];
                const valueB = b.workItem.fields?.[config.field];

                if (valueA < valueB) {
                    result = -1;
                } else if (valueA > valueB) {
                    result = 1;
                }

                if (config.direction === 'desc') {
                    result *= -1;
                }

                return result;
            };
        });

        backlog.sort((a, b) => {
            for (let i = 0; i < comparators.length; i++) {
                const result = comparators[i](a, b);

                if (result != 0) {
                    return result;
                }
            }

            return 0;
        });
    }
}

export class BacklogWorkItemRelation {
    public relationName: string;
    public workItemId: number;

    public constructor(relationName: string, workItemId: number) {
        this.relationName = relationName;
        this.workItemId = workItemId;
    }
}

export class BacklogWorkItemType {
    public name: string;

    public color: string;

    public icon: string;

    public constructor(name: string, color: string, icon: string) {
        this.name = name;
        this.color = color;
        this.icon = icon;
    }
}

export type BacklogWorkItemStateColors = Record<string, Record<string, string>>;

// export interface WorkItem {
//     id: number;
//     title: string;
//     type: string;
// }
