import yargs from 'yargs';
import { DownloadCommand } from './commands/download';
import { Command } from './commands/command';

const commands: Command[] = [
    new DownloadCommand()
];

let commandLine = yargs(process.argv.slice(2));

for (const command of commands) {
    commandLine = command.register(commandLine);
}

let argv = commandLine.demandCommand(1, 1).parse();
