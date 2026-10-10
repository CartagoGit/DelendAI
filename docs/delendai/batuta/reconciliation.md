# Batuta: initial reconciliation

Initial inspection on 21 September 2026 at `bce54340ba87238bbd754f1d514ff04b3b64bd7a`.
The canonical Batuta proposal preserves the complete approved specification.
This document records reconciliation evidence; it does not establish provider support or end-to-end acceptance.

## Existing capabilities and gaps

| Area | Existing evidence | Remaining work |
| --- | --- | --- |
| Roster | `packages/core/src/lib/plugins/load-config-file.ts` and `packages/core/src/lib/plugins/config-file-schema.ts` support root provider configuration. The parser casts the parsed object; schema diagnostics do not prevent startup. | `plugins/orchestrator-runner/src/index.ts` only consumes `options.providers`. Inject a validated root roster through plugin context, preserve explicit overrides, and exclude invalid entries. |
| Selection | `auto-agent-selector` and `orchestrator-runner` already provide discovery, scoring, and policies. | Separate account, transport, authentication, billing, and quota-group identities. Apply eligibility filters before scoring and reuse existing selectors. |
| Dispatch | `plugins/agent-orchestrator/src/lib/dispatch/port-resolution.helper.ts` resolves real execution through `ctx.subagentRuntime` or `portFactory`, and fails when no port exists. | Adapt persistent orchestration and Batuta evidence without duplicating dispatch or describing it as planning only. |
| Subscription | The runner subscription invoker returns an explicit textual passthrough stating that no external provider was invoked. | Implement authorized executors with isolated profiles; report a concrete limitation until an integration has been verified. |
| CLI | The runner spawner accepts a command and arguments; its construction does not provide an isolated directory and environment per account. | Isolate invocations through an environment allowlist and supported profile configuration without changing the host's global authentication. |
| Spending | The manager defaults to `executeApi: false` and provides token/autoBypass guards, but `SPEND_KINDS` only includes `api` and `cli`: `mcp-server` can reach its invoker without those guards. `SpendLimitsStore` returns a neutral view for missing or corrupt data. | Cover every executable transport before enabling it. Distinguish `unknown` from explicitly unlimited authorization, and provide transactional reservations by budget pool and quota group. Missing quota data must not authorize spending. |
| Usage | `usage-tracking` already correlates invocations. | Add financial and account identity without secrets, distinguishing actual measurements, estimates, and included subscription billing. |
| Persistence | `packages/state-sqlite` exposes state projections. | Do not use projection producers as a business ledger. Keep spending transactions within the spending owner's boundary. |
| MCP host | The repository host starts with a managed surface and resolves hidden tools through the broker. | Integrate Batuta into that surface without adding a separate product CLI, editor, application, or required daemon. |

## Related work and ownership

Canonical records were consulted for the antecedents named in the specification.
Multimodel orchestration, automatic selection, capability resolution, and satisfaction reconciliation are marked `done`.
The historical capability-resolution record retains some pending slices despite its overall status; it remains unchanged, and its status is not evidence of host parity.
Context-frugality work remains `ready`; reuse its delivery when relevant without incidentally claiming its files.
Canonical Batuta search returned no existing proposal before registration.

There were no active claims immediately before the initial S0 claim.
The open-pull-request query against the integration branch returned an empty list.
The shared checkout remained on the integration branch at the inspected SHA.
The global automatic plan selected unrelated closure work; it remained untouched, and the scoped Batuta continuation was used.

## First increment

S1a connects root configuration to plugin context and the runner while preserving `options.providers` precedence, including an explicit empty array.
Tests must cover valid and invalid root rosters, a local override, an empty override, an absent roster, and API execution refusal when spending is disabled.
Its seven paths are listed in the canonical plan and are disjoint from this document.
Completing S1a does not complete the S1 account registry or CA-01 through CA-19.
The current `mcp-server` exclusion requires a security increment with no-invocation tests before claiming protection across all transports.

S1 through S8 retain the original scope and remain pending.
Before execution, their planning scopes must be replaced with reconciled, claimable product contracts and files.
Documentation or mocks alone cannot satisfy those slices.

## Evidence limits

No accounts, private credentials, or real quotas were inspected, and no providers or paid calls were executed.
There is no real Batuta smoke evidence by host or provider yet.
Future reports must distinguish mocks, fake CLIs, real processes, and consented real calls.
Permissions and compatibility must be verified before enabling each access mode.

Canonical creation registered the proposal, but initial publication failed because policy rejected an integration-branch commit.
The suggested publication command then failed when resolving a new file absent from `origin/develop`.
That publication path requires repair without switching the shared checkout or bypassing guards.

## Session reference reconciliation

The user corrected the runtime and work-reference identity to `codex-astra-6`.
The existing Batuta checkpoint was renamed without changing its commit or the shared checkout, using the configured work-reference template and a descriptive topic.
Nine historical replay refs created by the host contained no file changes and had trees identical to `develop`; they were removed after that comparison.
The task host temporarily excludes the automatic commit-policy plugin to contain further replay while the cause is investigated. Repository configuration and git guards remain active and unchanged.
