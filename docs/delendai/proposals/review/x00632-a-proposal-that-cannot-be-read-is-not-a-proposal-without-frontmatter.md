---
id: x00632
title: "A proposal that cannot be read is not a proposal without frontmatter"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-24
---

# x00632 — A proposal that cannot be read is not a proposal without frontmatter

## goal

Reading a proposal file gives one of four answers, and each is handled
as what it is: read, missing, unreadable, or (once read) invalid.

## why

Reported by an external review on 2026-09-24 and confirmed in the code.
`readProposalText` turned every read failure into an empty string, and
the callers then classified that string:

- `readProposalFile` returned `no_frontmatter`, so an `EACCES` or `EIO`
  on a proposal was quarantined as a malformed proposal;
- the folder reconciler did the same for new-system files;
- the duplicate-id scan skipped the file, so an unreadable duplicate was
  reported as "no duplicates";
- `reconcileAndArchiveCompletedRootProposals` said in a comment that "a
  real read failure throws and propagates", and then caught every error
  from the directory listing and returned.

## why this design

- `readProposalText` returns `read`, `missing` (ENOENT) or `unreadable`
  (anything else), and every caller decides per answer.
- The index scan turns an unreadable file into a warning of the sync,
  never a quarantine entry.
- The folder reconciler leaves an unreadable file where it is.
- The duplicate-id scan fails on an unreadable file, since it could be
  the duplicate; the sync records that as "duplicate-id check
  incomplete" rather than failing the whole sync.
- The legacy archival pass lets a real directory or file read failure
  propagate, as its contract says; a missing directory is still empty.

## non-goals

- Changing what counts as invalid frontmatter.

## Slices

- global_gate: none

### S1 — Missing, unreadable, empty and invalid are four answers

- **Status**: done
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/proposals/unreadable-proposal.spec.ts`
- **Files**: `plugins/proposals/src/lib/proposals/sync-proposal-registry.ts`,
  `plugins/proposals/tests/src/lib/proposals/unreadable-proposal.spec.ts`
- With a proposal file at mode 000: the sync reports it as unreadable and
  quarantines nothing as `no_frontmatter`; the duplicate-id scan fails;
  the archival pass fails on an unreadable directory and still treats a
  missing one as empty. Three of the four cases fail on the old code.

## acceptance

- No read failure is ever recorded as missing frontmatter.
- A check that could not read everything says so.
