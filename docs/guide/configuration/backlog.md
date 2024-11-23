# Backlog

Each configuration file is composed of one or more backlogs, which can be exported individually.

Each backlog consists of:
 - **[Query](#query)** that defines what work items should be a part of the backlog
 - **[Views](#views)** to highlight named subsets of the backlog work items
 - **[Content](#content)** to structure Work Item types and their hierarchical relationship
 - **[Outputs](#outputs)** that list where export will be saved and what format to use
 - **[Branding](#branding)** to include logos at the top of the exported backlogs
 - **[Appendix](#appendixes)** to optionally include arbitrary content to be included at the end of the exported backlog document

Below is an example of a backlog configuration showcasing most of the elements available as part of the backlog configuration:

```kdl:line-numbers
backlog "Phase1" project="MyProject" query=r#"
        [System.TeamProject] = @project
        AND [System.WorkItemType] IN ('Epic', 'Feature', 'User Story', 'Bug')
        AND (
            [System.WorkItemType] NOT IN ('User Story', 'Bug')
            OR NOT [System.Tags] CONTAINS 'Draft'
        )
        AND [System.State] <> 'Removed'
        ORDER BY [Microsoft.VSTS.Common.StackRank]
        "# {

        brand "assets/CriticalManufacturing.png"
        brand "assets/Vandewiele.png"

        output "_archive/{{it.backlogConfig.name}}-{{it.now | format('yyyyMMdd')}}.html" mkdir=true overwrite=true
        output "{{it.backlogConfig.name}}.html" overwrite=true

        content "Epic" {
            content "Feature" {
                content "User Story" "Bug"
            }
        }

        view "Waiting for approval" query=r#"
           [System.State] = 'Review with Customer'
        "#

        appendix title="Document Version History" r#"
            |Date|Version|Changes|Authors|
            |:--:|:-----:|-------|-------|
            |2024-05-17|1.0|Document Creation and Approval|Katelin Waverly|
            "#
}
```

## Queries

This property is mandatory, to allow the tool to know what work items to include. The query should include all work item types in the same query. The most basic query can be as follows:
```kdl:line-numbers
backlog "Phase1" project="MyProject" query=r#"
        [System.TeamProject] = @project
        "# {
```

### Filtering

This query will return all work items, regardless of type. Most of the time, this is not what we want. Let's imagine that we want to include in our export only **Epics**, **Features**, **User Stories** and **Bugs**, our query could be updated like so:

#### By Work Item Type
```kdl:line-numbers
backlog "Phase1" project="MyProject" query=r#"
        [System.TeamProject] = @project
        AND [System.WorkItemType] IN ('Epic', 'Feature', 'User Story', 'Bug') // [!code ++]
        "# {
```

#### By State
We can also specify any additional filters we want, to exclude work items of those types that we don't want to export. For example, let's imagine that we want to exclude all work items that have `State = Removed`, regardless of type:
```kdl{4}:line-numbers
backlog "Phase1" project="MyProject" query=r#"
        [System.TeamProject] = @project
        AND [System.WorkItemType] IN ('Epic', 'Feature', 'User Story', 'Bug')
        AND [System.State] <> 'Removed' // [!code ++]
        "# {
```

#### By Tag for Specific Types Only
This is great for conditions that apply to all work item types equally. However, what if we want to exclude **User Stories** and **Bugs** that have `Tag = 'Draft'`, but include **Epics** and **Features** that might have that tag too. We could modify our query to something like:
```kdl:line-numbers
backlog "Phase1" project="MyProject" query=r#"
        [System.TeamProject] = @project
        AND [System.WorkItemType] IN ('Epic', 'Feature', 'User Story', 'Bug') // [!code --]
        AND (                                                                 // [!code ++:7]
            [System.WorkItemType] IN ('Epic', 'Feature')
            OR (
                [System.WorkItemType] IN ('User Story', 'Bug')
                AND NOT [System.Tags] CONTAINS 'Draft'
            )
        )
        AND [System.State] <> 'Removed'
        "# {
```

::: tip Alternative Approach
An alternative approach can be to keep the same filter for the types, and negate the new filter, like so:
```kdl:line-numbers
backlog "Phase1" project="MyProject" query=r#"
        [System.TeamProject] = @project
        AND [System.WorkItemType] IN ('Epic', 'Feature', 'User Story', 'Bug')
        AND (                                                                 // [!code ++:4]
            [System.WorkItemType] NOT IN ('User Story', 'Bug')
            OR NOT [System.Tags] CONTAINS 'Draft'
        )
        AND [System.State] <> 'Removed'
        "# {
```

This latter version is more terse than the former, but can also be a bit more confusing. However, in logical terms, they are equivalent, so you can choose the one you prefer.
:::

### Sorting
We can also specify a default sorting on the query, to show our work items ordered as we want them. One of most common ways to sort the items, is by using the `StackRank` field, which matches the sorting that the items have on the backlog inside Azure DevOps.

```kdl:line-numbers
backlog "Phase1" project="MyProject" query=r#"
        [System.TeamProject] = @project
        AND [System.WorkItemType] IN ('Epic', 'Feature', 'User Story', 'Bug')
        AND (
            [System.WorkItemType] NOT IN ('User Story', 'Bug')
            OR NOT [System.Tags] CONTAINS 'Draft'
        )
        AND [System.State] <> 'Removed'
        ORDER BY [Microsoft.VSTS.Common.StackRank] // [!code ++]
        "# {
```

We could, if we wanted, sort by **Title** instead, for example, or by any other property on the work items, of course.

### Saved Queries
Although embedding the *WIQL* conditions is the recommended way to specify the queries to use, it is also possible to use queries saved online inside of Azure DevOps. To do so, one should specify the `query-id` or `query-name` parameter instead of `query`.

```kdl:line-numbers
// Specify Query By Id
backlog "Phase1" project="MyProject" \
        query=r#"..."# \                    // [!code --]
        query-id=r#"..."# \                 // [!code ++]
        {

// Specify Query By Name
backlog "Phase1" project="MyProject" \
        query=r#"..."# \                    // [!code --]
        query-name=r#"..."# \               // [!code ++]
        {
```

::: info
These three parameters `query`, `query-id` and `query-name` are **mutually exclusive**. Only one of them should be specified in a backlog.
:::

## Content
By default, all work items selected are displayed in a flat list. However, most likely, what we want is to display then in a hierarchical structure. This can be done with the `content` element.

```kdl:line-numbers
backlog /* ... */ {
    // ...
    content "Epic" { // [!code hl:5]
        content "Feature" {
            content "User Story" "Bug"
        }
    }
```

To determine the relation between the work items, the standard Parent/Children relationship is used. Different relationships are planned to be supported in the future.

The Work Items of each `content` will be displayed (relative to each other) in the same order as they are returned from the query. This means that, when comparing unrelated Work Items from different types (a **User Story** and an unrelated **Epic**), their ordering relative to each other can be different. But elements on the same level (for example, all **User Stories** and **Bugs** of the same **Feature**) will be correctly ordered between themselves.

::: tip Separating Work Items on the Same Level
On the example above, all **User Stories** and **Bugs** that share the same parent (**Feature**) will be mixed together, following their relative ordering from the backlog query.

However, let's imagine we want to keep them apart, and make sure that **User Stories** always come first, and **Bugs** only afterwards (while keeping the **User Stories** sorted properly among themselves, and the **Bugs** also sorted among themselves). We can do that simply by using two `content` tags on the same level:

```kdl:line-numbers
backlog /* ... */ {
    // ...
    content "Epic" {
        content "Feature" {
            content "User Story" "Bug"  // [!code --]
            content "User Story"        // [!code ++]
            content "Bug"               // [!code ++]
        }
    }
```
:::

### Unparented Work Items

By default, for all work items returned by the backlog query, the exporter tries to fetch their parents, if their parents are not already included in the query. This process repeats itself, getting the parents all the way up to the root level.

:::warning Unparented Work Items
Unparented work items **are not displayed** on the exported document. This may change in a future version, but right now, all work items **must have a parent** that follows the `content` structure defined on the config.
:::

This auto-fetching behavior can be disabled for all work item types of the backlog, through the following configuration:

```kdl:line-numbers
// [!code word:fetch-parents=false]
content-defaults fetch-parents=false

content "Epic" {
    // ...
```

::: details Example Scenario
With auto fetching disabled, for an work item to be exported, all of its parents need to also be returned in the query.

For example, imagining the following backlog below, with two epics, each with 1 Feature and 2 User Stories. Assuming our query returns only the highlighted lines (`Epic 1, Feature 1, User Story 1, Epic 2, User Story 3`):
```text
Epic 1                  // [!code hl]
  └─┬Feature 1          // [!code hl]
    ├──User Story 1     // [!code hl]
    └──User Story 2
Epic 2                  // [!code hl]
  └─┬Feature 2
    ├──User Story 3     // [!code hl]
    └──User Story 4
```

We would get a warning indicating that `User Story 3` would not be included in the export, because even though it is selected by the query, its parent `Feature 2` is not.
:::

In can also be disabled on a per work item type basis:

```kdl:line-numbers
// [!code word:fetch-parents=false]
content "Epic" {
    content "Feature"  {
        content "User Story" "Bug" fetch-parents=false
    }
}
```

In this scenario, all **User Stories**, **Bugs** and **Features** must be explicitly returned by the backlog queries. Only the **Epics** will be auto-fetched based on the features returned.

## Views
Views allow each backlog file to contain tabs (one per view) that highlight a subset of the entire exported backlog (by hiding the other work items that are not part of the view).

::: warning
Work items included on a view will always be a subset of the work items on the entire exported backlog.

Also, currently, views **do not change the order** of the work-items. Instead, their relative order is maintained the same as the one for the entire backlog.
:::

```kdl:line-numbers
backlog /* ... */ {
    // ...
    view "Waiting for approval" query=r#"           // [!code hl:3]
        [System.State] = 'Review with Customer'
    "#
}
```

Each view has a name, which will be displayed as the tab label. It should be unique within each backlog (no two views can have the same name inside the same backlog).

## Outputs

By default, each backlog will be exported to a file named <span v-pre>`{{it.backlogConfig.name}}.html`</span>. However, if there is at least one `output` tag is found inside the `backlog`, then they will override the default output.

```kdl:line-numbers
backlog /* ... */ {
    // ...
    output "_archive/{{it.backlogConfig.name}}-{{it.now | format('yyyyMMdd')}}.html" mkdir=true overwrite=true
    output "{{it.backlogConfig.name}}.html" overwrite=true
}
```

The value of the `output` tag can also contain dynamic tokens, wrapped in double curly braces <span v-pre>`{{ }}`</span>. Right now, two variables are available to use in those templates:
 - **`it.backlogConfig`** the configuration object for this backlog.
 - **`it.now`** the current date time when exporting

## Branding

It is possible to include logo images in the Top Bar of the export, through the `brand` tag. The recommended amount of branding logos to include in the document is one or two, although it is possible to add more.

```kdl:line-numbers
backlog /* ... */ {
    // ...
    brand "assets/MyCompany.png"            // [!code hl:2]
    brand "assets/CustomerCompany.png"
}
```

 - **One logo** Will be displayed on the left side of the top bar (usually the logo of your company)
 - **Two logos** Each logo will be displayed on either end of the top bar, on an horizontal axis (usually the logo of your company and the logo of your customer).
 - **Three logos or more** Each logo will be displayed horizontal to each other, with equal spacing between them.

::: warning Image Path Location
The image path should be an absolute path, or relative to the current working directory (the directory where the command was executed).
:::

## Appendices
You can include appendices (arbitrary pieces of content) at the end of the document, by including the `appendix` tag. The content should be in markdown format.

```kdl:line-numbers
backlog /* ... */ {
    // ...
    
    appendix title="Document Version History" r#"                           // [!code hl:5]
        |Date|Version|Changes|Authors|
        |:--:|:-----:|-------|-------|
        |2024-05-17|1.0|Document Creation and Approval|Katelin Waverly|
        "#
}
```
