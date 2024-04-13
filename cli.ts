import yargs from 'yargs';
import { DownloadCommand } from './commands/download';
import { ConsoleBackend, FilterBackend, MultiBackend, SharedLogger } from 'clui-logger';
import { TIMESTAMP_SHORT } from 'clui-logger/lib/Backends/ConsoleBackend';
import { Config } from '@gallant/config';
import { TfsConfig, TfsConfigFormat } from './common/config';
import { Command } from './commands/command';

// Load configuration file from the current working directory
const config: TfsConfig = Config.load('config.kdl', TfsConfigFormat).data;

// Configure Logger
const logger = new SharedLogger(new MultiBackend([
    new FilterBackend(
        new ConsoleBackend(TIMESTAMP_SHORT),
        config.debug ? [">=debug"] : [">=info"]
    ),
    // Enable logging to a file
    // new FileBackend( this.storage.getPath( 'logs', 'app-:YYYY-:MM-:DD.log' ) ),
]));

const commands: Command[] = [
    new DownloadCommand(logger, config)
];

let commandLine = yargs(process.argv.slice(2));

for (const command of commands) {
    commandLine = command.register(commandLine);
}

let argv = commandLine.demandCommand(1, 1).parse();
