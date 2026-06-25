---
applies-to: docs/mcp-vertex/proposals/**/*.md
---

# Architecture: proposals

## Purpose

Proposals are the durable work ledger for multi-agent implementation. They must
be parseable by tools and readable by humans.

## Required Shape

- Frontmatter includes `id`, `kind`, `title`, `status`, `date`, and `track`.
- The filename prefix matches `kind`.
- The folder matches `status`.
- Body headings follow `Goal`, `Why`, `Non-goals`, `Slices`, `Acceptance`, with
  the documented optional sections in their fixed slots.
- Slices use `### S<N> — <title>` and expose status, files, command, and expect
  either directly or via the narrative `Gate` form.

## Validation

Run `bun run lint:proposals`. Legacy `lNNN` files are warning-tier historical
imports; new-system prefixes are fatal on scaffold violations.

