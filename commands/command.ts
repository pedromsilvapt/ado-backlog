import { LoggerInterface, SharedLoggerInterface } from 'clui-logger';
import { TfsConfig } from '../common/config';
import yargs from 'yargs';

export abstract class Command {
    readonly logger: LoggerInterface;

    readonly config: TfsConfig;

    abstract readonly name : string;

    abstract readonly usage : string;

    public constructor(logger: LoggerInterface | SharedLoggerInterface, config : TfsConfig) {
        this.logger = logger.service(this.constructor.name);
        this.config = config;
    }


    public register( yargv : yargs.Argv ) : yargs.Argv {
        return yargv.command( this.name, this.usage, this.configure.bind(this), (argv) => {
            this.run(argv).catch(err => this!.logger.error(err.message + '\n' + (err.stack ?? '')));
        } );
    }

    abstract configure(yargs : yargs.Argv) : void;

    abstract run(args: object): Promise<void>;
}
