---
id: c00533
title: "Every logo comes from apps/shared/brand and the mono logo is monochrome"
kind: chore
status: done
type: proposal
track: a00095-consistency
date: 2026-10-23
last-transition-id: 699e56be-060d-43d3-8e99-4df399818bca
last-correlation-id: 699e56be-060d-43d3-8e99-4df399818bca
last-transition-from: review
last-transition-at: 2026-10-28T07:29:49.386Z
shipped-in:
  - "1a1bb4ab2ae2"
---

# c00533 — Every logo comes from apps/shared/brand and the mono logo is monochrome

## goal

apps/shared/brand is the only authored copy of each logo; web and extension copies are generated and gated by lint:brand, and logo-mono.svg is a real single-colour mark.

## why

Joint audit a00095. G9: apps/shared/README declares apps/shared/brand the source of truth, but the web serves its own copies. G46: logo-mono.svg is a fourth brand copy with no gate (three byte-identical files). G72: logo-mono.svg is not monochrome: it is byte-identical to the colour logo.svg.

## non-goals

- Redesigning the logos: the authored files keep their artwork; only copies and the mono variant change.

## slices

- global_gate: type

### S1 — One source, generated copies
- **Status**: done
- **Files**: `extensions/vscode/scripts/sync-logo.ts`, `extensions/vscode/src/test/sync-logo.spec.ts`, `apps/shared/README.md`, `package.json`
- **Gate**: type
- acceptance:
  - "lint:brand checks every copy of logo.svg and logo-mono.svg against apps/shared/brand (G9, G46)."

- shipped-in: `1a1bb4ab2ae2`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 1a1bb4ab2ae2, validate exit 0 and tests 2/2 claimed, no recorded run cited; acceptance 1/1: (1) package.json:56 runs lint:brand as scripts/sync-logo.ts without --write, so the run is a check; sync-logo.ts:20-29 declares the four copies of logo.svg and log… — Type gate ran once for the pack in the unit worktree: bun run typecheck exited 0.

### S2 — A monochrome mark
- **Status**: done
- **Files**: `apps/shared/brand/logo-mono.svg`, `apps/web/public/logo-mono.svg`, `extensions/vscode/media/logo-mono.svg`
- **Gate**: type
- acceptance:
  - "logo-mono.svg uses one fill colour (currentColor) and differs from logo.svg (G72)."
- shipped-in: `1a1bb4ab2ae2`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 1a1bb4ab2ae2, validate exit 0 and tests 2/2 claimed, no recorded run cited; acceptance 1/1: (1) All three logo-mono.svg files were rewritten with currentColor and no gradient, and the three are now one blob that differs from the colour logo.svg (md5 dc977… — Type gate ran once for the pack in the unit worktree: bun run typecheck exited 0. Slice checks: the brand spec (1 file / 2 tests) and bun run lint:brand, both exit 0. The mono geometry is unchanged (only the paint) and apps/shared/brand/logo.svg is untouched, as the proposal's non-goals require.

## acceptance

- lint:brand checks every copy of logo.svg and logo-mono.svg against apps/shared/brand (G9, G46).
- logo-mono.svg uses one fill colour (currentColor) and differs from logo.svg (G72).

## notes

- `extensions/vscode/media/icons/logo-mono.svg` is not a copy: it is the 16×16 status-bar glyph `regenerate-icons.ts` builds the icon font from, drawn at another scale, so it is not checked against the brand and `regenerate-icons.ts` is unchanged.
- `Base.astro` links `/logo.svg`, which is now a generated copy; it needed no change.
- The monochrome mark keeps the colour mark's geometry and paints it with `currentColor`.
