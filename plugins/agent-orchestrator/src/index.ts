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
 *     defaults + per-mode overrides, applied when the resolved mode
 *     matches). When omitted, the plugin reads
 *     `mcp-vertex.config.json → orchestration` and falls back to
 *     `auto` if absent.
 *   - `portFactory` — factory producing the host's real
 *     `IDispatchPort`. Required in production; see `resolveDispatchPort`.
 *   - `allowFakeDispatchPort` — explicit opt-in (tests/fixtures only)
 *     to run without a real port, via `FakeDispatchPort`.
 *
 * S1 wires types + adapters + planner + the read-only `plan` tool.
 * S2 will add the dispatch tools; S3 the parallel swarm runner; S4
 * the auto wiring tests; S5 the repo dogfooding.
 */
import { z } from 'zod';

import { definePlugin, toolError } from '@delendai/core/public';

import { TaskClassifier } from './lib/classifier/task-classifier.js';
import type { IDispatchPort } from './lib/dispatch/contracts.js';
import { resolveDispatchPort } from './lib/dispatch/port-resolution.helper.js';
import {
	assertPolicyValid,
	createOrchestratorEngine,
	DEFAULT_BUDGET_POLICY,
	DEFAULT_ROTATION_POLICY,
	OrchestratorPolicySchema,
} from './lib/policy/policy.js';
import type { IOrchestratorPolicy } from './lib/policy/policy.js';
import type { OrchestratorEngine } from './lib/policy/policy.js';
import { InMemoryTelemetrySink } from './lib/telemetry/event.js';
import { buildDispatchRegistration } from './lib/tools/dispatch.tool.js';
import { buildPlanToolRegistration } from './lib/tools/plan.tool.js';
import { buildReadOnlyToolRegistration } from './lib/tools/telemetry.tool.js';

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
		/** Factory that produces the host's real `IDispatchPort`. Required
		 *  in production (see `resolveDispatchPort`); schema accepts any
		 *  value and we validate the *shape* it returns at runtime. */
		portFactory: z.unknown().optional(),
		/** Explicit opt-in to run without a real `portFactory`, using the
		 *  deterministic `FakeDispatchPort`. Tests/fixtures only — leaving
		 *  this unset (the default) makes a missing port a hard failure
		 *  instead of a silently-fabricated success. */
		allowFakeDispatchPort: z.boolean().optional(),
	})
	.strict();

export default definePlugin({
	name: 'agent-orchestrator',
	version: '0.1.0',
	describe:
		'Workflow policy plugin: single / linear / swarm / auto modes with token budgets, iteration caps, and mid-task subagent rotation. Default mode is `auto`.',
	optionsSchema: OptionsSchema,
	register(ctx) {
		const parsed = OptionsSchema.safeParse(ctx.options ?? {});
		if (!parsed.success) {
			// Fail closed on malformed options rather than silently falling
			// back to the default policy: a host that misspells a `perMode`
			// budget key must be told, not quietly given different limits
			// than the ones it wrote down.
			return {
				tools: [],
				knowledge: [],
				errors: [
					toolError(
						'invalid-options',
						`Fix plugins.agent-orchestrator.options: ${parsed.error.issues
							.map(
								(issue) =>
									`${issue.path.join('.')} — ${issue.message}`,
							)
							.join('; ')}`,
					),
				],
			};
		}
		// `policy` (when supplied) already carries `perMode` — validated by
		// `OrchestratorPolicySchema` — and the engine resolves it per mode.
		// Rebuilt field-by-field (rather than spread) so an explicit
		// `perMode: undefined` from zod's optional inference never leaks
		// into the `exactOptionalPropertyTypes` surface.
		const policy: IOrchestratorPolicy = parsed.data.policy
			? {
					defaultMode: parsed.data.policy.defaultMode,
					defaults: parsed.data.policy.defaults,
					...(parsed.data.policy.perMode !== undefined
						? { perMode: parsed.data.policy.perMode }
						: {}),
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
		const classifier = new TaskClassifier();
		// One sink per plugin registration, shared by `_dispatch` (which
		// emits into it) and `_events` (which reads it back). Not a
		// module-level singleton: a fresh instance per `register()` call,
		// matching the engine's own lifecycle.
		const telemetry = new InMemoryTelemetrySink();

		// Resolve the dispatch port. Missing/invalid configuration fails
		// loudly here rather than quietly degrading to a port that never
		// actually dispatches anything (see `port-resolution.ts`).
		// Resolved lazily: the port-independent tools stay available in
		// every preset, while an actual dispatch still refuses to run
		// without a real capability instead of fabricating success.
		const port = (): IDispatchPort =>
			resolveDispatchPort({
				...(parsed.data.portFactory !== undefined
					? { portFactory: parsed.data.portFactory }
					: {}),
				...(parsed.data.allowFakeDispatchPort !== undefined
					? {
							allowFakeDispatchPort:
								parsed.data.allowFakeDispatchPort,
						}
					: {}),
			});

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
					telemetry,
				}),
				buildReadOnlyToolRegistration({
					namespacePrefix: ctx.namespacePrefix,
					classifier,
					telemetry,
					policyDefaultMode: () => policy.defaultMode,
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
