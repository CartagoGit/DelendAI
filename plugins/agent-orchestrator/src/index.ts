/**
 * `agent-orchestrator` — workflow policy plugin (q00007 S1).
 *
 * Exposes a single MCP tool (`<namespace>_plan`) that takes a task
 * and returns an `IModePlan`. The orchestrator (host) interprets the
 * plan and dispatches subagents via the toolset of its choice.
 *
 * Plugin options (declared via `optionsSchema`):
 *
 *   - `policy` — the full `IOrchestratorPolicy` (default mode +
 *     defaults + per-mode overrides). When omitted, the plugin reads
 *     `mcp-vertex.config.json → orchestration` and falls back to
 *     `auto` if absent.
 *
 * S1 wires types + adapters + planner + the read-only `plan` tool.
 * S2 will add the dispatch tools; S3 the parallel swarm runner; S4
 * the auto wiring tests; S5 the repo dogfooding.
 */
import { z } from 'zod';

import { definePlugin, toolError } from '@mcp-vertex/core/public';

import { FakeDispatchPort } from './lib/dispatch/fake-port.js';
import type { IDispatchPort } from './lib/dispatch/contracts.js';
import {
	assertPolicyValid,
	createOrchestratorEngine,
	DEFAULT_BUDGET_POLICY,
	DEFAULT_ROTATION_POLICY,
	OrchestratorPolicySchema,
} from './lib/policy/policy.js';
import type { IOrchestratorPolicy } from './lib/policy/policy.js';
import type { OrchestratorEngine } from './lib/policy/policy.js';
import { buildDispatchRegistration } from './lib/tools/dispatch.tool.js';
import { buildPlanToolRegistration } from './lib/tools/plan.tool.js';

const DEFAULT_POLICY: IOrchestratorPolicy = {
	defaultMode: 'auto',
	defaults: {
		budget: DEFAULT_BUDGET_POLICY,
		rotation: DEFAULT_ROTATION_POLICY,
	},
};

const OptionsSchema = z
	.object({
		policy: OrchestratorPolicySchema.optional(),
		/** Factory that produces the host's `IDispatchPort`. Defaults to
		 *  `FakeDispatchPort` — dogfooding in S5 wires the real port.
		 *  Schema accepts any value; we narrow at runtime. */
		portFactory: z.unknown().optional(),
	})
	.strict();

type IOptions = z.infer<typeof OptionsSchema>;

export default definePlugin({
	name: 'agent-orchestrator',
	version: '0.1.0',
	describe:
		'Workflow policy plugin: single / linear / swarm / auto modes with token budgets, iteration caps, and mid-task subagent rotation. Default mode is `auto`.',
	optionsSchema: OptionsSchema,
	register(ctx) {
		const parsed = OptionsSchema.safeParse(ctx.options ?? {});
		// S1 reads `defaultMode` + `defaults` only; `perMode` overrides
		// land in S2 (per-mode budgets). We accept `perMode` from the host
		// for forward compatibility but don't act on it here.
		const policy: IOrchestratorPolicy =
			parsed.success && parsed.data.policy
				? {
						defaultMode: parsed.data.policy.defaultMode,
						defaults: parsed.data.policy.defaults,
					}
				: DEFAULT_POLICY;
		try {
			assertPolicyValid(policy);
		} catch (err) {
			// Fail closed: surface a structured error envelope to the host
			// and ship zero tools. The host (mcp-vertex core) can decide
			// whether to retry or skip the plugin.
			return {
				tools: [],
				knowledge: [],
				errors: [
					toolError(
						'invalid-policy',
						`Fix the policy: ${err instanceof Error ? err.message : String(err)}`,
					),
				],
			};
		}

		const engine: OrchestratorEngine = createOrchestratorEngine(policy);

		// Resolve the dispatch port. The host may inject its own via
		// `portFactory`; otherwise we fall back to the fake port (S5
		// dogfoods with the real one).
		const port = resolvePort(
			parsed.success ? (parsed.data as IOptions) : undefined,
		);

		return {
			tools: [
				buildPlanToolRegistration({
					namespacePrefix: ctx.namespacePrefix,
					engine: () => engine,
				}),
				buildDispatchRegistration({
					namespacePrefix: ctx.namespacePrefix,
					engine: () => engine,
					port,
				}),
			],
			knowledge: [
				{
					id: 'agent-orchestrator-overview',
					title: 'agent-orchestrator — workflow policy (q00007)',
					body: [
						'# agent-orchestrator',
						'',
						'Workflow policy plugin. Sits above `auto-agent-selector`',
						'(which model) and `auto-plugin-selector` (which plugins).',
						'',
						'Modes:',
						'',
						'- `single` — orchestrator does the task alone',
						'- `linear` — one subagent at a time, sequential',
						'- `swarm` — fan-out parallel subagents',
						'- `auto` — classify each task, route to the cheapest mode',
						'  (default in dogfooding)',
						'',
						'Always enforces:',
						'',
						'- `budget.maxTokensOrchestrator` / `budget.maxTokensPerSubagent`',
						'- `rotation.maxIterationsPerSubagent`',
						'- mid-task rotation triggers (token-budget-exhausted,',
						'  schema-violation, repeated-output, error-storm)',
					].join('\n'),
				},
			],
		};
	},
});

/**
 * Coerce the `portFactory` option into an `IDispatchPort`. The
 * factory is invoked once at register time with no arguments; the
 * returned value must implement `spawnSubagent(...)`. When the
 * factory is missing or returns garbage, we fall back to a clean
 * `FakeDispatchPort` (no spawn ⇒ all plans fail closed at the host
 * boundary, which is the safest behaviour).
 */
function resolvePort(opts: IOptions | undefined): IDispatchPort {
	const factory = opts?.portFactory;
	if (typeof factory !== 'function') return new FakeDispatchPort();
	try {
		const candidate = factory();
		if (
			candidate &&
			typeof (candidate as IDispatchPort).spawnSubagent === 'function'
		) {
			return candidate as IDispatchPort;
		}
	} catch {
		// fallthrough
	}
	return new FakeDispatchPort();
}
