import yargs from 'yargs';
import { Command } from './commands/command';
import { DownloadCommand } from './commands/download';
import { InitCommand } from './commands/init';

const commands: Command[] = [
    new DownloadCommand(),
    new InitCommand(),
];

let commandLine = yargs(process.argv.slice(2));

for (const command of commands) {
    commandLine = command.register(commandLine);
}

let argv = commandLine.demandCommand(1, 1).parse();
