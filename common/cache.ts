import { TeamProjectReference } from 'azure-devops-node-api/interfaces/CoreInterfaces';
import { BacklogWorkItemType } from './model';
import Keyv from 'keyv';
import KeyvFile from 'keyv-file';

export class Cache {
    mode: CacheMode;

    store: KeyvFile | null;

    cache: Keyv;

    constructor(mode: CacheMode, organizationUrl: string) {
        this.mode = mode;

        this.store = mode == CacheMode.Persistent
            ? new KeyvFile({ filename: './.ado-backlog/cache.json', writeDelay: 1000 })
            : null;

        this.cache = new Keyv({
            store: this.store ?? new Map(),
            namespace: organizationUrl
        });
    }

    public async flush() {
        const promise: Promise<unknown> = (this.cache as any)?._savePromise;

        if (promise != null) {
            await promise;
        }
    }

    protected getAttachmentKey(projectId: string, attachmentId: string): string {
        return `getAttachment:${projectId}:${attachmentId}`;
    }

    public getAttachment(projectId: string, attachmentId: string): Promise<Buffer | undefined> {
        if (this.mode == CacheMode.Off) {
            return Promise.resolve(void 0);
        }

        return this.cache.get<Buffer>(this.getAttachmentKey(projectId, attachmentId));
    }

    public setAttachment(projectId: string, attachmentId: string, attachment: Buffer) {
        if (this.mode == CacheMode.Off) {
            return Promise.resolve();
        }

        this.cache.set(this.getAttachmentKey(projectId, attachmentId), attachment);
    }

    protected getProjectKey(projectName: string): string {
        return `getProject:${projectName}`;
    }

    public getProject(projectName: string): Promise<TeamProjectReference | undefined> {
        if (this.mode == CacheMode.Off) {
            return Promise.resolve(void 0);
        }

        return this.cache.get<TeamProjectReference>(this.getProjectKey(projectName));
    }

    public async setProject(projectName: string, object: TeamProjectReference) {
        if (this.mode == CacheMode.Off) {
            return Promise.resolve();
        }

        this.cache.set(this.getProjectKey(projectName), object);
    }

    protected getWorkItemTypesKey(projectId: string): string {
        return `getWorkItemTypesKey:${projectId}`;
    }

    public getWorkItemTypes(projectId: string): Promise<BacklogWorkItemType[] | undefined> {
        if (this.mode == CacheMode.Off) {
            return Promise.resolve(void 0);
        }

        return this.cache.get<BacklogWorkItemType[]>(this.getWorkItemTypesKey(projectId));
    }

    public async setWorkItemTypes(projectId: string, object: BacklogWorkItemType[]) {
        if (this.mode == CacheMode.Off) {
            return Promise.resolve();
        }

        this.cache.set(this.getWorkItemTypesKey(projectId), object);
    }

    protected getWorkItemStatesKey(projectName: string, types: string[]): string {
        return `getWorkItemStates:${projectName}:${types.join(',')}`;
    }

    public getWorkItemStates(projectName: string, types: string[]): Promise<Record<string, Record<string, string>> | undefined> {
        if (this.mode == CacheMode.Off) {
            return Promise.resolve(void 0);
        }

        return this.cache.get<Record<string, Record<string, string>>>(this.getWorkItemStatesKey(projectName, types));
    }

    public async setWorkItemStates(projectName: string, types: string[], object: Record<string, Record<string, string>>) {
        if (this.mode == CacheMode.Off) {
            return Promise.resolve();
        }

        this.cache.set(this.getWorkItemStatesKey(projectName, types), object);
    }
}

export enum CacheMode {
    Persistent = "persistent",
    Memory = "memory",
    Off = "off"
}