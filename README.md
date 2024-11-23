# ADO Backlog
[Documentation](https://pedromsilvapt.github.io/ado-backlog/) | [Release Notes](https://pedromsilvapt.github.io/ado-backlog/release-notes) | [Download](https://github.com/pedromsilvapt/ado-backlog/releases)

## Usage
In Azure DevOps, generate a new Personal Token. Edit the file `config.kdl`, and add the generated token.

In the tag `backlog`, you can change the name, project and the query id used to retrieve the items. Note that this query should be a flat query (not hierarchical) and its results should include all Work Items to be displayed on this backlog. If for example, you want a user story to be displayed, and on the backlog content, you defined user stories to be displayed inside features, then the parent Feature of that User Story must also be returned by the query.

Once everything is configured, open a terminal and execute the command `ado-backlog download -c config.kdl`
