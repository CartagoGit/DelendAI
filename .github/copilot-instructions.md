# Copilot / agent instructions — `@mcp-vertex/core`

> **Bootstrap contract:** everything an agent needs to know about the
> mcp-vertex server, the workflow loop, the definition of done, and the
> invariants lives in
> [`docs/mcp-vertex/AGENT-BOOTSTRAP.md`](../docs/mcp-vertex/AGENT-BOOTSTRAP.md).
> Read that file once per session and call the server (`mcp-vertex_overview`,
> `mcp-vertex_agent_catalog`) for live routing. Do **not** enumerate
> tool / skill / proposal ids in this file or in your answers — the server
> is the only source of truth and it changes every week.

This file adds the Copilot-specific rules the server cannot enforce.

## Close every response with a canonical marker

The `@mcp-vertex/status-marker` plugin is loaded in this workspace
(`mcp-vertex_overview` reports it; its `ping` tool answers). The plugin is
agent-driven today: the core does **not** yet have an `onAfterRespond` hook,
so the model is responsible for closing every response with exactly one line
from the canonical 8-state table.

**Mandatory behaviour for every response, with no exceptions:**

1. Pick the state that best describes the turn's outcome (`HECHO` when work
   is complete and nothing pending; `CAP` when handing off mid-turn;
   `RE-PIVOT` when the cascade changed direction; `CHECKPOINT-REQUIRED`
   when handing off to the orchestrator; `REPAIR-NEEDED` when the verifier
   asked for repair; `BLOQUEADO` on a hard blocker; `SIN PROPUESTAS LIBRES`
   when the catalog only has claimed work; `SIN PROPUESTA DE NINGUN TIPO`
   when nothing is executable at all).
2. Call `<prefix>_close { state, reason? }` (prefix is `status-marker` —
   confirm via `mcp-vertex_overview`). Never hand-format the line.
3. Paste the returned `line` as the **literal last line** of the response.
   No prose after it — not even whitespace-then-text. The line must be
   ≤ 120 chars (the helper truncates with `…` if needed).
4. Five states require a `reason`: `CAP`, `RE-PIVOT`,
   `CHECKPOINT-REQUIRED`, `REPAIR-NEEDED`, `BLOQUEADO`. Omitting it makes
   the helper insert the literal `<reason-missing>` token — that is **not**
   a valid response.
5. If unsure whether a draft response is compliant, run
   `<prefix>_validate { text: <full draft> }` first and check `ok`.

### Bilingual rendering toggle

The close marker supports two bracket-text locales: `'es'` (default —
`[HECHO]`, `[CAP]`, …, byte-identical to legacy) and `'en'` (shorter
English tokens — `[DONE]`, `[HANDOFF]`, `[REPIVOT]`, `[CHECKPOINT]`,
`[REPAIR]`, `[BLOCKED]`, `[NO_FREE_PROPOSALS]`, `[NO_WORK]`). Pass
`locale: "en"` to `<prefix>_close` (or to `formatCloseMarker` directly)
to switch. The validator and the 8-state semantics are unchanged — only
the bracket text differs; pick whichever locale matches the host's UI.
The detailed contract lives in
[`plugins/status-marker/skills/mcp-vertex-status-marker-and-closure/SKILL.md`](../plugins/status-marker/skills/mcp-vertex-status-marker-and-closure/SKILL.md).

<!-- mcp-vertex:begin -->

# mcp-vertex host hints (auto-generated)

See `docs/mcp-vertex/host-hints/copilot-instructions.generated.md` for the live agent catalog.

<!-- mcp-vertex:end -->
