import { LoggerInterface, pp } from 'clui-logger';
import { humanizeDuration, humanizeDurationString } from './utils';

export class Metric {
    readonly name: string;

    logger: LoggerInterface | undefined;

    protected _durations: number[] = [];

    public get totalDuration(): number {
        let sum = 0;

        for (let d of this._durations) {
            sum += d;
        }

        return sum;
    }

    constructor(name: string, logger?: LoggerInterface) {
        this.name = name;
        this.logger = logger;
    }

    public register(durationMs: number) {
        this._durations.push(durationMs);

        if (this.logger != null) {
            const humanDuraation = humanizeDuration(durationMs);

            this.logger?.debug(pp`Collected ${this.name} with duration ${humanDuraation.value} ` + humanDuraation.unit + ".");
        }
    }

    public measure<T>(fn: () => T) {
        const start = performance.now();

        try {
            return fn();
        } finally {
            const end = performance.now();

            this.register(end - start);
        }
    }

    public async measureAsync<T>(fn: () => Promise<T>) {
        const start = performance.now();

        try {
            return await fn();
        } finally {
            const end = performance.now();

            const duration = end - start;

            this._durations.push(duration);

            if (this.logger != null) {
                const humanDuraation = humanizeDuration(duration);

                this.logger?.debug(pp`Collected ${this.name} with duration ${humanDuraation.value} ` + humanDuraation.unit + ".");
            }
        }
    }

    public printSummary() {
        const totalDuration = this.totalDuration;
        const totalOperations = this._durations.length;
        const averageDuration = totalOperations > 0 ? totalDuration / totalOperations : 0;

        this.logger?.info(pp`Action ${this.name} took ${humanizeDurationString(totalDuration)} (${totalOperations} ops, avg ${humanizeDurationString(averageDuration)}).`);
    }
}

export interface IMetricsContainer<K extends string = string> {
    readonly name: string | null;

    readonly parent: IMetricsContainer | null;

    readonly root: IMetricsContainer;

    for(namespace: string): IMetricsContainer;

    get(name: K): Metric;

    tryGet(name: K): Metric | undefined;

    create<K extends string[]>(names: K): Record<typeof names[number], Metric>;

    add(metric: Metric): void;

    measure<T>(name: K, fn: () => T): T;

    measureAsync<T>(name: K, fn: () => Promise<T>): Promise<T>;

    printSummary(): void;
}

export class MetricsContainer<K extends string = string> implements IMetricsContainer<K> {
    public name: string | null = null;

    public parent: IMetricsContainer | null = null;

    public metrics: Metric[] = [];

    public readonly logger: LoggerInterface;

    public get root(): IMetricsContainer {
        if (this.parent == null) {
            return this;
        } else {
            return this.parent.root;
        }
    }

    public constructor(logger: LoggerInterface, name: string | null = null, parent: IMetricsContainer | null = null) {
        this.name = name;
        this.parent = parent;
        this.logger = logger;
    }

    protected getChildName(name: string): string {
        if (this.name == null || this.name == '') {
            return name;
        } else {
            return this.name + '.' + name;
        }
    }

    for(namespace: string): IMetricsContainer {
        return new MetricsContainer(this.logger, namespace, this);
    }

    get(name: K): Metric {
        const metric = this.tryGet(name);

        if (metric == null) {
            throw new Error(`No metric named ${name} found.`);
        }

        return metric;
    }

    tryGet(name: K): Metric | undefined {
        if (this.parent == null) {
            return this.metrics.find(m => m.name == name);
        } else {
            return this.root.tryGet(this.getChildName(name));
        }
    }

    add(metric: Metric) {
        if (this.parent == null) {
            this.metrics.push(metric);
        } else {
            this.root.add(metric);
        }
    }

    create<K extends string[]>(names: K): Record<typeof names[number], Metric> {
        const root = this.root;

        const records: Record<typeof names[number], Metric> = {} as any;

        for (const name of names) {
            const fullName = this.getChildName(name);

            let metric = root.tryGet(fullName);

            if (metric == null) {
                metric = new Metric(fullName, this.logger)

                root.add(metric);
            }

            records[name as typeof names[number]] = metric;
        }

        return records;
    }

    measure<T>(name: K, fn: () => T) {
        return this.get(name).measure(fn);
    }

    measureAsync<T>(name: K, fn: () => Promise<T>) {
        return this.get(name).measureAsync(fn);
    }

    printSummary() {
        for (const metric of this.metrics) {
            metric.printSummary();
        }
    }
}

export function Profile(metricName: string) {
    return function (target: any, key: string, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value as Function;
        descriptor.value = function (...args: any[]) {
            const metric = (this as any)?.metrics?.[metricName];

            if (metric != null && metric instanceof Metric) {
                metric.measure(() => originalMethod.apply(this, args));
            } else {
                throw new Error(`Invalid metric name ${metricName}`);
            }
        };
        return descriptor;
    };
}

export function ProfileAsync(metricName: string) {
    return function (target: any, key: string, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value as Function;
        descriptor.value = async function (...args: any[]) {
            const metric = (this as any)?.metrics?.[metricName];

            if (metric != null && metric instanceof Metric) {
                return await metric.measureAsync(() => originalMethod.apply(this, args));
            } else {
                throw new Error(`Invalid metric name ${metricName}`);
            }
        };
        return descriptor;
    };
}

