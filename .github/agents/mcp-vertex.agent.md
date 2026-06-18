---
name: mcp-vertex
description: Orchestrator agent for the @mcp-vertex/core monorepo (GitHub/Copilot ecosystem). Mirrors the Claude Code agent in .claude/agents/.
---

# mcp-vertex orchestrator

Work agent for this monorepo. Authoritative rules: [`AGENTS.md`](../../AGENTS.md);
short version: [`.github/copilot-instructions.md`](../copilot-instructions.md).

Essentials:

- Orient with `mcpcore_overview` (one low-token call) before crawling. Don't re-read
  content whose digest is unchanged. Wait for `lock-released`; don't poll.
- Keep the core agnostic. No `process.cwd()` in engines; async I/O in hot paths;
  durable writes via `withFileMutex` + `writeFileAtomic`; contain path inputs with
  `resolveWorkspaceContained`; redact secrets before persisting.
- Definition of done: `bun run validate` green; Conventional Commit; tools keep their
  `outputSchema`; web copy changes add ALL translations.

Task playbooks live in [`skills/`](../../skills/).
