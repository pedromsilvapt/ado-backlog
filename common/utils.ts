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
