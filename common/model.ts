import { WorkItem } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import { BacklogConfig, TableOfContentsConfig } from './config';

export class Backlog {
    public config: BacklogConfig;

    public toc: TableOfContentsConfig;

    public workItemTypes: BacklogWorkItemType[];

    public workItemStateColors: BacklogWorkItemStateColors;

    public workItems: BacklogWorkItem[];
    public backlogIndex: Record<number, BacklogWorkItem>;

    public constructor(workItemTypes: BacklogWorkItemType[], workItemStateColors: BacklogWorkItemStateColors, backlogConfig: BacklogConfig, tocConfig: TableOfContentsConfig, workItems: BacklogWorkItem[]) {
        this.config = backlogConfig;
        this.toc = tocConfig;
        this.workItemTypes = workItemTypes;
        this.workItemStateColors = workItemStateColors;
        this.workItems = workItems;

        this.backlogIndex = {};
        this.visit(wi => this.backlogIndex[wi.id] = wi);
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
                    .map(link => this.backlogIndex[link.workItemId])
                    .filter(wi => wi != null);
            }

            depth -= 1;
        }

        return workItems;
    }

    public getWorkItemType(typeName: string) {
        const workItemType = this.workItemTypes.find(type => type.name == typeName);

        if (workItemType == null) {
            throw new Error(`No work item type found for '${typeName}'`);
        }

        return workItemType;
    }

    public getDistinctUsedWorkItemTypes(): BacklogWorkItemType[] {
        const usedWorkItemTypes: BacklogWorkItemType[] = [];

        this.visit(wi => {
            if (usedWorkItemTypes.findIndex(type => type.name == wi.type) < 0) {
                usedWorkItemTypes.push(this.getWorkItemType(wi.type));
            }
        });

        return usedWorkItemTypes;
    }
}

export class BacklogWorkItem {
    public workItem: WorkItem;
    public hasChildren: boolean;
    public children: BacklogWorkItem[];
    public relations: BacklogWorkItemRelation[];

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

    public get type(): string {
        const type = this.workItem?.fields?.["System.WorkItemType"];

        if (type === null || type === void 0) {
            throw new Error(`WorkItem ${this.workItem.id} has no Title defined`);
        }

        return type;
    }

    public get state(): string {
        const type = this.workItem?.fields?.["System.State"];

        if (type === null || type === void 0) {
            throw new Error(`WorkItem ${this.workItem.id} has no State defined`);
        }

        return type;
    }

    public get typeSlug(): string {
        return this.type.replace(' ', '-').toLowerCase();
    }

    public get tags(): string[] | null {
        const tags: string | null = this.workItem?.fields?.["System.Tags"];

        if (tags == null || tags == "") {
            return null;
        }

        return tags.split(";").map(str => str.trim());
    }

    public constructor(workItem: WorkItem, hasChildren: boolean, children: BacklogWorkItem[] = []) {
        this.workItem = workItem;
        this.hasChildren = hasChildren;
        this.children = children;
        this.relations = workItem.relations!
            .map(rel => new BacklogWorkItemRelation(rel.rel!, BacklogWorkItem.getIdFromUrl(rel.url!)))
            .filter(rel => rel.workItemId != this.id);

    }

    public static getIdFromUrl(url: string): number {
        const segments = url.split("/")!;
        return parseInt(segments[segments.length - 1]);
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
