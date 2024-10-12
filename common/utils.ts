import chalk from 'chalk';

export function sum<T>(iterable: Iterable<T>, accessor: (elem: T) => number): number {
    let total = 0;

    for (const elem of iterable) {
        total += accessor(elem);
    }

    return total;
}

export function count(iterable: Iterable<unknown>): number {
    let total = 0;

    for (const _ of iterable) {
        total += 1;
    }

    return total;
}

export function max<T>(iterable: Iterable<T>, accessor: (elem: T) => number): number {
    let maxValue = 0;

    for (const elem of iterable) {
        const elemValue = accessor(elem);

        if (maxValue === null || maxValue < elemValue) {
            maxValue = elemValue;
        }
    }

    return maxValue;
}

export function pp(raw: TemplateStringsArray, ...variables: unknown[]) {
    return String.raw({raw}, ...variables.map(value => {
        if (value === null) {
            return chalk.yellow('(null)');
        } else if (typeof value === 'undefined') {
            return chalk.yellow('(undefined)');
        } else if (typeof value === 'string') {
            return chalk.yellow(JSON.stringify(value));
        } else if (typeof value === 'number') {
            return chalk.cyan(value);
        } else if (typeof value === 'boolean') {
            return value ? chalk.green('true') : chalk.red('false');
        } else if (typeof value === 'object') {
            return JSON.stringify(value, null, 2);
        }
    }));
}

export function streamToBuffer(stream: NodeJS.ReadableStream) {
    const chunks: Buffer[] = [];
    return new Promise<Buffer>((resolve, reject) => {
        stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        stream.on('error', (err) => reject(err));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
}

export async function streamToString(stream: NodeJS.ReadableStream) {
    const buffer = await streamToBuffer(stream);

    return buffer.toString('utf-8');
}

export async function streamToBase64(stream: NodeJS.ReadableStream) {
    const buffer = await streamToBuffer(stream);

    return buffer.toString('base64');
}

export function humanizeDuration(duration: number) : {value: number, unit: 'µs' | 'ms' | 'sec' | 'min' | 'h'} {
    if (duration < 1) {
        return { value: (duration % 1 * 1000), unit: 'µs' };
    } else if (duration < 1000) {
        return { value: round(duration), unit: 'ms' };
    } else if (duration < 1000 * 60) {
        return { value: round(duration / 1000, 2), unit: 'sec' };
    } else if (duration < 1000 * 60 * 60) {
        return { value: Math.round(duration / 1000 / 60), unit: 'min' };
    } else { // 1000 * 60 * 60 * 24
        return { value: Math.round(duration / 1000 / 60 / 60), unit: 'h' };
    }
}

export function humanizeDurationString(duration: number) : string {
    const humanDuration = humanizeDuration(duration);

    return `${humanDuration.value} ${humanDuration.unit}`;
}

export function round(n: number, digits: number = 0): number {
    if (digits == 0) return Math.round(n);

    const power = Math.pow(10, digits);

    return Math.round(n * power) / power;
}
