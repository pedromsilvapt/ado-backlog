import * as azdev from "azure-devops-node-api";
import { TeamProjectReference, WebApiTeam } from 'azure-devops-node-api/interfaces/CoreInterfaces';
import { DateRange, TeamSetting, TeamSettingsIteration, TeamMemberCapacity as TfsTeamMemberCapacity, Member } from 'azure-devops-node-api/interfaces/WorkInterfaces';
import { LoggerInterface, pp } from 'clui-logger';
import { DateTime, Settings } from 'luxon';
import { BacklogContentConfig, TfsConfig } from './config';
import { BacklogWorkItem, BacklogWorkItemType } from './model';
import { WorkItem, WorkItemExpand } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import * as path from 'path';
import { IWorkItemTrackingApi } from 'azure-devops-node-api/WorkItemTrackingApi';


const DAY_FORMAT = 'yyyyMMdd';
const SPRINT_FORMAT = 'dd MMM';

function streamToBuffer(stream: NodeJS.ReadableStream) {
    const chunks: Buffer[] = [];
    return new Promise<Buffer>((resolve, reject) => {
        stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        stream.on('error', (err) => reject(err));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
}

async function streamToString(stream: NodeJS.ReadableStream) {
    const buffer = await streamToBuffer(stream);

    return buffer.toString('utf-8');
}

async function streamToBase64(stream: NodeJS.ReadableStream) {
    const buffer = await streamToBuffer(stream);

    return buffer.toString('base64');
}

export class AzureClient {
    protected connection: azdev.WebApi;

    protected deployementConnection: azdev.WebApi;

    public logger: LoggerInterface;

    public config: TfsConfig;

    protected _accountsCache: Map<string, TfsTeamMemberCapacity>;

    public constructor(logger: LoggerInterface, config: TfsConfig) {
        this._accountsCache = new Map();
        this.logger = logger;
        this.config = config;

        this.connection = new azdev.WebApi(
            this.config.api.organizationUrl,
            azdev.getPersonalAccessTokenHandler(this.config.api.token),
            {
                ignoreSslError: this.config.api.ignoreSsl,
            }
        );
        this.deployementConnection = new azdev.WebApi(
            this.config.api.deployementUrl,
            azdev.getPersonalAccessTokenHandler(this.config.api.token),
            {
                ignoreSslError: this.config.api.ignoreSsl,
            }
        );

        // Settings.defaultZone = config.timeZone;
    }

    public async getProjectByName(name: string): Promise<TeamProjectReference | undefined> {
        const coreApi = await this.connection.getCoreApi();

        this.logger.debug(pp`Retrieving list of TFS projects...`);

        const allProjects = await coreApi.getProjects();

        this.logger.debug(pp`  > Found ${allProjects.length} projects.`);

        const selectedProject = allProjects.find(project => project.name != null && project.name.localeCompare(name, void 0, { sensitivity: 'accent' }) == 0);

        this.logger.debug(pp`  > Found ${selectedProject?.id} matching projects with config.`);

        return selectedProject;
    }

    public async getWorkItemsById(ids: number[]): Promise<WorkItem[]> {
        const witApi = await this.connection.getWorkItemTrackingApi();

        const chunkSize = 200;

        const workItems: WorkItem[] = [];

        for (let i = 0; i < ids.length; i += chunkSize) {
            const chunkIds: number[] = ids.slice(i, i + chunkSize);

            const workItemsChunk = await witApi.getWorkItemsBatch({
                ids: chunkIds,
                $expand: WorkItemExpand.Relations,
            });

            workItems.push(...workItemsChunk);
        }

        return workItems;
    }

    public async executeQuery(project: TeamProjectReference, queryName: string): Promise<WorkItem[]> {
        const witApi = await this.connection.getWorkItemTrackingApi();

        const query = await witApi.getQuery(project.id!, queryName);

        if (query == null) {
            throw new Error(`No query found with name ${queryName} in project ${project.name!}`);
        }

        const results = await witApi.queryById(query.id!, {
            projectId: project.id!
        });

        const workItems: WorkItem[] = await this.getWorkItemsById(results.workItems!.map(wi => wi.id!));

        return workItems;
    }

    public async buildContent(queryResults: WorkItem[], content: BacklogContentConfig[]): Promise<BacklogWorkItem[]> {
        if (content.length === 0) {
            throw new Error("Cannot build content without an work item types hierarchy.");
        }

        const witApi = await this.connection.getWorkItemTrackingApi();

        return this.buildContentListRecursive(witApi, queryResults, content);
    }

    public async buildContentListRecursive(witApi: IWorkItemTrackingApi, queryResults: WorkItem[], contentList: BacklogContentConfig[]): Promise<BacklogWorkItem[]> {
        if (contentList.length === 0) {
            throw new Error("Cannot build content without an work item types hierarchy.");
        }

        const backlog = [];

        for (const content of contentList) {
            backlog.push(...await this.buildContentRecursive(witApi, queryResults, content));
        }

        return backlog;
    }

    public async buildContentRecursive(witApi: IWorkItemTrackingApi, queryResults: WorkItem[], content: BacklogContentConfig): Promise<BacklogWorkItem[]> {
        const hasChildren = content.content != null && content.content.length > 0;

        const parentTypes = content.workItemTypes;
        const parentWorkItems = queryResults
            .filter(wi => parentTypes.includes(wi.fields!["System.WorkItemType"]))
            .map(wi => new BacklogWorkItem(wi, hasChildren));

        if (hasChildren) {
            // Create a map of the parents by id
            const parentsById = new Map<number, BacklogWorkItem>();
            for (const parent of parentWorkItems) {
                parentsById.set(parent.id, parent);
            }

            const childrenBacklog = await this.buildContentListRecursive(witApi, queryResults, content.content);
            for (const child of childrenBacklog) {
                let parentId: number | null = null;

                for (const rel of child.workItem.relations!) {
                    if (rel.attributes!.name !== "Parent") {
                        continue;
                    }

                    parentId = BacklogWorkItem.getIdFromUrl(rel.url!);
                    break;
                }

                if (parentId == null) {
                    this.logger.warn(pp`${child.type} #${child.id} ${child.title} was skipped because it does not have a parent.`);
                    continue;
                }

                const parent = parentsById.get(parentId);

                if (parent == null) {
                    this.logger.warn(child.type + pp` #${child.id} ${child.title} was skipped because its parent #${parentId} is not part of this backlog.`);
                    continue;
                }

                parent.children.push(child);
            }
        }

        // if (content.sort != null) {

        //     content.sort.field
        // }

        return parentWorkItems;
    }

    //     const backlogByLevel = new Map<number, BacklogWorkItem[]>();

    //     const leafTypes = workItemTypes[workItemTypes.length - 1];
    //     const leafWorkItems = queryResults
    //         .filter(wi => leafTypes.includes(wi.fields!["System.WorkItemType"]))
    //         .map(wi => new BacklogWorkItem(wi, false));

    //         backlogByLevel.set(workItemTypes.length - 1, leafWorkItems);

    //     for (let i = workItemTypes.length - 2; i >= 0; i--) {
    //         const childLevel = i + 1;

    //         const childWorkItems = backlogByLevel.get(childLevel)!;

    //         const parentIdsSet = new Set<number>();
    //         for (const wi of childWorkItems) {
    //             for (const rel of wi.workItem.relations!) {
    //                 if (rel.attributes!.name !== "Parent") {
    //                     continue;
    //                 }

    //                 const parentId = BacklogWorkItem.getIdFromUrl(rel.url!);
    //                 parentIdsSet.add(parentId);
    //             }
    //         }

    //         const parentWorkItems = (await this.getWorkItemsById(Array.from(parentIdsSet)))
    //             .map(wi => new BacklogWorkItem(wi, true));

    //             backlogByLevel.set(i, parentWorkItems);

    //         const parentsById = new Map<number, BacklogWorkItem>(parentWorkItems.map(wi => [wi.workItem.id!, wi] as const));

    //         for (const wi of childWorkItems) {
    //             for (const rel of wi.workItem.relations!) {
    //                 if (rel.attributes!.name !== "Parent") {
    //                     continue;
    //                 }

    //                 const parentId = BacklogWorkItem.getIdFromUrl(rel.url!);

    //                 parentsById.get(parentId)?.children.push(wi);
    //             }
    //         }
    //     }

    //     // const rootType = workItemTypes[0][ 0 ];
    //     const rootWorkItems = backlogByLevel.get(0)!;

    //     return rootWorkItems;
    // }

    public async getWorkItemTypes(projectId: string): Promise<BacklogWorkItemType[]> {
        const witApi = await this.connection.getWorkItemTrackingApi();

        const workItemTypes: BacklogWorkItemType[] = [];

        const types = await witApi.getWorkItemTypes(projectId);

        for (const type of types) {
            const iconStream = await witApi.getWorkItemIconSvg(type.icon!.id!, type.color?.substring(2));

            const icon = await streamToString(iconStream);

            type.fields
            workItemTypes.push(new BacklogWorkItemType(type.name!, type.color!, icon));
        }

        return workItemTypes;
    }

    public parseAttachmentUrl(url: string): { projectId: string, attachmentId: string, fileName: string } | null {
        // Example of URL:
        // https://tfs-projects.cmf.criticalmanufacturing.com/ImplementationProjects/24b0b677-01e3-4b83-b85e-048e53f7a098/_apis/wit/attachments/a8e5f541-5b7e-4d15-b05d-b44876f4a5d4?fileName=image.png
        // <DeploymentUrl>/<ProjectId>/_apis/wit/attachments/<AttachmentId>?fileName=<FileName>
        const urlRegex = /(?<projectId>[a-zA-Z0-9\-]+)\/_apis\/wit\/attachments\/(?<attachmentId>[a-zA-Z0-9\-]+)\?fileName=(?<fileName>[^&]+)/;

        const match = url.match(urlRegex);

        if (match != null) {
            const projectId = match.groups!['projectId'];
            const attachmentId = match.groups!['attachmentId'];
            const fileName = match.groups!['fileName'];

            return { projectId, attachmentId, fileName };
        }

        return null;
    }

    public async downloadAttachmentUrl(url: string): Promise<NodeJS.ReadableStream | null> {
        const urlObj = this.parseAttachmentUrl(url);

        if (urlObj) {
            const witApi = await this.connection.getWorkItemTrackingApi();

            return await witApi.getAttachmentContent(urlObj.attachmentId, urlObj.fileName, urlObj.projectId, /* download: */ true);
        }

        return null;
    }

    public async downloadAttachmentUrlBase64(url: string): Promise<string | null> {
        const urlObj = this.parseAttachmentUrl(url);

        if (urlObj) {
            const witApi = await this.connection.getWorkItemTrackingApi();

            const stream = await witApi.getAttachmentContent(urlObj.attachmentId, urlObj.fileName, urlObj.projectId, /* download: */ true);

            return `data:image/${path.extname(urlObj.fileName).slice(1)};base64,` + await streamToBase64(stream);
        }

        return null;
    }

    public async getWorkItemStates(projectName: string) {
        const witApi = await this.connection.getWorkItemTrackingApi();

        const result = await witApi.getWorkItemStateColors([projectName]);

        const workItemStateColors: Record<string, Record<string, string>> = {};

        for (const workItemType of result[0].workItemTypeStateColors!) {
            const stateColors: Record<string, string> = {};

            for (const state of workItemType.stateColors!) {
                stateColors[state.name!] = state.color!;
            }

            workItemStateColors[workItemType.workItemTypeName!] = stateColors;
        }

        return workItemStateColors;
    }
}
