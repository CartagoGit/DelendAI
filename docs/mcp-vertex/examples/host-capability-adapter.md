# Host capability adapter

Use this contract whenever a new client should consume mcp-vertex. The MCP
connection is mandatory and supplies the live server surface; all other
features are host capabilities, never guesses based on a provider name.

```ts
import {
  buildHostAdapterPack,
  type IHostCapabilityProfile,
} from '@mcp-vertex/core/public';

const profile: IHostCapabilityProfile = {
  id: 'my-mcp-host',
  capabilities: {
    mcp: { tools: true, prompts: true, resources: true },
    instructions: 'workspace-file', // or 'prompt' | 'none'
    skills: 'native', // or 'mcp-tool' | 'none'
    lifecycle: 'hooks', // or 'observe' | 'none'
    continuation: 'manual', // use 'host-loop' only with an owned runner
  },
};

const pack = buildHostAdapterPack(profile);
```

The adapter maps `pack.actions` to its own configuration syntax. It must always
configure the required `connect-mcp` actions first, and it may configure only
the optional actions present in the pack. This gives every compatible host the
same tools, prompts and resources even if it has no native skill system or
lifecycle hooks.

## Continuation boundary

`manual` means the host starts the next turn normally from a bounded handoff.
Do not use an MCP tool to pretend the server can wake the host process. A
`host-loop` profile is valid only when the adapter owns a documented runner
that can continue a turn, enforce budgets, stop on locks or failed validation,
and surface terminal states to the user.

The Codex and Claude Code examples are concrete instances of this same
contract under `config/external/`; a generic MCP client can use the example
unchanged with `instructions`, `skills` and `lifecycle` set to `none`.
