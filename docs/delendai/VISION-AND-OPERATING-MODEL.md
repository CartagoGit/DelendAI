# Vision & Operating Model

A short north-star document. It records **why** the project grows the way it
does, not the mechanics of how it is built — those live in
[`ARCHITECTURE.md`](./ARCHITECTURE.md) and
[`AGENT-BOOTSTRAP.md`](./AGENT-BOOTSTRAP.md).

## The name — *AI delenda est*

The project is named **DelendAI** as a deliberate echo of Cato the Elder's
*Carthago delenda est* — "Carthage must be destroyed" — the phrase he ended
every speech in the Roman senate with until the Third Punic War did the
thing itself.

We re-pitch it as **AI delenda est** — *AI must be dismantled, broken into
pieces, and reassembled under human-readable contracts*. The "AI" we are
dismantling is the opaque, chat-shaped default mode of most coding agents:
a tool that needs a human in the loop just to know what it is doing and
what it has touched. The three design choices below — hermetic tools,
hermetic runtime, public errors / private data — are the literal
*dismantling* the verb in *delenda est* points at.

The full brand contract (when to write `delendai` vs `DelendAI`) lives in
[`BRAND.md`](./BRAND.md).

## North star

DelendAI is an **adaptive engineering layer**: less context, less repetition,
less human coordination, more verification and more automation. Every capability
we ship should reduce the number of calls, tokens, and manual steps an agent
needs to get a change done correctly.

## The growth rule — industrialize growth

Every new feature must cost **less maintenance than the one before it**. In
practice that means: declare once (manifests), derive the rest (generators),
type the boundary (contracts), and keep the authoring surface small (plugin
SDK). A feature that adds a hand-maintained table or a duplicated catalogue is a
regression, not progress — see the registry/manifest track (`r00016`, `r00017`)
and the live-data docs track (`d00005`).

## Two speeds

- **Core/runtime** — conservative and heavily tested. Changes here are slow on
  purpose; the contract is the product.
- **Plugins** — fast, usage-driven, and self-contained. A plugin may ship and
  evolve without touching the runtime.

`r00017` defines the exact boundary; this document only states the philosophy.

## The dogfooding loop

**DelendAI uses DelendAI to improve DelendAI.** Bugs, incidents, and gaps found while
running this repository become proposals, get triaged, and are implemented by
the same swarm the product offers (`f00158`–`f00160`, `f00170`–`f00172`).

## Privacy motto

**DelendAI reports its own bugs, not your data.** Error reporting and
telemetry are shaped to describe *our* internals (plugin, tool, failure class,
fingerprint) and never the user's files, secrets, or private repository content
(see the privacy track: `f00159`, `f00160`, `x00214`–`x00216`).

## Related

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — layers, contracts, request flow.
- [`AGENT-BOOTSTRAP.md`](./AGENT-BOOTSTRAP.md) — how agents operate in this repo.
- Proposals: `f00158`–`f00160` (error reporting), `f00170`–`f00172` (dogfooding),
  `r00016`–`r00017` (registry / core boundary).
