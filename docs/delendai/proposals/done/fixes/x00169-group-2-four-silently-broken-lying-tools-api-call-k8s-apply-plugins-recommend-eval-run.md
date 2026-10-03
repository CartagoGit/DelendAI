---
id: x00169
title: "x00169 — Group 2: four silently-broken/lying tools (api_call, k8s_apply, plugins_recommend, eval_run)"
kind: fix
status: done
type: proposal
track: general
date: 2026-07-29
shipped-in:
    - 8e2ced0c # S1-S4 — api_call/k8s_apply/plugins_recommend/eval_run fixes
    - d9234b9d # catalog regen after S3/S4 index.ts changes
---

# x00169 — x00169 — Group 2: four silently-broken/lying tools (api_call, k8s_apply, plugins_recommend, eval_run)

## Goal

Fix four tools that returned well-formed, plausible-looking results while never actually doing what their description promised: api_call dropped method/headers/body (silently sent every request as an unauthenticated GET), k8s_apply parsed a manifest and then never sent it anywhere (kubectl always ran against empty stdin), plugins_recommend scored against a permanently-empty candidate list (always returned []), and eval_run ran a fully-wired-looking harness whose deps were hardcoded to always deny spend (indistinguishable from a legitimate budget refusal).

## why

Found during a full plugin-by-plugin dogfooding audit this session, continuing the pattern already shipped in x00166/x00167/x00168: a tool that returns a valid-looking JSON envelope while silently doing nothing is worse than a crash, because callers (including LLM agents) have no signal that something is wrong. Each of these four was independently verified live (not just read) before fixing.

## non-goals

- Real orchestrator-runner spend-guard + invocation-manager wiring for eval_run (an adapter onto the session/monthly circuit breaker + fallback chain + real provider dispatch) — this is separate feature work, not a bug fix; this proposal only makes the current stub state honest instead of silently misleading.
- Expanding the auto-plugin-selector scorer's pack/shape tag vocabulary (typescript/backend/cli/docs-site) across the 40-entry first-party catalog — only 'tests' currently overlaps with real catalog tags, so most signal combinations still return few/no matches even after this fix wires the real catalog in. Which tags each plugin should carry is a product/curation decision, not a mechanical wiring bug.
- Redirect-hop method downgrading in web-fetch (browsers convert POST->GET on 301/302/303) — the engine now resends the same method/headers/body on every hop unconditionally, which is simpler and correct for the common idempotent/307/308 cases; a divergent redirect-semantics policy was out of scope.

## Slices

- global_gate: type

### S1 — api_call: forward method/headers/body through web-fetch instead of dropping them
- **Status**: done
- **Files**: `plugins/web-fetch/src/lib/contracts/interfaces/fetch.interface.ts`, `plugins/web-fetch/src/lib/services/engine.ts`, `plugins/web-fetch/tests/src/lib/engine.spec.ts`, `plugins/api/src/lib/tools/api-call.tool.ts`, `plugins/api/src/lib/tools/api-call.tool.spec.ts`
- **Gate**: none
- acceptance:
  - "IWebFetchOptions/IFetchLike gain optional method/headers/body"
  - "webFetch forwards them unchanged to the fetcher on every redirect hop"
  - "api_call's fetch({...}) call includes request.method/headers/body"
  - "New tests prove a real fetcher sees method/headers/body, including across a redirect hop"

### S2 — k8s_apply: pipe the manifest to kubectl's stdin
- **Status**: done
- **Files**: `packages/core/src/lib/contracts/interfaces/run-command.interface.ts`, `packages/core/src/lib/shared/run-command.ts`, `packages/core/src/lib/contracts/interfaces/external-tool.interface.ts`, `packages/core/src/lib/external-tool/run-external-tool.ts`, `plugins/container/src/lib/tools/container-build.tool.ts`, `plugins/container/src/lib/tools/container-build.tool.spec.ts`, `packages/core/tests/src/lib/external-tool/run-external-tool.spec.ts`, `packages/core/tests/src/lib/shared/run-command.spec.ts`
- **Gate**: none
- acceptance:
  - "IRunArgvOptions/IRunExternalToolInput gain an optional stdin field"
  - "runArgv pipes stdin to the child (stdio flips from 'ignore' to 'pipe' only when stdin is given) instead of always closing it"
  - "k8s_apply passes args.manifest as stdin"
  - "New tests prove stdin reaches the real subprocess (cat/wc -c round-trip) and the mocked exec layer"

### S3 — plugins_recommend: wire the real bundled first-party catalog instead of an always-empty list
- **Status**: done
- **Files**: `plugins/auto-plugin-selector/src/lib/catalog/first-party-candidates.ts`, `plugins/auto-plugin-selector/src/lib/catalog/first-party-candidates.spec.ts`, `plugins/auto-plugin-selector/src/index.ts`, `plugins/auto-plugin-selector/src/index.spec.ts`
- **Gate**: none
- acceptance:
  - "A pure mapper derives IPluginCandidate[] from core's existing FIRST_PARTY_PLUGIN_INDEX (no hardcoded duplicate plugin list)"
  - "index.ts passes the mapped candidates into buildPluginsRecommendRegistration"
  - "New tests prove plugins_recommend returns non-empty recommendations end-to-end through the real plugin registration"

### S4 — eval_run: honest 'not wired' diagnostic instead of a silent always-spend-denied stub
- **Status**: done
- **Files**: `plugins/prompt-eval/src/lib/tools/eval-run.tool.ts`, `plugins/prompt-eval/src/lib/tools/eval-run.tool.spec.ts`, `plugins/prompt-eval/src/index.ts`, `plugins/prompt-eval/src/index.spec.ts`, `plugins/prompt-eval/README.md`
- **Gate**: none
- acceptance:
  - "IEvalRunToolOptions gains an opt-in 'unwired' flag; existing tool/harness tests are unaffected (flag omitted = unchanged behavior)"
  - "index.ts's own no-op stub composition sets unwired: true and explains why in a comment"
  - "eval_run refuses with a clear, distinct diagnostic before touching providers when unwired, instead of returning a well-formed spend-denied-for-everyone envelope"
  - "README no longer has duplicated content or references to the nonexistent eval_calibrate tool; documents the current unwired state"

## acceptance

- IWebFetchOptions/IFetchLike gain optional method/headers/body
- webFetch forwards them unchanged to the fetcher on every redirect hop
- api_call's fetch({...}) call includes request.method/headers/body
- New tests prove a real fetcher sees method/headers/body, including across a redirect hop
- IRunArgvOptions/IRunExternalToolInput gain an optional stdin field
- runArgv pipes stdin to the child (stdio flips from 'ignore' to 'pipe' only when stdin is given) instead of always closing it
- k8s_apply passes args.manifest as stdin
- New tests prove stdin reaches the real subprocess (cat/wc -c round-trip) and the mocked exec layer
- A pure mapper derives IPluginCandidate[] from core's existing FIRST_PARTY_PLUGIN_INDEX (no hardcoded duplicate plugin list)
- index.ts passes the mapped candidates into buildPluginsRecommendRegistration
- New tests prove plugins_recommend returns non-empty recommendations end-to-end through the real plugin registration
- IEvalRunToolOptions gains an opt-in 'unwired' flag; existing tool/harness tests are unaffected (flag omitted = unchanged behavior)
- index.ts's own no-op stub composition sets unwired: true and explains why in a comment
- eval_run refuses with a clear, distinct diagnostic before touching providers when unwired, instead of returning a well-formed spend-denied-for-everyone envelope
- README no longer has duplicated content or references to the nonexistent eval_calibrate tool; documents the current unwired state
