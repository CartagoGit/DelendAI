---
id: f00639
title: "Optional capability providers — DelendAI works with zero extras, and gets better with any"
kind: feat
status: blocked
type: proposal
track: architecture
date: 2026-09-25
priority: P2
related:
    - f00551 # Batuta: a priority consumer, never absorbed by this
    - f00552 # authority/projections: receipts must declare their authority
    - f00536 # context frugality: providers must not grow the context they save
    - f00509 # work event bus: receipts and outcomes are events
    - q00022 # SQLite authority: decision history needs one authority
---

# f00639 — Optional capability providers

## goal

A consumer inside DelendAI can ask for a *capability* — "rank these
eligible options", "route between these authorised models", "run this
evaluation", "export these traces" — and get the best provider the
operator has configured, or DelendAI's native baseline when none is.
Installing a provider may make DelendAI cheaper, faster or better at a
decision; removing it returns DelendAI to the baseline with no loss of
correctness, no destructive migration and no consumer changing a line.

> DelendAI owns correctness and authority. Optional providers may
> improve intelligence, routing, efficiency, execution or evaluation,
> but are always replaceable progressive enhancements. The best
> optional integration is one DelendAI can remove without changing the
> meaning of the system.

## why

Requested by the owner on 2026-09-25, from a conversation about
TypeSafe's Jev (a "System One" model returning typed, calibrated
decisions instead of text) and similar projects. DelendAI makes many
*fuzzy* decisions today with fixed heuristics — weights, thresholds,
keyword matches — or by asking a frontier model: which plugins a task
needs (`auto-plugin-selector`), which provider runs a task
(`auto-agent-selector`), whether an error is a duplicate
(`error-reporting`), how an issue triages (`issues-triage`), which
search hits matter (`search`). A cheap typed-decision provider could
improve those. So could a specialised model router, an evaluation
backend, or a gateway an operator already runs.

The risk is the opposite of the opportunity: each integration done
directly would couple a consumer to a vendor SDK, and over time "the
good DelendAI" would require one. This proposal exists so the first
integration is done as a capability with a native baseline, and every
later one is an adapter.

It is registered **blocked** on purpose: automating decisions on top of
data whose authority is still being consolidated would automate the
ambiguity. See *unblock conditions*.

## why this design

Reconciled with the repository (develop at 309bbe59d): what already
exists and must be reused, not duplicated.

- **Permission capabilities** (`packages/core/src/lib/capabilities/`):
  what a plugin *may use* (`inject.ts`, `schema.ts`, versioning). A
  provider still declares its effects here — external network, data
  leaving the machine — and the existing gate enforces them.
- **Manifest `capabilities`** (`IPluginManifest.capabilities`): the
  features a plugin *provides*, as strings. Today nothing resolves a
  consumer's request to a provider's implementation through them.
- **`ctx.peerPlugins`** (`plugin-contract.ts`): optional peer detection
  *by plugin name*, used e.g. by audit to see whether proposals is
  loaded. The minimal extension this proposal needs is lookup *by
  capability contract* instead of by name — built on this registry,
  not beside it.
- **`resolve_capability` / `CapabilityResolver`**
  (`packages/core/src/lib/dispatch/`): resolves a request to a *tool*
  and invokes it. Tool dispatch, not provider selection; not reused
  for this, but its terminal-error vocabulary (`policy_denied`,
  `activation_failed`, …) is the model for provider failure states.
- **The capability graph** (`packages/core/src/lib/config/
  capability-graph.service.ts`): evidence about the *project*
  (languages, frameworks), not about providers. Unrelated.
- **Spend** (`orchestrator-runner` spend guards, `usage-tracking`):
  the only spend authority. A provider reports usage into it; it never
  holds budget of its own.
- **Batuta (f00551)**: owns accounts, billing modality, quotas,
  credentials, permissions, workers and execution. It is a priority
  *consumer* of a model-routing or decision capability, and must work
  fully without one.
- **MCP sampling**: the protocol already lets a server ask the
  client's own model for a completion. That is a zero-install,
  zero-credential baseline for structured inference that DelendAI
  already speaks — to be evaluated in S0 before any SaaS adapter.

## non-goals

- Integrating any product now, or ever as a requirement.
- Another agent framework, orchestrator, state authority, spend
  authority, plugin discovery system or capability graph.
- A mega-interface or an SDK wrapping all SDKs.
- Hidden network calls, hidden spend, automatic policy rewriting.
- Absorbing Batuta (f00551), which consumes this and never depends on it.

## architecture

To be confirmed or cut by S0.

Small, orthogonal capability contracts — never one `IAIBackend`:

| Capability | Asks | Native baseline (always present) |
| --- | --- | --- |
| decision-intelligence | yes/no, choice among a closed set, ordered score; confidence; several questions over one state | today's deterministic heuristic of each consumer |
| model-router | rank models among candidates already authorised | Batuta's / auto-agent-selector's native selector |
| structured-inference | typed output from a generative model | MCP sampling with schema validation |
| experiment-backend | datasets, evals, replay, A/B, feedback | prompt-eval + local receipts |
| trace-exporter | export receipts/traces/outcomes | local receipts only (export is opt-in) |
| inference-gateway | execute provider calls through the operator's gateway | orchestrator-runner's direct calls |

Rules every capability follows:

- **Absence semantics.** Missing, unavailable, unauthenticated,
  exhausted, rate-limited, timed out, invalid or low-confidence →
  the native baseline, stated in the receipt. Never "feature
  unavailable", never a crashed consumer — unless the operator set an
  explicit fail-closed policy.
- **Consumer policy.** `disabled | auto | preferred | explicit`;
  `required` only by explicit operator configuration, never by a
  bundled default.
- **Authority boundary.** Deterministic only, never delegable:
  permissions, secrets, spend authorisation, path containment,
  protected refs, canonical state, required CI, mandatory gates,
  destructive effects, identity. Advisory only: ranking, routing among
  eligible candidates, classification, relevance, risk, review or
  retry recommendation, triage. *A probability is never a permission.*
- **Receipts.** Every provider decision leaves a `DecisionReceipt`
  (capability, provider, model/version when known, state digest,
  question/schema digest, answer, probabilities, latency, usage, cost
  known/estimated/unknown, fallback path, correlation id, outcome
  pointer). Digests and pointers, not prompts or state, by default.
- **Privacy is a policy above consumers.** Each provider declares
  external network / data leaves machine / retention / local-only.
  `externalDecisionProviders: false` stops every external call
  whatever plugins are installed.
- **Budgets.** Cheap is not free (Jevons): global, per-provider,
  optional per-capability/consumer caps, max calls per operation,
  latency budget. Prices are observed data, never constants.
- **Context efficiency.** A micro-decision sends the minimal state
  (digests, pointers, selected evidence), batches questions over one
  state, and is measured end to end (f00536), not just by API price.
- **Packaging.** Each adapter is its own optional plugin/package; no
  third-party SDK in core or in a base preset; lazy-loaded.
- **No self-rewriting.** Evaluation and offline optimisation may
  *propose* a policy; promotion is explicit: dataset → experiment →
  candidate → gate → promotion.

## Slices

- global_gate: none

### S0 — Research and capability taxonomy
- **Status**: pending
- **Gate**: none
- **Files**: `docs/delendai/proposals/blocked/f00639-optional-capability-providers-delendai-works-with-zero-extras.md`
Redo the landscape independently and current, by capability; for each
candidate: what it solves and does not, license/hosting, runtime and
protocol, adapter without hard dependency, cost model, maturity,
lock-in, what of DelendAI it would duplicate, and a verdict (adapter /
reference only / discard). Confirm or cut the taxonomy above; merge or
drop capabilities the research does not justify. Evaluate MCP sampling
as the structured-inference baseline first. No paid calls, no
credentials, no account inspection.

### S1 — Neutral contracts only
- **Status**: pending
- **Gate**: `npx vitest run packages/core/tests/src/lib/contracts`
- **Files**: `packages/core/src/lib/contracts/` — the literal list is recorded when the slice ships
The contracts the taxonomy kept, the failure-state vocabulary, the
consumer policy and the `DecisionReceipt` — in contracts, no runtime.

### S2 — Provider registry and native baselines
- **Status**: pending
- **Gate**: the zero-extras acceptance test below
- **Files**: the plugin runtime around `ctx.peerPlugins` — the literal list is recorded when the slice ships
Lookup by capability on top of `ctx.peerPlugins` (0..N providers,
selection by configuration, never by the consumer); every capability's
native provider registered by default.

### S3 — Receipts, budgets and privacy policy
- **Status**: pending
- **Gate**: `npx vitest run packages/core/tests/src/lib/contracts`
- **Files**: receipt, budget and privacy modules chosen in S0 — the literal list is recorded when the slice ships
Receipts through the work event bus (f00509) under a declared
authority (f00552); budget caps reporting into usage-tracking; the
privacy policy that can forbid external providers outright.

### S4 — First optional adapter
- **Status**: pending
- **Gate**: the adapter's own spec, with the provider mocked
- **Files**: a new optional adapter plugin under `plugins/` — the literal list is recorded when the slice ships
The best decision-intelligence candidate from S0, as its own optional
plugin, disabled by default, credential by reference, bounded retry,
timeout, health, no remote-balance inference without an official
endpoint.

### S5 — One consumer behind a flag
- **Status**: pending
- **Gate**: the consumer's spec, with the flag off and on
- **Files**: the chosen consumer plugin — the literal list is recorded when the slice ships
The consumer S0 finds most likely to benefit (candidates:
auto-plugin-selector, issues-triage, search rerank, Batuta routing
once it exists), with its baseline unchanged when the flag is off.

### S6 — Benchmark native vs provider
- **Status**: pending
- **Gate**: the harness reports every metric for native and provider
- **Files**: a benchmark harness under `tools/scripts/` — the literal list is recorded when the slice ships
Reproducible harness per capability: agreement with ground truth or
human review, calibration, override rate, downstream success, latency,
cost, error/unavailability rate, end-to-end context cost. Synthetic
and real workloads kept apart. Vendor claims are not evidence.

### S7 — A second provider in a different category
- **Status**: pending
- **Gate**: the zero-extras acceptance test, with two providers installed and removed
- **Files**: a second optional adapter plugin — the literal list is recorded when the slice ships
Proves provider-neutrality with two unrelated implementations before
generalising.

### S8 — Third-party provider contract
- **Status**: pending
- **Gate**: a fixture community plugin provides a capability core does not know
- **Files**: `docs/delendai/` and the contracts — the literal list is recorded when the slice ships
Versioned contracts, capability metadata, trust/origin and effect
declaration, so a community plugin can provide a capability core does
not know.

## dependency graph

Unblock conditions — checked against the repository when someone
proposes to unblock, not by date:

1. develop certified by a green full run and the queue landing
   candidates without manual intervention (x00637).
2. Every write tool acts where its declared root says (x00638 done).
3. The authority of every duplicated fact declared and checked
   (f00552 done).
4. Proposals SQLite authority unambiguous: q00022 S4/S5, r00049,
   r00056 done or explicitly superseded.
5. Batuta's base (f00551 S1–S4) stable enough to consume a capability
   without redesign.
6. No open P0/P1 that must precede this.

## acceptance

- DelendAI installed with no optional provider passes every mandatory
  gate, and Batuta's and every consumer's basic flow works; no optional
  SDK appears in the dependency graph or the cold load.
- Installing a provider and enabling it in config improves the
  consumers policy allows, each decision leaving a receipt; removing
  it returns to the baseline with no correctness loss and no
  destructive migration.
- A provider that does not exist today can be added later without
  changing any consumer.
- Every integration states its maturity — candidate, adapter
  implemented, unit tested, locally tested, real API tested,
  dogfooded, production proven — and none is called supported for
  compiling.

## notes

Landscape, first pass on 2026-09-25 — S0 redoes it.

Grouped by capability. **Every entry is an architectural candidate
only**: nothing below is mocked, tested or proven.

- **decision-intelligence**: TypeSafe Jev (System One; Choice up to
  255 options, Score 2–10 levels, yes/no, calibrated probabilities,
  parallel questions over one state; launched 2026-09-15, early
  access); MCP sampling + schema validation as the neutral baseline;
  a small local model behind constrained decoding.
- **model-router**: Not Diamond (hosted, coding-aware routers);
  RouteLLM (open source, strong/weak routing; a reference baseline);
  OpenRouter's auto router; semantic routing on embeddings.
- **structured-inference / constrained decoding**: native structured
  outputs; XGrammar (default backend of vLLM/SGLang/TensorRT-LLM) and
  llguidance for local models; Outlines (earlier FSM approach, weaker
  on recursive schemas); BAML and Instructor as references — evaluate
  whether Zod + native APIs already suffice before any DSL/codegen.
- **inference-gateway**: LiteLLM, Portkey (Apache-2.0 since 2026-03),
  Bifrost, TensorZero, OpenAI-compatible private proxies. Transport
  only; check fail-open budget semantics before trusting any.
- **experiment-backend / tracing**: TensorZero, Langfuse (MIT),
  Arize Phoenix, Braintrust, promptfoo; **OpenTelemetry GenAI semantic
  conventions** as the neutral export format (a standard, not a
  product).
- **offline optimisation**: DSPy — never on the runtime path.
- **caching**: semantic caching (in several gateways, GPTCache-style)
  — only for semantically cacheable decisions, keyed by provider,
  version, schema, state digest and policy version.
- **not integrated as runtime**: agent frameworks (LangGraph, CrewAI,
  AutoGen, PydanticAI) — they would compete for orchestration, state
  and tool authority, which are DelendAI's product.

Sources for this first pass: TypeSafe's Jev announcement and coverage
(typesafe.ai blog; MarkTechPost 2026-09-19), 2026 router and gateway
comparisons (DigitalOcean, Braintrust, Maxim), 2026 observability
comparisons (Langfuse, OpenObserve), constrained-decoding papers and
repositories (XGrammar arXiv 2411.15100, guidance-ai/llguidance).
