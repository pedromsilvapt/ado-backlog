import { LoggerInterface, SharedLoggerInterface } from 'clui-logger';
import { TfsConfig, TfsConfigFormat } from '../common/config';
import { ConsoleBackend, FilterBackend, MultiBackend, SharedLogger } from 'clui-logger';
import { TIMESTAMP_SHORT } from 'clui-logger/lib/Backends/ConsoleBackend';
import { Config } from '@gallant/config';
import yargs from 'yargs';
import { IMetricsContainer, MetricsContainer } from '../common/metrics';

export abstract class Command {
    logger: LoggerInterface | null = null;

    config: TfsConfig | null = null;

    metrics: IMetricsContainer | null = null;

    readonly loadConfig: boolean = true;

    abstract readonly name : string;

    abstract readonly usage : string;

    public constructor() {}

    public register( yargv : yargs.Argv ) : yargs.Argv {
        return yargv.command( this.name, this.usage, this.configure.bind(this), async (argv) => {
            const configPath = (argv.config as string) || 'config.kdl';

            // Load configuration file from the current working directory
            const config: TfsConfig = this.loadConfig
                ? Config.load(configPath, TfsConfigFormat).data
                : new TfsConfig();

            // Configure Logger
            const logger = new SharedLogger(new MultiBackend([
                new FilterBackend(
                    new ConsoleBackend(TIMESTAMP_SHORT),
                    config.debug ? [">=debug"] : [">=info"]
                ),
                // Enable logging to a file
                // new FileBackend( this.storage.getPath( 'logs', 'app-:YYYY-:MM-:DD.log' ) ),
            ]));

            this.config = config;
            this.logger = logger.service(this.constructor.name);

            const rootMetrics = new MetricsContainer(this.logger);
            rootMetrics.create([this.name]);

            this.metrics = rootMetrics.for(this.name);

            await rootMetrics.measureAsync(
                this.name,
                () => this.run(argv)
                    .catch(err => this.logger!.error(err.message + '\n' + (err.stack ?? '')))
            );

            if ((argv.profile as boolean)) {
                this.logger!.info('Profiling metrics summary:');

                rootMetrics.printSummary();
            }
        } );
    }

    abstract configure(yargs : yargs.Argv) : void;

    abstract run(args: object): Promise<void>;
}
