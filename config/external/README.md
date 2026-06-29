# External Tool Configs

This directory is the canonical target for external agent and IDE config that
can be centralized without breaking tool discovery.

Root-discovered tools still need a root bridge. Move a config here only after
the host has a tested include, stub, symlink, or explicit config-path setting.
If the host ignores the bridge, the root file stays as the integration boundary.

Current symlink bridges:

- `.aider.conf.yml` -> `config/external/aider/aider.conf.yml`
- `.cursorrules` -> `config/external/cursor/cursorrules`
- `.mcp.json` -> `config/external/mcp/mcp.json`

Current root-discovered configs:

- `.github/**` — GitHub workflows, community health files, CODEOWNERS,
  Dependabot, Copilot instructions, and GitHub agent definitions.
- `.vscode/**` — VS Code workspace settings and MCP launch config.
- `.cursor/**` — Cursor workspace rules. Root `.cursorrules` is bridged here;
  the `.cursor/rules/**` folder still stays at the root integration boundary.
- `.claude/**` — Claude Code workspace agents and settings.
- `.codex/**` — Codex workspace config.
- `.continue/**` — Continue.dev workspace config for its IDE assistant.

Generated state does not belong here. Runtime state for this repo goes under
`.cache/mcp-vertex/**`; other tool caches use `.cache/<tool>/**` when supported.
