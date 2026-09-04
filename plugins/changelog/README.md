# `@delendai/changelog`

Conventional-commits changelog + release-plan preview (f00131).
Generates a grouped changelog from a commit range, infers the next
semver bump from commit types, and previews the ordered publish plan
**without publishing**. Pure functions, read-only side effects, no
network.

## Activate

```bash
delendai --plugins=changelog
```

Hosts that do not load it keep the current "edit files manually"
behaviour for `CHANGELOG.md` and version bumps.

## Tools

### `changelog_generate { from?, to?, scope?, types? }`

Render a markdown changelog section from a commit range.

- `from` / `to` — git refs to diff (defaults: `from = HEAD~N`,
  `to = HEAD`).
- `scope` — restrict to commits whose conventional-commit scope
  matches.
- `types` — restrict to a subset of conventional commit types
  (`feat`, `fix`, `perf`, `revert`, etc.).

Returns `{ ok, markdown, sections }` — the rendered section list is
grouped by type and ordered by conventional-changelog conventions
(`Features`, `Bug Fixes`, `Performance`, `Reverts`, …).

### `release_plan { commits? }`

Preview the ordered release plan for the next publish.

- `commits` — optional override list; when omitted, the host
  injects the commits between the last tag and `HEAD` via the
  plugin options.

Returns `{ ok, bump: 'major'|'minor'|'patch'|'none', reason, from, to,
entries[] }`. `from`/`to` come from the anchor package (the first
entry of `PUBLISH_ORDER`); `entries` lists every package with its
own `from → to` after applying the inferred bump.

Read-only — never mutates `package.json` or pushes a tag.

## Pure APIs

The bump inference and release-plan preview are exposed as plain
functions for hosts that want to compose them with their own UI:

```typescript
import {
	inferBump,
	buildReleasePlan,
} from '@delendai/changelog/public';

const bump = inferBump(commits);
const plan = buildReleasePlan(publishOrder, bump);
// plan[0].to === next version of @delendai/core
```

`inferBump` follows the standard conventional-commits ladder:

| signal                          | bump   |
| ------------------------------- | ------ |
| any commit with `BREAKING CHANGE` (or `type!:` / `type(scope)!:`) | major  |
| any `feat:` commit              | minor  |
| any `fix:` / `perf:` / `revert:` | patch  |
| only `chore` / `docs` / `style` / `ci` / `test` / `build` | none   |

The first matching rule wins; the function reports which commit
hash + subject triggered the bump so the host can show it to users.

## Configuration

The plugin takes **no** options at registration time. The publish
order is provided by the host (usually a snapshot of
`tools/scripts/release/release-plan.ts#PUBLISH_ORDER`) so this plugin
never has to know how other plugins are ordered — that remains a
host concern.

## License

BSD-3-Clause, same as the parent monorepo.