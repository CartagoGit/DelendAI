---
id: c00520
title: "Semantic hash for proposals index — exclude `generated_at` from `changed` calculation"
kind: chore
status: ready
type: proposal
track: efficiency
date: 2026-09-06
priority: P2
related:
    - c00510 # parent hardening round
    - c00519 # quarantine — the `semantic_hash` computation must include / exclude quarantine consistently
    - packages/state/src/lib/hash.ts # the canonical-state-hash primitive this proposal reuses
---

# c00520 — Semantic hash for proposals index — exclude `generated_at` from `changed` calculation

## Goal

The proposals index currently computes `changed` by string-comparing
the entire serialized payload:

```ts
const index = {
  generated_at: new Date().toISOString(),
  count: entries.length,
  proposals: entries,
  errors: warnings,
};

const nextText = JSON.stringify(index, null, 4);
let changed = current !== nextText;
```

Because `generated_at` is **inside** the compared payload and the
ISO timestamp changes every run, `nextText !== currentText` is
effectively always true. `changed` always reads `true`, even when
the entries list is byte-identical. The 2026-09-06 audit (B9 / P2)
flagged this as wasted writes, cache invalidations, churn, and
potentially a feed of spurious change notifications.

This proposal separates the **semantic hash** (the entries plus
warnings, sorted deterministically, without `generated_at`) from
the **observational metadata** (the timestamp, the writer host,
etc.). The cache invalidates only on semantic change, not on
wall-clock time.

## why

The user explicitly listed this in the briefing as a P2 with
downstream impact on caches, churn, watchers, reconciliations,
triggers, and tokens if any consumer interprets the change as
semantic. The fix is mechanical: compute the hash on the
canonicalised entries, then compare against the previous semantic
hash stored alongside the index.

## why this design

Reuse the canonical-state-hash primitive (`canonicalStateHash` in
`packages/state/src/lib/hash.ts`). The hash already strips
`LOCAL_METADATA_KEYS` before serialising, so the
`generated_at`-equivalent field can be added to that allow-list OR
the hash can be computed on a projection that omits the field.
The former is preferable because it keeps the hash function
ignorant of any specific metadata field's name.

The new `index.json` shape:

```jsonc
{
  "semantic_hash": "<sha256 of canonical { count, proposals, errors }>",
  "generated_at": "2026-09-06T...",
  "count": 811,
  "proposals": [...],
  "errors": [...]
}
```

The `changed` field the existing reconciliador reads becomes:

```ts
let changed = true;
try {
  const current = await reader.readText(basename(indexPath));
  const parsed = JSON.parse(current.content);
  changed = parsed.semantic_hash !== nextSemanticHash;
} catch { /* missing or unreadable index → first publish */ }
```

This is byte-identical to today's contract for callers — they
read `changed` — but `changed` is now meaningful.

## Tasks

### S1 — Add `generated_at` to `LOCAL_METADATA_KEYS`

`packages/state/src/lib/hash.ts:36` — add `'generated_at'` to the
allow-list. Verify the existing hash specs still pass (they should:
the hash is supposed to ignore observational metadata).

### S2 — Update the index writer

`plugins/proposals/src/lib/proposals/sync-proposal-registry.ts`:

- Import `canonicalStateHash` from `@delendai/state/hash`.
- Compute `semanticHash = canonicalStateHash({ count, proposals,
  errors })`.
- Write the new shape (with `semantic_hash` + `generated_at` +
  payload).
- Read previous `semantic_hash` to compute `changed`.

### S3 — Update `index-reader-fs.ts`

The readers that consume the index (`proposal_get`, `proposal_diagnose`,
`auto_work`) should NOT change — they read `proposals` / `count`
/ `errors` / `changed` as today. The `semantic_hash` field is
new and ignored.

### S4 — Tests

`plugins/proposals/tests/src/lib/proposals/sync-proposal-registry-semantic-hash.spec.ts`:

- A first run writes the index with a fresh `semantic_hash`.
- A second run with byte-identical entries (no file changes)
  produces the same `semantic_hash`; `changed === false`.
- A third run with one new proposal produces a different
  `semantic_hash`; `changed === true`.
- A second run within the same millisecond (theoretically) still
  produces the same `semantic_hash` (the timestamp is excluded).

## Acceptance

- The index carries `semantic_hash`.
- `changed` is `false` for a no-op scan (proven by the test).
- The `LOCAL_METADATA_KEYS` change is backwards-compatible
  (existing hash tests pass).
- `bun run validate` stays green.

## Out of scope

- Migrating the rest of the repo's `JSON.stringify(...) !== current`
  pattern. The proposals index is the highest-traffic one; others
  can adopt the pattern incrementally.
- Removing `generated_at` from the on-disk payload. The field stays
  for human observability; it just no longer participates in the
  semantic comparison.