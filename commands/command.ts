import { LoggerInterface, SharedLoggerInterface } from 'clui-logger';
import { TfsConfig, TfsConfigFormat } from '../common/config';
import { ConsoleBackend, FilterBackend, MultiBackend, SharedLogger } from 'clui-logger';
import { TIMESTAMP_SHORT } from 'clui-logger/lib/Backends/ConsoleBackend';
import { Config } from '@gallant/config';
import yargs from 'yargs';

export abstract class Command {
    logger: LoggerInterface | null = null;

    config: TfsConfig | null = null;

    abstract readonly name : string;

    abstract readonly usage : string;

    public constructor() {}

    public register( yargv : yargs.Argv ) : yargs.Argv {
        return yargv.command( this.name, this.usage, this.configure.bind(this), (argv) => {

            // Load configuration file from the current working directory
            const config: TfsConfig = Config.load((argv.config as string) || 'config.kdl', TfsConfigFormat).data;

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
            this.logger = logger.service(this.constructor.name)

            this.run(argv).catch(err => this.logger!.error(err.message + '\n' + (err.stack ?? '')));
        } );
    }

    abstract configure(yargs : yargs.Argv) : void;

    abstract run(args: object): Promise<void>;
}
