import assert from 'assert';
import * as azdev from "azure-devops-node-api";
import { TeamProjectReference } from 'azure-devops-node-api/interfaces/CoreInterfaces';
import { QueryExpand, QueryHierarchyItem, WorkItem, WorkItemExpand, WorkItemTypeStateColors } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import { IWorkItemTrackingApi } from 'azure-devops-node-api/WorkItemTrackingApi';
import { LoggerInterface, pp } from 'clui-logger';
import * as path from 'path';
import { Cache } from './cache';
import { BacklogContentConfig, BacklogContentDefaultsConfig, TfsConfig } from './config';
import { IMetricsContainer, Metric, ProfileAsync } from './metrics';
import { BacklogWorkItem, BacklogWorkItemType } from './model';
import { bufferToBase64, bufferToStream, pflatMap, streamToBuffer, streamToString } from "./utils";
import { Semaphore } from 'data-semaphore';

const DAY_FORMAT = 'yyyyMMdd';
const SPRINT_FORMAT = 'dd MMM';

export class AzureClient {
    protected connection: azdev.WebApi;

    public logger: LoggerInterface;

    public cache: Cache;

    public config: TfsConfig;

    public metrics: Record<'getProjectByName' | 'query' | 'getWorkItems' | 'getWorkItemTypes' | 'getWorkItemStates' | 'downloadAttachment', Metric>;

    public constructor(logger: LoggerInterface, cache: Cache, config: TfsConfig, metrics: IMetricsContainer) {
        this.logger = logger;
        this.cache = cache;
        this.config = config;

        this.connection = new azdev.WebApi(
            this.config.api.organizationUrl,
            azdev.getPersonalAccessTokenHandler(this.config.api.token),
            {
                ignoreSslError: this.config.api.ignoreSsl,
            }
        );

        this.metrics = metrics.create(['getProjectByName', 'query', 'getWorkItems', 'getWorkItemTypes', 'getWorkItemStates', 'downloadAttachment'] as const);

        // Settings.defaultZone = config.timeZone;
    }

    @ProfileAsync('getProjectByName')
    public async getProjectByName(name: string): Promise<TeamProjectReference | undefined> {
        let selectedProject = await this.cache.getProject(name);

        if (selectedProject != null) {
            return selectedProject;
        }

        const coreApi = await this.connection.getCoreApi();

        this.logger.debug(pp`Retrieving list of TFS projects...`);

        const allProjects = await coreApi.getProjects();

        for (let project of allProjects) {
            if (project.name != null) {
                this.cache.setProject(project.name, project);
            }
        }

        this.logger.debug(pp`  > Found ${allProjects.length} projects.`);

        selectedProject = allProjects.find(project => project.name != null && project.name.localeCompare(name, void 0, { sensitivity: 'accent' }) == 0);

        this.logger.debug(pp`  > Found ${selectedProject?.id} matching projects with config.`);

        return selectedProject;
    }

    @ProfileAsync('getWorkItems')
    public async getWorkItemsById(ids: number[]): Promise<WorkItem[]> {
        // const semaphore = new Semaphore(8);

        const witApi = await this.connection.getWorkItemTrackingApi();

        const chunkSize = 200;

        // const chunks: Promise<WorkItem[]>[] = [];

        const chunksCount = Math.ceil(ids.length / chunkSize);

        const workItems: WorkItem[] = await pflatMap([...Array(chunksCount).keys()], 8, i => {
            const chunkIds: number[] = ids.slice(i, i + chunkSize);

            return witApi.getWorkItemsBatch({
                ids: chunkIds,
                $expand: WorkItemExpand.Relations,
            });
        });

        // for (let i = 0; i < ids.length; i += chunkSize) {
        //     const chunkIds: number[] = ids.slice(i, i + chunkSize);

        //     const workItemsChunk = semaphore.use(() => witApi.getWorkItemsBatch({
        //         ids: chunkIds,
        //         $expand: WorkItemExpand.Relations,
        //     }));

        //     chunks.push(workItemsChunk);
        // }

        // for (let workItemsChunk of await Promise.all(chunks)) {
        //     workItems.push(...workItemsChunk);
        // }

        return workItems;
    }

    public async getQueryResultsById(project: TeamProjectReference, queryId: string): Promise<number[]> {
        const witApi = await this.connection.getWorkItemTrackingApi();

        const query = await witApi.getQuery(project.id!, queryId);

        if (query == null) {
            throw new Error(`No query found with ID "${queryId}" in project ${project.name!}`);
        }

        this.logger.debug(pp`Executig query by id ${queryId} for project ${project?.name} (id ${project?.id})`);

        const results = await this.metrics.query.measureAsync(() => witApi.queryById(query.id!, {
            projectId: project.id!
        }));

        return (results.workItems || []).map(wi => wi.id!);
    }

    public async getQueryResultsByName(project: TeamProjectReference, queryName: string): Promise<number[]> {
        const witApi = await this.connection.getWorkItemTrackingApi();

        this.logger.debug(pp`Retrieving list of all queries for project ${project?.name} (id ${project?.id})`);

        const allQueries = await witApi.getQueries(project.id!, QueryExpand.Minimal, 2);

        const flattenQueries: (q: QueryHierarchyItem) => QueryHierarchyItem[] = q => [q, ...(q?.children?.flatMap(flattenQueries) ?? [])];

        const query = allQueries.flatMap(flattenQueries).find(query => query.name == queryName);

        if (query == null) {
            throw new Error(`No query found with Name "${queryName}" in project ${project.name!}`);
        }

        this.logger.debug(pp`Executig query by id ${query.id!} for project ${project?.name} (id ${project?.id})`);

        const results = await this.metrics.query.measureAsync(() => witApi.queryById(query.id!, {
            projectId: project.id!
        }));

        return (results.workItems || []).map(wi => wi.id!);
    }

    public async getQueryResultsByWiql(project: TeamProjectReference, queryWiql: string): Promise<number[]> {
        const witApi = await this.connection.getWorkItemTrackingApi();

        const query = `SELECT [System.Id] FROM workitems WHERE ` + queryWiql;

        this.logger.debug(pp`Executig query by wiql ${query} for project ${project?.name} (id ${project?.id})`);

        const results = await this.metrics.query.measureAsync(() => witApi.queryByWiql({ query }, {
            projectId: project.id!
        }));

        return (results.workItems || []).map(wi => wi.id!);
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

    public async buildContent(queryResults: WorkItem[], content: BacklogContentConfig[], contentDefaults: BacklogContentDefaultsConfig): Promise<BacklogWorkItem[]> {
        if (content.length === 0) {
            throw new Error("Cannot build content without an work item types hierarchy.");
        }

        const witApi = await this.connection.getWorkItemTrackingApi();

        const unincludedWorkItems = new Set<number>();

        const backlog = await this.buildContentListRecursive(witApi, queryResults, content, contentDefaults, unincludedWorkItems);

        if (unincludedWorkItems.size > 0) {
            this.logger.info(pp`List of unparented Work Items: ${Array.from(unincludedWorkItems).join(', ')}`)
        }

        return backlog;
    }

    public async buildContentListRecursive(witApi: IWorkItemTrackingApi, queryResults: WorkItem[], contentList: BacklogContentConfig[], contentDefaults: BacklogContentDefaultsConfig, unincludedWorkItems: Set<number>): Promise<BacklogWorkItem[]> {
        if (contentList.length === 0) {
            throw new Error("Cannot build content without an work item types hierarchy.");
        }

        const backlog = [];

        for (const content of contentList) {
            backlog.push(...await this.buildContentRecursive(witApi, queryResults, content, contentDefaults, unincludedWorkItems));
        }

        return backlog;
    }

    public async buildContentRecursive(witApi: IWorkItemTrackingApi, queryResults: WorkItem[], content: BacklogContentConfig, contentDefaults: BacklogContentDefaultsConfig, unincludedWorkItems: Set<number>): Promise<BacklogWorkItem[]> {
        const hasChildren = content.content != null && content.content.length > 0;

        const parentTypes = content.workItemTypes;
        const parentWorkItems = queryResults
            .filter(wi => parentTypes.includes(wi.fields!["System.WorkItemType"]))
            .map(wi => new BacklogWorkItem(wi, hasChildren));

        const fetchParents = content.fetchParents ?? contentDefaults.fetchParents;

        if (hasChildren) {
            // Create a map of the parents by id
            const parentsById = new Map<number, BacklogWorkItem>();
            for (const parent of parentWorkItems) {
                parentsById.set(parent.id, parent);
            }

            // Create a list to fill with any parent ids that have not been loaded by the query initially
            // Only when `content.fetchParents == true`
            const unloadedParents: number[] = [];

            const childrenBacklog = await this.buildContentListRecursive(witApi, queryResults, content.content, contentDefaults, unincludedWorkItems);
            for (const child of childrenBacklog) {
                let parentId: number | null = null;

                for (const rel of child.workItem.relations || []) {
                    if (rel.attributes?.name !== "Parent") {
                        continue;
                    }

                    parentId = BacklogWorkItem.getIdFromUrl(rel.url!);
                    break;
                }

                if (parentId == null) {
                    this.logger.warn(pp`${child.type} #${child.id} ${child.title} was skipped because it does not have a parent.`);
                    continue;
                }

                let parent = parentsById.get(parentId);

                if (parent == null) {
                    // If the parent of this work item was not included in the initial query, we create a placeholder
                    // backlog item for the parent. As the work item object, we pass null **temporarily**
                    // After all child items have been processed, we check for any missing parents and load them in batch,
                    // filling out the missing work item objects of them
                    if (fetchParents) {
                        parent = new BacklogWorkItem(null!, true);

                        parentsById.set(parentId, parent);

                        unloadedParents.push(parentId);
                    } else {
                        this.logger.warn(child.type + pp` #${child.id} ${child.title} was skipped because its parent #${parentId} is not part of this backlog.`);
                        unincludedWorkItems.add(parentId);
                        continue;
                    }
                }

                parent.children.push(child);
            }

            if (unloadedParents.length > 0) {
                for (const wi of await this.getWorkItemsById(unloadedParents)) {
                    assert(wi.id != null, "work item must have an id");

                    const parent = parentsById.get(wi.id);

                    assert(parent != null, "work item must be of a parent of another work item");
                    assert(parent.workItem == null, "work item must have been unloaded previously");

                    // Fill out the previously-null work item object
                    parent.workItem = wi;
                    parent.updateRelations();

                    // Insert any lazyli fetched parents at the end.
                    // If an order-by clause is specified, they will be sorted later according to it
                    parentWorkItems.push(parent);
                }
            }
        }

        const orderBy = content.orderBy ?? contentDefaults.orderBy;

        // If there is a custom ordering defined, order all the parents by them
        if (orderBy != null && orderBy.length > 0) {
            BacklogWorkItem.sort(parentWorkItems, orderBy);
        }

        return parentWorkItems;
    }

    @ProfileAsync('getWorkItemTypes')
    public async getWorkItemTypes(projectId: string): Promise<BacklogWorkItemType[]> {
        this.logger.debug(pp`Get workitem types for project ${projectId}`);

        let workItemTypes = await this.cache.getWorkItemTypes(projectId);

        if (workItemTypes != null) {
            return workItemTypes;
        }

        workItemTypes = [];

        const witApi = await this.connection.getWorkItemTrackingApi();

        const types = await witApi.getWorkItemTypes(projectId);

        for (const type of types) {
            assert(type.icon != null, `Work Item type ${type.name} must have an icon`);
            assert(type.icon.id != null, `Work Item type ${type.name} icon must have an id`);

            const iconStream = await witApi.getWorkItemIconSvg(type.icon.id, type.color?.substring(2));

            const icon = await streamToString(iconStream);

            workItemTypes.push(new BacklogWorkItemType(type.name!, type.color!, icon));
        }

        this.cache.setWorkItemTypes(projectId, workItemTypes);

        return workItemTypes;
    }

    // Example of URL:
    // https://tfs-projects.cmf.criticalmanufacturing.com/ImplementationProjects/24b0b677-01e3-4b83-b85e-048e53f7a098/_apis/wit/attachments/a8e5f541-5b7e-4d15-b05d-b44876f4a5d4?fileName=image.png
    // <DeploymentUrl>/<ProjectId>/_apis/wit/attachments/<AttachmentId>?fileName=<FileName>
    static ATTACHMENT_URL_REGEX = /(?<projectId>[a-zA-Z0-9\-]+)\/_apis\/wit\/attachments\/(?<attachmentId>[a-zA-Z0-9\-]+)\?fileName=(?<fileName>[^&]+)/;

    public parseAttachmentUrl(url: string): { projectId: string, attachmentId: string, fileName: string } | null {
        const urlRegex = AzureClient.ATTACHMENT_URL_REGEX;

        const match = url.match(urlRegex);

        if (match != null) {
            const projectId = match.groups!['projectId'];
            const attachmentId = match.groups!['attachmentId'];
            const fileName = match.groups!['fileName'];

            return { projectId, attachmentId, fileName };
        }

        return null;
    }

    @ProfileAsync('downloadAttachment')
    public async downloadAttachmentUrl(url: string): Promise<NodeJS.ReadableStream | null> {
        const urlObj = this.parseAttachmentUrl(url);

        if (urlObj) {
            let content = await this.cache.getAttachment(urlObj.projectId, urlObj.attachmentId);

            if (content == null) {
                const witApi = await this.connection.getWorkItemTrackingApi();

                var readable = await witApi.getAttachmentContent(urlObj.attachmentId, urlObj.fileName, urlObj.projectId, /* download: */ true);

                content = await streamToBuffer(readable);

                this.cache.setAttachment(urlObj.projectId, urlObj.attachmentId, content);
            }

            return bufferToStream(content);
        }

        return null;
    }

    @ProfileAsync('downloadAttachment')
    public async downloadAttachmentUrlBase64(url: string): Promise<string | null> {
        const urlObj = this.parseAttachmentUrl(url);

        if (urlObj) {
            let content = await this.cache.getAttachment(urlObj.projectId, urlObj.attachmentId);

            if (content == null) {
                const witApi = await this.connection.getWorkItemTrackingApi();

                var contentStream = await witApi.getAttachmentContent(urlObj.attachmentId, urlObj.fileName, urlObj.projectId, /* download: */ true);

                content = await streamToBuffer(contentStream);

                this.cache.setAttachment(urlObj.projectId, urlObj.attachmentId, content);
            }

            return `data:image/${path.extname(urlObj.fileName).slice(1)};base64,` + bufferToBase64(content);
        }

        return null;
    }

    @ProfileAsync('getWorkItemStates')
    public async getWorkItemStates(projectName: string, types: string[]) {
        this.logger.debug(pp`Get workitem states for project ${projectName}`);

        let workItemStateColors = await this.cache.getWorkItemStates(projectName, types);

        if (workItemStateColors != null) {
            return workItemStateColors;
        }

        workItemStateColors = {};

        const getTypeStates = async (type: string): Promise<WorkItemTypeStateColors> => {
            const stateColors = await witApi.getWorkItemTypeStates(projectName, type);

            return {
                workItemTypeName: type,
                stateColors
            };
        };

        const witApi = await this.connection.getWorkItemTrackingApi();

        const result = await Promise.all(types.map(type => getTypeStates(type)));

        for (const workItemType of result) {
            const stateColors: Record<string, string> = {};

            for (const state of workItemType.stateColors!) {
                stateColors[state.name!] = state.color!;
            }

            workItemStateColors[workItemType.workItemTypeName!] = stateColors;
        }

        this.cache.setWorkItemStates(projectName, types, workItemStateColors);

        return workItemStateColors;
    }
}

export interface QueryObject {
    query?: string;
    queryId?: string;
    queryName?: string;
}