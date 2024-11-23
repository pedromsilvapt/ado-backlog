---
outline: [2, 2]
---
# Release Notes

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),

## Unreleased

### Added
 - Allow setting the `mkdir` and `overwrite` properties on the output configurations
    ```kdl
    output "_archive/{{it.backlogConfig.name}}-{{it.now | format('yyyyMMdd')}}.html" mkdir=true
    output "{{it.backlogConfig.name}}.html" overwrite=true
    ```
 - Added the [`ado-backlog init`](/guide/getting-started#usage) command to scaffold a basic configuration file
 - Added `--profile` option to `download` command to display time statistics.
    
   ```shell
   # The ellipsis ... represent any other options you
   # normally pass to the download command
   ado-backlog download --profile ...
   ```
 - Config option `fetch-parents` for backlog content
    ```kdl
    // [!code word:fetch-parents=true]
    content-defaults fetch-parents=true

    content "Epic" {
        // ...
    ```
   :::: details More details

   When this option is active, only the child work items (**User Story** and **Bugs** in the example above) need to be specified in the backlog query. Their parents will be fetched on demand and automatically included on the backlog. 
   
   This means that the backlog query can, **optionally**, be modified according to the example below and still export the same work items.
    ```kdl:line-numbers
    backlog "Phase1" project="MyProject" query=r#"
            [System.TeamProject] = @project
            AND [System.WorkItemType] IN ('Epic', 'Feature', 'User Story', 'Bug') // [!code --]
            AND [System.WorkItemType] IN ('User Story', 'Bug') // [!code ++]
            AND [System.State] <> 'Removed'
            "# {
    ```
    ::::

    ::: danger Breaking Change
    This behavior is now enabled **by default**. This means that parent work items that were not previously included in backlogs, might from now on start to be. You can revert back to the previous behavior by setting `fetch-parents=false`.
    :::
 - Config option `order-by` for backlog content
    ```kdl
    content-defaults fetch-parents=true {
        order-by "Microsoft.VSTS.Common.StackRank" // [!code ++]
    }

    content "Epic" {
        // ...
    ```
    :::: details More details
    You can also specify multiple order-by tags, and specify different directions (`asc` by default, or `desc` if specified) for each of them.

    ```kdl
    content-defaults fetch-parents=true {
        order-by "Microsoft.VSTS.Common.Priority" "desc" // [!code ++]
        order-by "Microsoft.VSTS.Common.StackRank" "asc" // [!code ++]
    }
    ```

    The example above will sort work items by **Priority** in **descending** order first. Any work items with the same priority, will be sorted amongst themselves by **Stack Rank**, in **ascending** order.

    Additionally, this option can also be overridden for each `content` level.    
    ```kdl
    content-defaults fetch-parents=true {
        order-by "Microsoft.VSTS.Common.StackRank"
    }

    content "Epic" {
        content "Feature" {
            content "User Story" "Bug" {
                order-by "Microsoft.VSTS.Common.Priority" "desc" // [!code ++]
            }
        }
    }
    ```
    **Note** that the ordering applies to the content where it is, not to it's children. Here, **Epics** and **Features** would follow the stack rank order, but inside each Feature, **User Stories** and **Bugs** would follow the Priority order instead.
    ::::
    
    ::: danger Breaking Change
    This behavior is now enabled by default, sorting by `Microsoft.VSTS.Common.StackRank` unless explicitly configured otherwise.

    This means that the `ORDER BY` clause **returned by the query is ignored**. If your query was ordering by the stack rank property, you can just remove it.

    ```kdl:line-numbers
    backlog "Phase1" project="MyProject" query=r#"
            [System.TeamProject] = @project
            AND [System.WorkItemType] IN ('User Story', 'Bug')
            AND [System.State] <> 'Removed'
            ORDER BY [Microsoft.VSTS.Common.StackRank] // [!code --]
            "# {
    ```

    If your `ORDER BY` clause was returning the work items sorted by a different field, you must now configure that field on the `order-by` tag instead.
    :::
 - Repeated downloads of the same backlog are now faster thanks to some performance optimizations, and a new optional cache system.
 - Fields with default values can be ignored (considered as empty) by specified the list of possible values to be ignored
   ```kdl:line-numbers
   section header="Release Notes" field="Project.ReleaseNotes" richText=true {
        // If the field has this value (a single dash), then it is considered 
        // as empty and is not exported [!code hl]
        ignored-value "-" // [!code ++]
   }
   ```

### Fixed
 - Fixed topbar hiding top of work items when clicking on links to them
 - Fixed error thrown when downloading a backlog containing a work item without any relation at all
 - Bold text was not rendering as bold when exporting


## [0.3.0] - 2024-05-17

### Added
 - Multiple outputs directly on the config file, per backlog
    ```kdl
    output "_archive/{{it.backlogConfig.name}}-{{it.now | format('yyyyMMdd')}}.html"
    output "{{it.backlogConfig.name}}.html"
    ```
    Most commonly, the format to use is derived from the file extension. Additionally each output may contain an optional `format="<format_name>"` to override which format to use.
    Supported formats currently are `html` (standard), `json` (mostly useful for debugging, since it contains the raw data about the work items, including all fields) or `md` (incomplete).

    Additionally, the output supports template tokens (implemented using [SquirrellyJS](https://squirrelly.js.org/))named:
     - `backlogConfig` gives access to the properties of this backlog's configuration
     - `now` gives a date time object which can be used in conjunction with the `format` filter (which uses the [luxon formating syntax](https://moment.github.io/luxon/#/formatting?id=table-of-tokens)).
 - Multiple backlog names can now be provided in a single `download` command execution:
    ```bash
    # Downloading multiple backlogs
    node cli.js download Phase1 Phase2
    # Downloading multiple backlogs with spaces in their names
    node cli.js download "Phase 1" "Phase 2"
    ```

    ::: danger Breaking Change
    The `backlogs` argument is optional, and when not provided in the command, all backlogs present in the configuration file are downloaded sequentially, a change from the old behavior of downloading the first configured backlog only.
    :::
 - Add Brand images to a backlog, to be included on the top of the document. They are spaced evenly among themselves on an horizontal axis.
    ```kdl
    brand "CriticalManufacturing.png"
    brand "Vandewiele.png"
    ```
    For better results, the images should:
      - Follow the style of an horizontal banner, with the logo on the left, and the brand name on the right side
      - Have a transparent background (`*.png` format is advised)
      - Be cropped without any empty padding on the image itself (this prevents images with different paddings from looking bigger or smaller)
 - Add arbitrary markdown-formatted appendixes to the backlog export, such as document version history tables:
    ```kdl
        appendix title="Document Version History" r#"
    |Date|Version|Changes|Authors|
    |:--:|:-----:|-------|-------|
    |2024-05-17|1.0|Document Creation and Approval|Project Manager Name|
        "#
    ```

## [0.2.0] - 2024-04-14

### Added

 - Work-item type overrides (icon, color, states, etc...)
    ```kdl
    workItems {
        type "User Story" {
            state "Review Internally" color="D800FF"
            state "Review with Customer" color="B10000"
            state "Ready" color="AEDDFF"
        }
    }
    ```
 - Work-item specific columns for the table of contents. 
    
    ```kdl
    value width="90px"  header="State" field="System.State"
    // For the story points, omit the field for Epic and Feature work items, so the column is empty
    value width="60px" header="Story Points" { workItems "Epic" "Feature"; }
    value width="60px" header="Story Points" field="Microsoft.VSTS.Scheduling.StoryPoints" align="right" { workItems "User Story" "Bug"; }
    value width="200px" header="Value Area" field="Microsoft.VSTS.Common.ValueArea"
    ```
    ::: warning
    The number of columns for all work item types must be the same!
    :::
   
 - Possibility to query the backlog by a WIQL expression (`backlog query="..."`), or by query name (`backlog query-name="..."`) in addition to the already existing query by id functionality (`backlog query-id="..."`)
 - Backlog views to allow the user to see predefined "slices" of the backlog. These should be defined inside the `backlog` tag.
    ```kdl
    view "Changed Since 08 Apr 2024" query=r#"
        [System.ChangedDate] >= '2024-04-08T00:00:00.0000000'
    "#
    view "Sprint 3 (Previous)" query=r#"
        [System.IterationPath] = @currentIteration('[Vandewiele]\Vandewiele Team <id:6ae09c99-d9f7-48c9-9c62-cc518e22f096>') - 1
    "#
    view "Sprint 4 (Current)" query=r#"
        [System.IterationPath] = @currentIteration('[Vandewiele]\Vandewiele Team <id:6ae09c99-d9f7-48c9-9c62-cc518e22f096>')
    "#
    view "Sprint 5 (Next - Pre-planning)" query=r#"
        [System.IterationPath] = @currentIteration('[Vandewiele]\Vandewiele Team <id:6ae09c99-d9f7-48c9-9c62-cc518e22f096>') + 1
    "#
    ```
    The same query facilities (id, name, wiql) are available here as they are on the backlog level.

    ::: info
    For raw WIQL queries, it is recommended to use the raw string syntax (`r#"..."#`) which alleviates the need for escaping characters and supports multi-line strings.
    :::

    ::: tip
    If the WIQL query is used on both the Backlog and the View, the View query will also apply the same conditions as the backlog does, in addition to whatever specific conditions the view has. To get the WIQL string, you can build a query in TFS and then click the button **Edit WIQL**
    :::
 - Back to top button on the bottom right corner of the screen
 - Optional `--config`/`-c` to specify a config file path different from the default `config.kdl`. This allows to have multiple config files for different backlogs, and choose which one to export.

### Changed
 - Renamed the old property `query` from the `backlog` tag to `query-id`

### Fixed

 - TOC grid size overflow when work items have long titles


## [0.1.0] - 2024-04-12

### Added

- Initial release
