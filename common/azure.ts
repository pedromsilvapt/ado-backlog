import * as azdev from "azure-devops-node-api";
import { TeamProjectReference, WebApiTeam } from 'azure-devops-node-api/interfaces/CoreInterfaces';
import { DateRange, TeamSetting, TeamSettingsIteration, TeamMemberCapacity as TfsTeamMemberCapacity, Member } from 'azure-devops-node-api/interfaces/WorkInterfaces';
import { LoggerInterface, pp } from 'clui-logger';
import { DateTime, Settings } from 'luxon';
import { BacklogContentConfig, TfsConfig } from './config';
import { BacklogWorkItem, BacklogWorkItemType } from './model';
import { QueryExpand, QueryHierarchyItem, WorkItem, WorkItemExpand } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import * as path from 'path';
import { IWorkItemTrackingApi } from 'azure-devops-node-api/WorkItemTrackingApi';
import { streamToBase64, streamToString } from "./utils";

const DAY_FORMAT = 'yyyyMMdd';
const SPRINT_FORMAT = 'dd MMM';

export class AzureClient {
    protected connection: azdev.WebApi;

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

    public async getQueryResultsById(project: TeamProjectReference, queryId: string): Promise<number[]> {
        const witApi = await this.connection.getWorkItemTrackingApi();

        const query = await witApi.getQuery(project.id!, queryId);

        if (query == null) {
            throw new Error(`No query found with ID "${queryId}" in project ${project.name!}`);
        }

        this.logger.debug(pp`Executig query by id ${queryId} for project ${project?.name} (id ${project?.id})`);

        const results = await witApi.queryById(query.id!, {
            projectId: project.id!
        });

        return results.workItems!.map(wi => wi.id!);
    }

    public async getQueryResultsByName(project: TeamProjectReference, queryName: string): Promise<number[]> {
        const witApi = await this.connection.getWorkItemTrackingApi();

        this.logger.debug(pp`Retrieving list of all queries for project ${project?.name} (id ${project?.id})`);

        const allQueries = await witApi.getQueries(project.id!, QueryExpand.Minimal, 2);

        const flattenQueries: (q : QueryHierarchyItem) => QueryHierarchyItem[] = q => [q, ...(q?.children?.flatMap(flattenQueries) ?? [])];

        const query = allQueries.flatMap(flattenQueries).find(query => query.name == queryName);

        if (query == null) {
            throw new Error(`No query found with Name "${queryName}" in project ${project.name!}`);
        }

        this.logger.debug(pp`Executig query by id ${query.id!} for project ${project?.name} (id ${project?.id})`);

        const results = await witApi.queryById(query.id!, {
            projectId: project.id!
        });

        return results.workItems!.map(wi => wi.id!);
    }

    public async getQueryResultsByWiql(project: TeamProjectReference, queryWiql: string): Promise<number[]> {
        const witApi = await this.connection.getWorkItemTrackingApi();

        const query = `SELECT [System.Id] FROM workitems WHERE ` + queryWiql;

        this.logger.debug(pp`Executig query by wiql ${query} for project ${project?.name} (id ${project?.id})`);

        const results = await witApi.queryByWiql({ query }, {
            projectId: project.id!
        });

        return results.workItems!.map(wi => wi.id!);
    }

    public async getQueryResults(project: TeamProjectReference, options: QueryObject): Promise<number[]> {
        const notNullOptions = [options.query, options.queryId, options.queryName].filter(p => p != null);

        if (notNullOptions.length > 1) {
            throw new Error(`One and only one query option should be provided: id, name or wiql, ${notNullOptions.length} were provided instead.`);
        }

        if (options.queryId != null) {
            return this.getQueryResultsById(project, options.queryId);
        } else if (options.queryName != null) {
            return this.getQueryResultsByName(project, options.queryName);
        } else if (options.query != null) {
            return this.getQueryResultsByWiql(project, options.query);
        } else {
            throw new Error("No query Id, Name or Wiql expression provided.");
        }
    }

    public async getQueryWorkItems(project: TeamProjectReference, options: QueryObject): Promise<WorkItem[]> {
        const results = await this.getQueryResults(project, options);

        const workItems: WorkItem[] = await this.getWorkItemsById(results);

        return workItems;
    }

    public async buildContent(queryResults: WorkItem[], content: BacklogContentConfig[]): Promise<BacklogWorkItem[]> {
        if (content.length === 0) {
            throw new Error("Cannot build content without an work item types hierarchy.");
        }

        const witApi = await this.connection.getWorkItemTrackingApi();

        const unincludedWorkItems = new Set<number>();

        const backlog = await this.buildContentListRecursive(witApi, queryResults, content, unincludedWorkItems);

        if (unincludedWorkItems.size > 0) {
            this.logger.info(pp`List of unparented Work Items: ${Array.from(unincludedWorkItems).join(', ')}`)
        }

        return backlog;
    }

    public async buildContentListRecursive(witApi: IWorkItemTrackingApi, queryResults: WorkItem[], contentList: BacklogContentConfig[], unincludedWorkItems: Set<number>): Promise<BacklogWorkItem[]> {
        if (contentList.length === 0) {
            throw new Error("Cannot build content without an work item types hierarchy.");
        }

        const backlog = [];

        for (const content of contentList) {
            backlog.push(...await this.buildContentRecursive(witApi, queryResults, content, unincludedWorkItems));
        }

        return backlog;
    }

    public async buildContentRecursive(witApi: IWorkItemTrackingApi, queryResults: WorkItem[], content: BacklogContentConfig, unincludedWorkItems: Set<number>): Promise<BacklogWorkItem[]> {
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

            const childrenBacklog = await this.buildContentListRecursive(witApi, queryResults, content.content, unincludedWorkItems);
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
                    unincludedWorkItems.add(parentId);
                    continue;
                }

                parent.children.push(child);
            }
        }

        return parentWorkItems;
    }

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

export interface QueryObject {
    query?: string;
    queryId?: string;
    queryName?: string;
}