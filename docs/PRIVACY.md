# Attribution policy

This document describes the rules this repository follows to keep LLM
attribution off the public GitHub surface. It is **not** about hiding
that AI was used to write the code — it is about keeping the project
attributed to one human maintainer, the way the maintainer wants it to
appear in the contributor graph, the commit pages, and the file listing.

> **Why.** The maintainer does not want a visitor to form a quality
> judgement about the work before reading it, on the basis of which LLM
> was used. Anti-AI bias in the developer community is real; this
> repository prefers that the work stand on its own.

## Commit author

The author of every commit is the human maintainer:

- **`Cartago <cartago.relaxingcup@gmail.com>`** is the only
  `git config user.name` / `user.email` pair the engine ever writes.
- The commit-policy plugin enforces `identity.mode = "explicit"` with the
  owner fixed to that pair, so no agent (Copilot, Claude, MiniMax, …)
  can override the author at commit time.
- See [`.github/CONTRIBUTING.md`](../.github/CONTRIBUTING.md) and
  `delendai.config.json#plugins.commit-policy.options.identity` for
  the exact configuration.

## Co-authored-by trailers

The repo does not accept `Co-authored-by:` (or `Signed-off-by:`,
`Generated with:`, `🤖`, etc.) trailers that name an LLM brand.

- `commit-policy.audit.trailer` is set to `"none"` in
  `delendai.config.json`. The default for downstream consumers of
  `@delendai/core` is also `"none"` (post-f00500).
- A pre-commit hook (`tools/scripts/lint/no-llm-attribution.script.ts`,
  wired in `lefthook.yml`) refuses any staged commit message or staged
  file that names an LLM brand in a trailer. The hook is **blocking**
  on `pre-commit` and runs as part of `bun run validate`.

The allowed space is `Co-authored-by: <human-name> <email>`. The hook
recognises legitimate human names like "Claude Smith" and allows them
even though "Claude" is part of an LLM brand; it only refuses patterns
that pair a brand with a model suffix (`Claude Opus 5`,
`Claude Sonnet 4.6`, `Claude Fable 5`, `MiniMax M3`, `GPT-5`,
`Codex GPT-5`, `GitHub Copilot MiniMax-M3`, etc.) or use an
LLM-only domain (`@anthropic.com`, `@MiniMax.ai`, `@MiniMax.local`).

## Branch names

When `agentWorktree: true` is set (currently off in this repo), branches
are composed via `composeIdentity`. The opt-in flag
`proposals.options.redactIdentity: true` strips the `host` and `model`
fields from the branch slug, so the branch is named
`agent/<agent_name>` or `agent/<agent_name>-<task_id>` — never
`agent/<host>-<model>-<agent_name>-<task_id>`. The flag is off by
default; this repo leaves it off until the maintainer enables
`agentWorktree`.

## Repo surface

Filenames and folder names in the repository do not contain LLM brand
markers (post-f00500 S4). 42 files were renamed in bulk (audit docs,
resumes, fix proposals) and the `config/external/claude-code/` folder
became `config/external/claude/`. The rename was mechanical and tracked
by `tools/scripts/lint/rename-llm-filenames.script.ts` (idempotent;
re-runnable with `--apply`).

The wiki (`docs/delendai/wiki/`) does mention LLM brands where the
documentation legitimately describes an adapter for that brand. That
is **intentional** — the wiki is the integration guide, not the
attribution surface.

## History (post-rewrite)

For projects that want a clean history (no `Co-authored-by: Claude
Opus 5` lines on old commits, no LLM-attributed author on
`git show <sha>`), see
[`docs/delendai/wiki/git-history-rewrite.md`](wiki/git-history-rewrite.md)
for the runbook. The runbook uses `git filter-repo` (preferred) or
`git filter-branch` (fallback) to:

1. Apply the repo's `.mailmap` so every LLM-attributed author collapses
   onto the canonical maintainer.
2. Strip every LLM-trailer line from every commit message.
3. Leave the pre-rewrite refs in `refs/original/*` for a 30-day
   recovery window.

`.mailmap` alone is enough to fix the GitHub **contributor graph**
(collapses aliases onto the canonical identity), but it does **not**
fix the per-commit author display on individual commit pages. The
history rewrite is the only path to that.

## What this policy is NOT

- It is **not** a denial that AI tools were used to write the code. The
  maintainer is upfront about that; this document does not change
  reality, only the public surface.
- It is **not** a CLA requirement. External contributors are welcome
  to commit under their own identity; the policy only constrains
  attribution to LLMs in trailers and branch names.
- It is **not** a ban on naming models. Internal documentation
  (`docs/delendai/wiki/external/claude.md`, scenario walkthroughs,
  adapter specs) keeps the canonical names because that documentation
  exists to explain how to integrate with each host.

## How to verify

Run the evidence script (post-f00500 S7):

```bash
bun tools/scripts/verify/post-slice-f00500-evidence.script.ts
```

It runs `bun run validate`, scans the working tree for LLM markers,
checks the last commit message for forbidden trailers, and confirms
`delendai.config.json#plugins.commit-policy.options.audit.trailer`
is `"none"`.

## Changing the policy

This document is the canonical statement of the policy. Edits to it go
through a regular proposal (`docs: …`) and need explicit maintainer
sign-off, because the policy is a public commitment to how the project
appears on GitHub.
