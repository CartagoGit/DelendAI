# Skills (documentation pointer)

Skills are **not** stored here. `docs/` is documentation only.

As of f00065 S1, every skill lives with the package or plugin that owns it
(SOLID ownership), and the resolver in
`packages/core/src/lib/skills/skill-paths.ts` is the single source of truth for
these locations:

| Owner | Skills root |
| --- | --- |
| `@mcp-vertex/core` and transversal (`@mcp-vertex/*`) skills | `packages/core/skills/<name>/SKILL.md` |
| A specific plugin (`@mcp-vertex/<plugin>`) | `plugins/<plugin>/skills/<name>/SKILL.md` |

The composed, version-pinned manifest lives with its primary loader:

```
packages/core/skills/manifest.json
```

Every consumer resolves these paths through `skill-paths.ts`:

- `packages/core/src/lib/skills/load-skills.ts` — version-aware loader
- `packages/core/src/lib/cli/assemble.ts` — CLI/host assembler
- `apps/web/scripts/gen-skills.ts` — web catalogue generator
- `tools/scripts/lint/check-skills.script.ts` — `lint:skills` gate

To add a skill, create `<owner>/skills/<name>/SKILL.md` and add a matching entry
(with `appliesTo`) to `packages/core/skills/manifest.json`. The `appliesTo`
namespace decides the owner: `@mcp-vertex/*` or `@mcp-vertex/core` → core;
`@mcp-vertex/<plugin>` → that plugin.
