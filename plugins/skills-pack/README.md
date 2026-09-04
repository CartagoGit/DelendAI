# @delendai/skills-pack

Skills pack plugin for `@delendai/core`: six pure-guidance playbooks shipped
through the existing skill surface.

## Skills

- `debugging-playbook` - logs, proposal state, and lock triage.
- `performance-optimization` - benchmark, bundle, profile, and focused quality loop.
- `pr-review-checklist` - review scope, history, CI, quality, and security.
- `security-hardening-checklist` - audit, dependency, SAST, secrets, and env posture.
- `incident-response` - remote error intake plus local log and state repair workflow.
- `migrate-from-x` - migration planning using the legacy migration discipline plus refactor tools.

## Loading

Load the plugin like any other bundled plugin:

```bash
mcp-vertex --plugins=skills-pack
```

The plugin registers skill pointers only. It does not execute tools or mutate
workspace state by itself.

## Layout

- Canonical skill bodies live under `plugins/skills-pack/skills/<name>/SKILL.md`.
- The plugin entrypoint exports typed skill descriptors from `./public` and
  registers the same files through `register().skills`.
- Pack membership is controlled through the usual preset and plugin wiring in
  the monorepo.