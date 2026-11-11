---
id: x00615
title: "A skill ships by what it declares, not by where it sits"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-23
shipped-in:
  - "33e6d4a18"
  - "fd6b6927de5697af6b745c66290b606044f4f01d"
last-transition-id: 3956edc0-6d65-4c1f-a230-8438b839d18a
last-correlation-id: 3956edc0-6d65-4c1f-a230-8438b839d18a
last-transition-from: review
---

# x00615 — A skill ships by what it declares, not by where it sits

## goal

`init` installed `delendai-tabs-component` — a skill whose body documents
`apps/web/src/components/ui/Tabs.astro`, **this repository's own website**
— into every adopting project. Every skill declares who it is for; nothing
read the declaration.

## why

`buildCoreSkillProjection` selected with one predicate:

```ts
entry.bodyPath.startsWith('packages/core/skills/')
```

So a skill shipped to an adopter because of **where its file sits**. Each
entry also carries `appliesTo`, that value is copied into the adopter's own
manifest, and it decided nothing.

The cost is measurable. `delendai-tabs-component` declared
`appliesTo: ['@delendai/*']` while its body mentions `apps/web` six times
and documents a `<Tabs>` component and a `brandLogo()` resolver for Astro
pages. An adopting project — which has no `apps/web` and no Astro — got it
anyway, and its agents got a skill describing files that do not exist
there.

Two things were wrong at once, and fixing either alone leaves the bug:

- the **declaration was false** — `@delendai/*` for a skill about one of
  our own packages;
- the **selector did not read it**, so a correct declaration would have
  changed nothing.

## why this design

**Location answers a different question.** Whether a body lives in the core
bundle is a physical fact about what we are able to copy; it stays, because
we cannot project a body we do not ship. What it must not do is decide
*relevance*.

**`appliesTo` decides relevance.** An adopter has, by adopting, the scopes
`@delendai/*` (every consumer) and `@delendai/core` (they installed the
core). A skill scoped to a single package — `@delendai/web`,
`@delendai/audit` — is about that package; shipping it to a project without
it is noise, and noise in an agent's skill set is worse than absence
because the agent trusts it.

**A missing declaration still means `@delendai/*`.** That is what the
projected manifest already assumed, so nothing silently stops shipping.

## non-goals

- Changing which skills exist, or moving `tabs-component` out of the core
  bundle. Its body is fine where it is; its declaration was the lie.

## Slices

### S1 — The declaration decides, and it is true

- **Status**: done
  project: seven skills installed, `delendai-tabs-component` absent.
- **Gate**: `npx vitest run packages/cli/src/lib/init/core-skill-projection.service.spec.ts`
- **Files**: `packages/cli/src/lib/init/core-skill-projection.service.ts`,
  `packages/cli/src/lib/init/core-skill-projection.service.spec.ts`,
  `packages/core/skills/tabs-component/SKILL.md`,
  `packages/core/skills/manifest.json`
- `tabs-component` declares `@delendai/web`; the projection selects on a
  skill's declared scope as well as on whether its body ships in core.
- review-state: done
- review-implementer: claude-opus-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — Independiente: implementer claude-opus-5, reviewer minimax-3. Verifiqué fd6b6927de. PR MERGED. The declaration decides, and it is true
- review-attribution: claude-opus-5 from commit fd6b6927de56 names refs/heads/delendai/wip/claude-opus-5/x00615-S2-g1/the-tripwire-moved-with-the-declaration (fd6b6927de5697af6b745c66290b606044f4f01d), opened by minimax-3
## acceptance

- An adopting project receives the seven transversal and core-scoped
  skills and **not** `delendai-tabs-component`.
- A skill declaring `@delendai/core` is still received.
- A skill with no declaration is still received.
