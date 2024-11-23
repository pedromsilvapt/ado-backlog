# Getting Started

**ADO Backlog** is a NodeJS command line tool, designed primarly to generate self-contained exports of backlogs hosted on an Azure DevOps instance.

In this guide, you will learn how to install the tool, configure it and execute it.

You can also find a separate [Reference](/reference/command-line) section, for more in-depth and thorough documentation of the various features offered by this tool.

## Installation

This tool is available as an [NPM](https://www.npmjs.com/package/ado-backlog) package. To install it, you must have [NodeJS](https://nodejs.org) installed.

```sh
npm install -g ado-backlog
```

**Alternatively**, if you do not have NPM/NodeJS installed on your machine, you can download a static binary directly from GitHub, by clicking [here](https://github.com/pedromsilvapt/ado-backlog/releases).

:::: details (Optional) Adding the Binary Command to Path
This section is only relevant if you have downloaded the tool binary manually (as opposed to installing it through NPM),

In those cases, it is recommended that you store it somewhere accessible by your `PATH` environment variable. This allows you to execute the command from any folder on your computer.

On a *Windows* machine, press `Windows + R`. On the newly opened dialog, type the following: `cmd.exe`, and then press `Ctrl + Shift + Enter`, to open the command line with elevated Administrator permissions.

On the command line window, enter the following line, replacing the string <span v-pre>`{{path}}`</span> with the **full absolute path** of the folder where the file **ado-backlog.exe** is located.
```shell
setx /M path "%path%;{{path}}"
```

::: danger
This action can be dangerous, and erase or corrupt the contents of your `PATH` variable, if you do not follow these instructions closely.
:::
::::

## Usage

To get started working with this tool, we need to create a configuration file first. Configuration files are written in the [KDL](https://kdl.dev/) language. To do so, run the `init`  command, which will create a baseline configuration file for us:

```sh
ado-backlog init
```

When executing this command, you will be prompted with a couple of questions to help you create the configuration file, such as the URL of your organization's Azure DevOps, as well as a token to allow the tool to authenticate and access the backlog.

```ansi
[?25h[90m┌[39m  ado backlog
[?25l[90m│[39m
[32m◇[39m  Name of the file to store these configurations?
[?25h[90m│[39m  [2mconfig.kdl[7m[8m_[28m[27m[22m
[?25h[90m│[39m
[32m◇[39m  What is your organization's Azure DevOps URL?
[?25h[90m│[39m  [2mhttps://dev.azure.com/{{username}}[22m
[?25h[90m│[39m
[32m◇[39m [0m[0m [90m───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╮[39m
[?25h[90m│[39m  [2m[22m                                                                                                                                   [?25h[90m│[39m
[?25h[90m│[39m  [2mTo create a Personal Access Token, head over to https://dev.azure.com/{{username}}/_usersSettings/tokens and click "New Token".[22m  [?25h[90m│[39m
[?25h[90m│[39m  [2m[22m                                                                                                                                   [?25h[90m│[39m
[?25h[90m│[39m─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯[39m
[?25h[90m│[39m
[36m◇[39m  Personal Access Token
[?25h[90m│[39m  [2mp1wy46imwhblkosg1s1ya7jirqy8xa5ysn9thx9uz1vmreg57duf[22m
[?25h[?25l[90m│[39m
[36m◇[39m  File written
[?25h[90m│[39m
[?25h[90m└[39m  Configuration file created
```

::: details Generating a Personal Access Token
TODO
:::

In the folder where you executed this command, you should now have a file named `config.kdl`. Now that we have the configuration file, 
we can try to generate an export of the backlog.

```sh
ado-backlog download --config config.kdl
```

::: tip
If your backlog is not structured in Epics, Features, User Stories and Bugs, the export may not be 100% successful. Regardless, do not worry, as that is just the default configuration, but you can easily change it to fit any backlog structure you have in your project.

**Read the next pages** for a quick summary of the most useful ways you can change the configurations to match your specific needs.
:::
