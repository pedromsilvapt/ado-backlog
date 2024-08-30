# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),

## Unreleased

### Added
 - Allow setting the `mkdir` and `overwrite` properties on the output configurations
    ```json
    output "_archive/{{it.backlogConfig.name}}-{{it.now | format('yyyyMMdd')}}.html" mkdir=true
    output "{{it.backlogConfig.name}}.html" overwrite=true
    ```

### Fixed
 - Fixed topbar hiding top of work items when clicking on links to them


## [0.3.0] - 2024-05-17

### Added
 - Multiple outputs directly on the config file, per backlog
    ```json
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
    node cli.js download Phase1 Phase2
    ```
   **Breaking Change** The `backlogs` argument is optional, and when not provided in the command, all backlogs present in the configuration file are downloaded sequentially, a change from the old behavior of downloading the first configured backlog only.
 - Add Brand images to a backlog, to be included on the top of the document. They are spaced evenly among themselves on an horizontal axis.
    ```json
    brand "CriticalManufacturing.png"
    brand "Vandewiele.png"
    ```
    For better results, the images should:
      - Follow the style of an horizontal banner, with the logo on the left, and the brand name on the right side
      - Have a transparent background (`*.png` format is advised)
      - Be cropped without any empty padding on the image itself (this prevents images with different paddings from looking bigger or smaller)
 - Add arbitrary markdown-formatted appendixes to the backlog export, such as document version history tables:
    ```json
        appendix title="Document Version History" r#"
    |Date|Version|Changes|Authors|
    |:--:|:-----:|-------|-------|
    |2024-05-17|1.0|Document Creation and Approval|Project Manager Name|
        "#
    ```

## [0.2.0] - 2024-04-14

### Added

 - Work-item type overrides (icon, color, states, etc...)
    ```json
    workItems {
        type "User Story" {
            state "Review Internally" color="D800FF"
            state "Review with Customer" color="B10000"
            state "Ready" color="AEDDFF"
        }
    }
    ```
 - Work-item specific columns for the table of contents. **Note** The number of columns for all work item types must be the same!
    ```json
    value width="90px"  header="State" field="System.State"
    // For the story points, omit the field for Epic and Feature work items, so the column is empty
    value width="60px" header="Story Points" { workItems "Epic" "Feature"; }
    value width="60px" header="Story Points" field="Microsoft.VSTS.Scheduling.StoryPoints" align="right" { workItems "User Story" "Bug"; }
    value width="200px" header="Value Area" field="Microsoft.VSTS.Common.ValueArea"
    ```
 - Possibility to query the backlog by a WIQL expression (`backlog query="..."`), or by query name (`backlog query-name="..."`) in addition to the already existing query by id functionality (`backlog query-id="..."`)
 - Backlog views to allow the user to see predefined "slices" of the backlog. These should be defined inside the `backlog` tag.
    ```json
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

    **Note** For raw WIQL queries, it is recommended to use the raw string syntax (`r#"..."#`) which alleviates the need for escaping characters and supports multi-line strings.

    **Tip** If the WIQL query is used on both the Backlog and the View, the View query will also apply the same conditions as the backlog does, in addition to whatever specific conditions the view has. To get the WIQL string, you can build a query in TFS and then click the button **Edit WIQL**
 - Back to top button on the bottom right corner of the screen
 - Optional `--config`/`-c` to specify a config file path different from the default `config.kdl`. This allows to have multiple config files for different backlogs, and choose which one to export.

### Changed
 - Renamed the old property `query` from the `backlog` tag to `query-id`

### Fixed

 - TOC grid size overflow when work items have long titles


## [0.1.0] - 2024-04-12

### Added

- Initial release
