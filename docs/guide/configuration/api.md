# API

The first config section of the configuration file is the `api`.

```kdl
config {
    api organizationUrl="https://dev.azure.com/{{username}}" \
		token="p1wy46imwhblkosg1s1ya7jirqy8xa5ysn9thx9uz1vmreg57duf" \
        ignoreSsl=false
```

The `organizationUrl` should be the URL you use to open **Azure DevOps** in your browser, and which opens the list with all the projects. **It cannot be the URL for a specific project.**

For the `token`, you need to generate one ([see how](https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate?view=azure-devops&tabs=Windows)) inside **Azure DevOps**. This token allows this tool **ado-backlog** to interact with the Azure Devops API on your behalf. 
- **Scopes**: For this tool, it is enough to give **Read** permissions to the **Work Items** scopes.

  ::: info
  When creating a token, the scopes represent what permissions you wish to grant to the applications you provide the token. It is always safer to be conservative and assign only the scopes that are necessary.
  :::
- **Expiration Date**: You can choose whichever date you prefer. Just remember that once it expires, you will need to generate a new one and update the token in the configuration file.

Finally, the `ignoreSsl` is an optional parameter. You can switch it to `true` if your Azure DevOps instance is served with a self-signed certificate.

You're all done for the API configuration. You can now proceed and configure how you want to export your backlog.