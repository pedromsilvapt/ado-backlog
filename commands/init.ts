import { Command } from './command';
import yargs from 'yargs';
import { cancel, confirm, intro, isCancel, outro, text, log, spinner, note } from '@clack/prompts';
import fs from 'fs/promises';

export class InitCommand extends Command {
    static description = 'Initialize a base config file to use this tool';

    public readonly name: string = "init [configFile]";

    public readonly usage: string = "init [configFile]";

    public readonly loadConfig: boolean = false;

    public configure(yargs: yargs.Argv<{}>): void {
        yargs.positional('configFile', {
            type: 'string',
            default: null,
            describe: 'name of the configuration file to create',
            demandOption: false,
        });

        yargs.option('overwrite', {
            describe: 'overwrite existing output folder',
            type: 'boolean',
            boolean: true,
        });
    }

    async run(args: InitCommandOptions): Promise<void> {
        intro("ado backlog");

        let configFile: string | symbol = args.configFile;

        if (configFile == null) {
            configFile = await text({
                message: 'Name of the file to store these configurations?',
                placeholder: 'The default file name used by this tool is config.kdl. However, you can give it a different name, if you want to have more than one configuration file on the same folder.',
                initialValue: 'config.kdl',
                validate(value) {
                    if (value.length === 0) return `Value is required!`;
                },
            });

            if (isCancel(configFile)) {
                cancel("Config initialization aborted.");
                return;
            }
        }

        const fileExists = await fs.access(configFile).then(() => true, () => false);

        if (fileExists) {
            let overwrite: boolean | symbol | undefined = args.overwrite;

            if (overwrite == null) {
                overwrite = await confirm({
                    message: "A file with this name already exists in the folder. Do you want to overwrite it?",
                    initialValue: false,
                });

                if (isCancel(overwrite) || !overwrite) {
                    cancel("Config initialization aborted");
                    return;
                }
            }
        }

        var organizationUrl = await text({
            message: "What is your organization's Azure DevOps URL?",
            placeholder: "For example, 'https://dev.azure.com/{{organizationName}}/'"
        });

        let token: string | symbol | null = null;

        if (isCancel(organizationUrl)) {
            cancel("Config initialization aborted");
            return;
        }

        if (organizationUrl == null) {
            log.warn("The organizationUrl field will be created empty, you will need to manually edit the file to set it before being able to use the tool.")
        } else {
            note(`To create a Personal Access Token, head over to ${organizationUrl}/_usersSettings/tokens and click "New Token".`)

            token = await text({
                message: "Personal Access Token",
                placeholder: "Generate a Personal Access Token inside your Azure DevOps, and paste it here"
            });

            if (isCancel(token)) {
                cancel("Config initialization aborted");
                return;
            }

            if (token == null) {
                log.warn("The token field will be created empty. You will need to manually edit the file to set it before being able to use the tool.")
            }
        }

        const projectName = await text({
            message: 'What is the Project Name from which to export the Backlog?',
            placeholder: 'Name of the Project',
            validate(value) {
                if (value.length === 0) return `Value is required!`;
            },
        });

        if (isCancel(projectName)) {
            cancel("Config initialization aborted.");
            return;
        }

        const spin = spinner();

        spin.start("Writing file...");

        var configTemplate = `config {
    api organizationUrl="${organizationUrl}" \\
		token="${token}" \\
        ignoreSsl=false

    backlog "${projectName}" copyright="<Your Company Name>" project="${projectName}" query=r#"
            [System.TeamProject] = @project
            AND [System.WorkItemType] IN ('Epic', 'Feature', 'User Story', 'Bug')
			AND [System.State] <> 'Removed'
            ORDER BY [Microsoft.VSTS.Common.StackRank]
            "# {

        output "{{it.backlogConfig.name}}.html" overwrite=true

        content "Epic" {
            content "Feature" {
                content "User Story" "Bug"
            }
        }
    }

    toc mode="grid" hide-header=true {
        value width="90px"  header="State" field="System.State"
        value width="60px" header="Story Points" field="Microsoft.VSTS.Scheduling.StoryPoints" align="right"
        value width="200px" header="Value Area" field="Microsoft.VSTS.Common.ValueArea"
        value width="250px" header="Tags" field="System.Tags"
        value width="200px" header="Modified On" field="System.ChangedDate"
    }

    template "Epic" {
        metadata columns=2 {
            column { section header="State" field="System.State"; }
            column { section header="Modified" field="System.ChangedDate"; }

            row { tags; }
        }

        section field="System.Description" richText=true
        links label="Features" "System.LinkTypes.Hierarchy-Forward"
    }

    template "Feature" {
        metadata columns=2 {
            column { section header="State" field="System.State"; }
            column { section header="Modified" field="System.ChangedDate"; }

            row { links label="Epic" "System.LinkTypes.Hierarchy-Reverse" single=true; }

            row { tags; }
        }

        section field="System.Description" richText=true
        links label="User Stories" "System.LinkTypes.Hierarchy-Forward"
    }

    template "User Story" {
        metadata columns=2 {
            column { section header="Iteration" field="System.IterationPath"; }
            column { section header="Story Points" field="Microsoft.VSTS.Scheduling.StoryPoints"; }

            column { section header="State" field="System.State"; }
            column { section header="Modified" field="System.ChangedDate"; }

            row { links label="Feature" single=true "System.LinkTypes.Hierarchy-Reverse"; }

            row { tags; }
        }

        section field="System.Description" richText=true
        section header="Acceptance Criteria" field="Microsoft.VSTS.Common.AcceptanceCriteria" richText=true
        section header="Release Notes" field="Project.ReleaseNotes" richText=true
    }

    template "Bug" {
        metadata columns=2 {
            column { section header="Iteration" field="System.IterationPath"; }
            column { section header="Story Points" field="Microsoft.VSTS.Scheduling.StoryPoints"; }

            column { section header="State" field="System.State"; }
            column { section header="Modified" field="System.ChangedDate"; }

            row { links label="Feature" single=true "System.LinkTypes.Hierarchy-Reverse"; }

            row { tags; }
        }

        section header="Repro Steps" field="Microsoft.VSTS.TCM.ReproSteps" richText=true
        section header="Release Notes" field="Project.ReleaseNotes" richText=true
    }
}
`
        try {
            await fs.writeFile(configFile, configTemplate, { encoding: 'utf8' });
            spin.stop("File written", 0);
        } catch (err: any) {
            spin.stop("Writing file failed: " + err.message, 1);
        }

        outro("Configuration file created");
    }
}

export interface InitCommandOptions {
    configFile: string;
    overwrite?: boolean;
}
