# Git history rewrite — f00500 S8d runbook

> **This runbook is destructive.** It rewrites every commit in this
> repository's history. Follow every step in order, take backups, and
> coordinate with collaborators before pushing.

## When to run this

Run this runbook when:

- The repo has accumulated LLM-attributed commits that you want scrubbed
  from the public GitHub history.
- The `Co-authored-by:` trailer list and `.mailmap` are in place and
  verified (S2 and S8a).
- You are ready to coordinate a **force-push** and notify every
  collaborator that their local clones will need to be reset.

Do **not** run it without coordination: any collaborator with an active
clone will see a detached HEAD and have to re-clone.

## What the rewrite does

Two effects, in this order:

1. **Author rewrite** via `.mailmap`. Every LLM-attributed author
   (`copilot-minimax-m3 <copilot-minimax-m3@delendai.local>`,
   `GitHub Copilot <copilot@anthropic.com>`, `MCP-V Bot <ci@anthropic.com>`,
   `MiniMax-M3 <noreply@MiniMax.local>`, etc.) is collapsed onto
   `Cartago <cartago.relaxingcup@gmail.com>`. This affects the `Author`
   field of every commit.
2. **Trailer removal** via `git filter-repo` (preferred) or
   `git filter-branch` (fallback). Every line in every commit message
   that matches the LLM trailer pattern is removed. The pattern matches
   `Co-authored-by:`, `Signed-off-by:`, `Generated with:`, and similar
   attribution trailers whose value mentions an LLM brand (see
   `tools/scripts/lint/no-llm-attribution.script.ts` for the canonical
   list).

The rewrite changes every commit SHA-1 because the metadata is part of
the hash. Open PRs based on the old history will be marked as
"closed/merged" and the new history will appear as a separate timeline
on GitHub.

## Step 0 — preflight checks

```bash
# 0.1 Verify S2 is in place: the new commits we make should NOT have an
# LLM trailer. If they do, fix S1+S2 before running the rewrite.
git log -5 --format='%B' | grep -ciE 'co-authored-by:.*(claude|minimax|gpt-?[3-9]|gemini|codex|llama|mistral|qwen|deepseek|chatgpt|grok)'
# Expected: 0 (post-S1+S2)

# 0.2 Verify .mailmap is in place and active.
git log -10 --use-mailmap --format='%an <%ae>' | sort -u
# Expected: every copilot-minimax-m3 / Claude / Anthropic / etc. shows as
# "Cartago <cartago.relaxingcup@gmail.com>"

# 0.3 Dry-run the rewrite script and confirm the report looks right.
bun tools/scripts/git/rewrite-llm-attribution.script.ts
# Expected: 396 commits with LLM trailers (today); 29 mailmap entries.

# 0.4 Open an issue / announcement describing what you are about to do
# and pin it. Tag every collaborator.
```

## Step 1 — take a mirror backup

```bash
bun tools/scripts/git/rewrite-llm-attribution.script.ts --backup
```

This clones the repo to `../delendai-backup-<timestamp>.git` with the
`--mirror` flag (every ref, every branch, every tag). **Do not delete
this backup for 30 days after the rewrite** — it is the only path back
to the original history.

Verify the backup is consistent:

```bash
cd ../delendai-backup-<timestamp>.git
git fsck --full
cd -
```

## Step 2 — perform the rewrite

The script default mode is **dry-run**. Confirm the report from Step 0.3
is still accurate (the count of "commits with LLM trailers" should
match), then run with `--apply`:

```bash
bun tools/scripts/git/rewrite-llm-attribution.script.ts --apply
```

The script will:

- Try `git filter-repo` first (preferred; needs `pip install
  git-filter-repo`).
- Fall back to `git filter-branch` with `--msg-filter` if filter-repo is
  not installed.
- Apply `.mailmap` for author rewriting in the same pass.

Both tools leave the original refs in `refs/original/*` for forensic
recovery. **Do not delete `refs/original/*` for 30 days.**

## Step 3 — verify the rewrite

```bash
# 3.1 No LLM trailer should remain anywhere in history.
git log --all --format='%B' | grep -ciE 'co-authored-by:.*(claude|minimax|gpt-?[3-9]|gemini|codex|llama|mistral|qwen|deepseek|chatgpt|grok)'
# Expected: 0

# 3.2 No LLM-only domain should remain in any author field.
git log --all --format='%ae' | grep -ciE '(anthropic\.com|minimax\.ai|minimax\.local)$'
# Expected: 0

# 3.3 The contributor set should be: Cartago + Mario + dependabot[bot].
git log --all --use-mailmap --format='%an <%ae>' | sort -u
# Expected: ~3-4 lines (Cartago, Mario Volarich - WSL, Volarich, dependabot[bot])

# 3.4 Repo contents are unchanged.
git diff --stat <pre-rewrite-sha> HEAD
# Expected: identical file content (only metadata changed)
```

If any check fails, stop and use `git reset --hard refs/original/refs/heads/<branch>`
to recover the pre-rewrite state. The mirror backup in Step 1 is the
canonical recovery path.

## Step 4 — force-push

```bash
# 4.1 Push every branch to origin with --force-with-lease (safer than --force).
git push --force-with-lease origin --all
git push --force-with-lease origin --tags

# 4.2 Open a tracking issue that references the rewrite. Pin it.
# 4.3 Announce in the contributors channel that:
#   - The rewrite was applied.
#   - Every local clone must be reset:
#       cd <repo> && git fetch origin && git reset --hard origin/<branch>
#   - Old SHAs are recoverable from the mirror backup for 30 days.
```

## Step 5 — cleanup after 30 days

```bash
# 5.1 Confirm the rewrite was successful and collaborators have synced.
# 5.2 Delete the original refs.
git for-each-ref --format='%(refname)' refs/original | xargs -n1 git update-ref -d
# 5.3 Delete the mirror backup.
rm -rf ../delendai-backup-<timestamp>.git
# 5.4 Close the tracking issue.
```

## What this runbook does NOT do

- **It does not change file content.** The rename in S4 already scrubbed
  the surface; the rewrite only changes commit metadata.
- **It does not change GitHub commit URLs.** Old commit URLs (`/commit/<sha>`)
  become 404s after the rewrite. The corresponding commits are still
  reachable at `/commit/<new-sha>` if you have a record of the mapping,
  or via the mirror backup during the 30-day window.
- **It does not delete branches.** A branch whose head's subject was an
  LLM trailer is still there, just with a new SHA and a clean message.
  Use `git branch -d` to clean up branches whose tips no longer match
  the protected refs.

## Why the `.mailmap` is not enough

`.mailmap` is instant and safe, but **GitHub does NOT apply the
mailmap retroactively to the commit author display on individual commit
pages.** The mailmap fixes the contributor graph (the sidebar that lists
"X contributors") but a `git show <sha>` on GitHub will still show the
original (LLM-attributed) author. The history rewrite is the only path
to also fix the per-commit author display.

`refs/original/*` keeps the pre-rewrite history reachable for forensic
recovery (signing keys, audit trails, the contributor graph's "X
contributors" count), so the rewrite is reversible within the 30-day
window.
