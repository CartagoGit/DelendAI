# Newly integrated bounded findings

Reviewer gpt-6.1-sol (Codex), 2026-10-21. Product snapshot `bec5d5daf945df78464e4535c47628809ef8ca64`; source bytes unchanged at integrated develop `031f6396a78bfcceadf87598a462c9a8164a86dd`. Six local fixture findings; no live external process or provider execution.

## EXT-02 — Exact version metadata does not pin the executable package

**Severity:** P2

**State:** confirmed with local synthetic fixture

**Component:** external-mcps

**Locations:** plugins/external-mcps/src/lib/options-schema.ts:68; plugins/external-mcps/src/lib/options-schema.ts:96; plugins/external-mcps/src/lib/subprocess/server-registry.ts:618; plugins/external-mcps/skills/external-mcps/SKILL.md:72

**Snapshot:** bec5d5daf945df78464e4535c47628809ef8ca64

**Expected:** Validation of a promised pinned entry rejects floating package arguments or binds the declared version to the resolved launch recipe.

**Observed:** Schema accepts version 1.2.3 with args synthetic-audit-package@latest; registry passes those unchanged to the fake spawner.

**Reproduction:** {"command": "bun --tsconfig-override external/tsconfig.probe.json external/probe.ts", "case": "version-pin", "limits": "Uses fixed-snapshot production external-mcps source, injected fake subprocess and captured registration callback. Does not run npx, Docker, npm, providers, network or a full SDK client."}

**Evidence:** evidence/completion-external/; ['probe.ts', 'probe-result.jsonl', 'dependency-hashes.json']

**Impact:** A caller can receive successful validation while the actual recipe resolves a floating package; this breaks reproducibility and the advertised pin guarantee. No package was actually fetched.

**Root cause:** version validates an independent string; command/args are unrestricted and registry does not consume version.

**Recommendation:** Define validated recipes for supported launchers, bind package/image version to version metadata, and explicitly label custom commands unverifiable instead of claiming a pin.

**Regression:** Validate exact, floating, mismatched npm/uvx/docker recipes; assert rejected recipes never reach spawner.

**Confidence:** high within source and injected-process boundary; no real external provider run

**Relation:** New specific pin-contract failure. Related to G54/G101 governance promises, but independent of executable allowlists; D95 is a separate env-projection mismatch.

Source excerpt `plugins/external-mcps/src/lib/subprocess/server-registry.ts:615`:

```ts
			state.lastError = formatMissingEnvMessage(id, safeEnv.missing);
			throw new MissingEnvError(id, safeEnv.missing);
		}
		const transport = createChildTransport(entry.command, entry.args, {
			spawner: this.spawner,
			cwd: this.options.workspaceRoot,
			env: safeEnv.env,
			setTimer: this.setTimer,
			sigkillGraceMs: this.sigkillGraceMs,
```

## EXT-03 — Capability normalization erases child tool errors and reports success

**Severity:** P2

**State:** confirmed with local synthetic fixture

**Component:** external-mcps

**Locations:** plugins/external-mcps/src/lib/subprocess/server-registry.ts:518; plugins/external-mcps/src/lib/tools/invoke-proxy.ts:219; plugins/external-mcps/src/lib/tools/invoke-proxy.ts:231; plugins/external-mcps/src/lib/normalize/normalize-response.service.ts:63

**Snapshot:** bec5d5daf945df78464e4535c47628809ef8ca64

**Expected:** An MCP tool execution error remains distinguishable from a successful answer after normalization.

**Observed:** Fake child returns result.isError=true with an explanatory text. Registry returns ok:true. Capability handler returns ok:true with facts/handle/contract and no isError indicator or original result.

**Reproduction:** {"command": "bun --tsconfig-override external/tsconfig.probe.json external/probe.ts", "case": "normalized-tool-error", "limits": "Uses fixed-snapshot production external-mcps source, injected fake subprocess and captured registration callback. Does not run npx, Docker, npm, providers, network or a full SDK client."}

**Evidence:** evidence/completion-external/; ['probe.ts', 'probe-result.jsonl', 'dependency-hashes.json']

**Impact:** The agent sees a failed external operation as a successful normalized answer; error-aware retries and usage accounting can be wrong. Bare mode retains nested result.isError, so complete loss is specifically proved for capability mode.

**Root cause:** Registry tests JSON-RPC error only; normalizer selects content/structuredContent and ignores MCP CallToolResult.isError. Proxy marks every registry success as semantic success.

**Recommendation:** Preserve or translate child isError before normalization; retain an explicit machine-readable child failure and explanatory content.

**Regression:** Feed successful, JSON-RPC error and result.isError replies through SDK and capability/bare modes; assert semantic error remains visible and no success tally is recorded.

**Confidence:** high within source and injected-process boundary; no real external provider run

**Relation:** New response-semantic defect. D41/EXT-01 concerns missing-env schema, D101 concerns readiness status; neither covers loss of child execution errors.

Source excerpt `plugins/external-mcps/src/lib/tools/invoke-proxy.ts:225`:

```ts
					}
					if (
						capability === undefined ||
						options.gateway === undefined
					)
						return toolJson({ ok: true, result: outcome.result });
					const normalized = await normalizeResponse(
						outcome.result,
						options.gateway.keep,
					);
					const contract = capability.shapesCode
						? await options.gateway.contract()
						: undefined;
					const described = capability.name.startsWith('design.')
```

## EXT-04 — Capability raw-answer cache persists content before redaction

**Severity:** P2

**State:** confirmed with local synthetic fixture

**Component:** external-mcps

**Locations:** plugins/external-mcps/src/lib/normalize/normalize-response.service.ts:60; plugins/external-mcps/src/lib/contract/capability-gateway.service.ts:40; plugins/external-mcps/src/index.ts:138; plugins/external-mcps/skills/external-mcps/SKILL.md:64

**Snapshot:** bec5d5daf945df78464e4535c47628809ef8ca64

**Expected:** Durable raw-answer storage applies the documented redaction policy before writing.

**Observed:** A synthetic GitHub-shaped marker recognized by core redactSecrets remains in actual raw JSON written by gateway.keep; output contains booleans/lengths only.

**Reproduction:** {"command": "bun --tsconfig-override external/tsconfig.probe.json external/probe.ts", "case": "raw-cache", "limits": "Uses fixed-snapshot production external-mcps source, injected fake subprocess and captured registration callback. Does not run npx, Docker, npm, providers, network or a full SDK client."}

**Evidence:** evidence/completion-external/; ['probe.ts', 'probe-result.jsonl', 'dependency-hashes.json']

**Impact:** External answers can leave credentials they happen to contain in the local durable plugin cache, contrary to the workflow promise. This demonstrates local persistence only, not external disclosure or real credential exposure.

**Root cause:** Normalizer JSON.stringify(raw) passes directly to gateway.keep; gateway writes json through writeFileAtomic without redactSecrets. Atomicity is not redaction.

**Recommendation:** Redact before deriving and writing the durable raw representation; explicitly decide whether facts should be sanitized, and preserve meaningful accounting/handle identity after redaction.

**Regression:** Use synthetic recognized marker, real temporary raw store and core redactor; assert marker absent from disk and returned normalized facts under the documented policy.

**Confidence:** high within source and injected-process boundary; no real external provider run

**Relation:** New cache writer path; G117 concerns issue text and G121 concerns acknowledgement provenance, not this store. D95 concerns child environment, which is filtered independently and does not prevent sensitive response content.

Source excerpt `plugins/external-mcps/src/lib/normalize/normalize-response.service.ts:55`:

```ts
 */
export const normalizeResponse = async (
	raw: unknown,
	keep: (handle: string, json: string) => Promise<void>,
): Promise<INormalizedAnswer> => {
	const json = JSON.stringify(raw ?? null);
	const handle = `ext-raw:${createHash('sha256').update(json).digest('hex').slice(0, RAW_HANDLE_HEX_LENGTH)}`;
	await keep(handle, json);
	const result = (
```

## USAGE-01 — Successful issue collections are persisted as schema incongruences

**Severity:** P2

**State:** confirmed

**Component:** plugins/usage-tracking

**Locations:** plugins/usage-tracking/src/lib/services/invocation-recorder.service.ts:254-271,296-310,351-428; plugins/usage-tracking/src/lib/services/usage-rollup.service.ts:258-282,310-344; plugins/issues/src/lib/tools/list-issues.tool.ts:26-48

**Snapshot:** bec5d5daf945df78464e4535c47628809ef8ca64

**Expected:** A successful domain payload with an issues collection must not be classified as a validation error merely because of its field name.

**Observed:** buildInvocationRecord creates errorTelemetry.classification=schema-incongruence and an error object for both issues:[] and issues:[{number:1,...}], while outcome remains success. This increments schemaIncongruences and populates telemetry issues for valid calls.

**Reproduction:** bun /tmp/delendai-audit-finish-20261020/usage/probe.ts; bun /tmp/delendai-audit-finish-20261020/usage/surface.ts (the latter also exercises unrelated raw SDK clear-schema behavior).

**Evidence:** evidence/completion-usage/; ['probe-output.log ordinary-issues cases', 'surface-output.log real-issues-tool-fake-port: actual runListIssues with a local fake read port returns ok:true/issues:[], then actual recorder flags schema incongruence']

**Impact:** False error counts, fabricated correlation/error records and noisy diagnostics undermine observability and product decisions. No GitHub call or host UI impact was simulated.

**Root cause:** hasSchemaIncongruence tests truthiness of generic result.issues; empty arrays are truthy, and issues is also an ordinary domain collection field.

**Recommendation:** Use an explicit validation discriminator/envelope, or require known validation failure shape and failed outcome; never infer a schema error solely from a collection name.

**Regression:** Real successful issues list results, empty/nonempty, yield no errorTelemetry and zero incongruences; explicit Zod failure still classifies correctly.

**Confidence:** High: production recorder plus actual issue-tool callback with fake port reproduced, no external service.

**Relation:** New against recovered findings.json and prior-findings.json; does not duplicate generic MCP output-schema mismatch G61-MCP01.

Source excerpt `plugins/usage-tracking/src/lib/services/invocation-recorder.service.ts:254`:

```ts
const hasSchemaIncongruence = (
	result: Record<string, unknown> | null,
	message: string | null,
): boolean => {
	if (
		result?.zodError ||
		result?.validationErrors ||
		result?.issues ||
		result?.schemaError
	) {
		return true;
	}
	if (result?.ok === false && result?.error === undefined) return true;
```

## USAGE-02 — Same-tool completions in reverse order corrupt latency attribution despite an available elapsedMs

**Severity:** P2

**State:** confirmed

**Component:** plugins/usage-tracking

**Locations:** plugins/usage-tracking/src/lib/start-clock.ts:5-10,16-28; plugins/usage-tracking/src/index.ts:386-413; packages/core/src/lib/project/instrument-tool-handlers.helper.ts:214-240,313-355; packages/core/src/lib/cli/assemble.ts:1215-1230

**Snapshot:** bec5d5daf945df78464e4535c47628809ef8ca64

**Expected:** Each completed invocation should use its own duration; overlapping calls to the same tool must not exchange start timestamps.

**Observed:** For starts A=100 and B=200, B finishing250 and A400 produce recorded150/200ms instead of actual50/300ms. Core measures elapsedMs per invocation and forwards its fifth hook argument, but plugin onToolCall only receives four arguments and uses FIFO by tool name.

**Reproduction:** bun /tmp/delendai-audit-finish-20261020/usage/probe.ts; clock-out-of-order case uses production StartClock and explicit logical timestamps.

**Evidence:** evidence/completion-usage/; ['probe-output.log clock-out-of-order', 'tests/src/lib/start-clock.spec.ts:16-23 pins FIFO, without reversed-completion semantics', 'caller-evidence.log fixed source traces hooks and fifth elapsedMs']

**Impact:** Per-call durations, percentiles, slow-call rankings and performance decisions become inaccurate during overlapping same-tool calls. Pure deterministic reproduction; no real MCP concurrency load test claimed.

**Root cause:** FIFO matches completion order to start order without an invocation identity; an accurate per-call elapsedMs is already provided by core but ignored here.

**Recommendation:** Consume the fifth elapsedMs hook parameter and pass it through to durationMs, retaining unmatched/null fallback only when the host lacks that measurement. Avoid a second timing authority.

**Regression:** Two same-tool invocations finishing in reverse order retain50 and300ms respectively; serial and missing-host-timing cases remain explicit.

**Confidence:** High for algorithm and production caller wiring. Runtime scheduling was represented by deterministic ordered events, not an external host.

**Relation:** New in recovered own finding indices. Related to observability accuracy, separate from D75/D83 and TOK-02.

Source excerpt `plugins/usage-tracking/src/lib/start-clock.ts:1`:

```ts
/**
 * start-clock.ts — pair `onToolStart` with `onToolCall` to derive
 * `durationMs`.
 *
 * The observability hooks carry no correlation id, so we key pending
 * starts by tool name and pair FIFO: `onToolStart` enqueues a timestamp,
 * `onToolCall` dequeues the oldest one for the same tool. This is robust
 * to concurrent and re-entrant calls of the SAME tool (each start gets its
 * own slot) without inventing a host contract. An unmatched completion
 * (start never observed) simply yields a `null` duration.
 */
export class StartClock {
	private readonly pending = new Map<string, number[]>();

	/** Record a start time for `toolName`. */
	begin(toolName: string, at: number): void {
		const queue = this.pending.get(toolName);
		if (queue) queue.push(at);
		else this.pending.set(toolName, [at]);
	}

	/** Take the oldest pending start for `toolName`, or undefined. */
	take(toolName: string): number | undefined {
		const queue = this.pending.get(toolName);
		if (!queue || queue.length === 0) return undefined;
		const at = queue.shift();
		if (queue.length === 0) this.pending.delete(toolName);
		return at;
	}
```

## USAGE-03 — Rollup savingsPercent changes denominator from baseline to spent tokens

**Severity:** P2

**State:** confirmed

**Component:** plugins/usage-tracking

**Locations:** plugins/usage-tracking/src/lib/record.ts:138-147,270-284; plugins/usage-tracking/src/lib/rollup.ts:116-117,142-152,160-188; plugins/usage-tracking/src/lib/tools/report.tool.ts:254-306; plugins/usage-tracking/README.md:69-74

**Snapshot:** bec5d5daf945df78464e4535c47628809ef8ca64

**Expected:** An aggregate of one measured invocation should retain its savings percentage and state the same baseline semantics.

**Observed:** One production record with baseline1200 and reported usage900 has tokensSaved300 and tokenAccounting.savingsPercent25. computeTotals of only that row emits savingsPercent33 (300/900). Group buckets use the same changed denominator; large savings can exceed100%.

**Reproduction:** bun /tmp/delendai-audit-finish-20261020/usage/probe.ts; savings-denominator case.

**Evidence:** evidence/completion-usage/; ['probe-output.log savings-denominator', 'plugins/usage-tracking/tests/src/lib/rollup.spec.ts:144-175 currently pins saved/used ratio']

**Impact:** Usage reports and persisted summaries overstate baseline reduction under the same field label. This proves formula inconsistency, not provider billing errors or a measured historical savings amount.

**Root cause:** Row accounting divides savings by baseline; rollup.savingsPercentOf divides summed savings by actual usage and ignores comparable baseline/status provenance.

**Recommendation:** Aggregate measured baseline/usage pairs with the same denominator; keep estimated savings separate and unavailable ratios null. If saved/used is desired, give it a distinct explicitly documented name.

**Regression:** A singleton baseline1200/usage900 stays25% in row, group and total; test mixed measured/estimated/unavailable rows without fabricating a baseline.

**Confidence:** High: production pure functions executed with one controlled record.

**Relation:** New against recovered indices; adjacent to G96 missing savings provenance and TOK-01 marketing fixture, but a distinct denominator defect.

Source excerpt `plugins/usage-tracking/src/lib/rollup.ts:115`:

```ts

const savingsPercentOf = (tokensSaved: number, tokensUsed: number): number =>
	tokensUsed === 0 ? 0 : Math.round((100 * tokensSaved) / tokensUsed);
```
