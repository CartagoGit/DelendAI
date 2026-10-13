# The provider model bridge

A host application names itself when it connects to delendai (`Visual Studio Code`), never the model working behind it. A chat provider that routes requests to several models knows exactly which model served each one. The bridge is how such a provider tells delendai, so work is named after the model that did it.

delendai only **reads** the bridge. Writing it is the provider's job. Nothing in delendai edits an installed extension to make it write.

## Where

`~/.cache/delendai/provider-model.json`, in the home directory of the machine the delendai server runs on. `DELENDAI_PROVIDER_MODEL_FILE` overrides the location. Set it when the provider runs on another host than the server, for example a local editor UI against a WSL or remote workspace, so the server reads where the provider writes.

## What

One entry per workspace, keyed by the workspace's absolute path:

```json
{
  "entries": {
    "/work/acme": {
      "model": "claude-opus-5-5",
      "provider": "my-chat-provider",
      "at": "2026-10-13T09:30:00.000Z"
    }
  }
}
```

- `model` (required): the model id that served the request, exactly as the provider knows it.
- `at` (required): when it served it, as an ISO 8601 timestamp.
- `provider` (optional): who wrote the entry.

Write the entry on every request that is not a utility request (titles, summaries). Merge it into the file instead of replacing the file, so other workspaces keep their entries. Write atomically: write to a temporary file in the same directory, then rename it over the original.

The single-entry form, `{ "model", "at", "provider", "workspace" }`, is still read. Two windows on different workspaces overwrite each other in that form, so new writers should use `entries`.

## How delendai reads it

- An entry counts for 15 minutes after `at`. A model that served a request hours ago, maybe in another window, says nothing about who is working now.
- An entry counts for the workspace it names and for anything inside it, such as the worktrees under its cache. Another workspace's entry is ignored.
- An explicit `--agent` and `DELENDAI_AGENT_ID` come first. The bridge is read only when neither names the model. A project can switch it off with `development.identity.providerBridge: false`.

When the bridge names nothing, `work enter` and the server's start-up notice say why: the file is absent, unreadable, stale (with its age), or belongs to another workspace.
