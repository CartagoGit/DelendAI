/**
 * options.ts — plugin option schema (Zod), incl. the provider roster.
 *
 * The canonical `providers` roster is a ROOT-level config block
 * (`mcp-vertex.config.json#providers`) so peers can read it without
 * coupling to this plugin (wiki/07). Core does not yet surface that root
 * block on `IMcpPluginContext`, so in S4 the runner also accepts a roster
 * under its own `plugins.orchestrator-runner.options.providers` as a
 * pragmatic, fully-typed source for scoring/healthcheck. S5's bootstrap
 * writes the canonical root block; wiring the root read is a follow-up
 * (needs a core ctx addition) and is out of S4 scope. Documented in README.
 */
import { z } from 'zod';

export const CapabilityTagSchema = z.enum([
	'code-edit',
	'long-context',
	'very-long-context',
	'architecture',
	'security-audit',
	'reasoning',
	'vision',
	'fast-iteration',
	'json-strict',
	'multilingual',
	'agentic',
	'summarization',
]);

export const InvokeSchema = z.discriminatedUnion('kind', [
	z.object({
		kind: z.literal('api'),
		url: z.string(),
		method: z.enum(['GET', 'POST']).optional(),
		envVar: z.string(),
	}),
	z.object({
		kind: z.literal('subscription'),
		tool: z.enum(['vscode-copilot', 'claude-code', 'codex', 'cursor']),
	}),
	z.object({
		kind: z.literal('cli'),
		command: z.string(),
		args: z.array(z.string()).optional(),
	}),
	z.object({
		kind: z.literal('mcp-server'),
		server: z.string(),
		tool: z.string(),
		args: z.record(z.string(), z.unknown()),
	}),
]);

export const ProviderSchema = z.object({
	id: z.string().min(1),
	kind: z.enum(['api', 'subscription', 'cli', 'mcp-server']),
	invoke: InvokeSchema,
	modelId: z.string().min(1),
	contextWindow: z.number().int().nonnegative(),
	costTier: z.union([
		z.literal(1),
		z.literal(2),
		z.literal(3),
		z.literal(4),
		z.literal(5),
	]),
	strengths: z.array(CapabilityTagSchema),
	weaknesses: z.array(CapabilityTagSchema),
});

export const OptionsSchema = z
	.object({
		/**
		 * The provider roster (S4 pragmatic source; canonical home is
		 * root-level `providers`). Empty by default → advice returns a
		 * `handoff` pointing at bootstrap.
		 */
		providers: z.array(ProviderSchema).optional(),
		/** Session stickiness TTL (seconds). Default 300 (CRITICAL I12). */
		sessionStickinessTtlSeconds: z.number().int().min(1).optional(),
		/** Default cost preference when a caller omits it. Default `balanced`. */
		defaultCostPreference: z
			.enum(['minimize', 'balanced', 'maximize'])
			.optional(),
		/**
		 * Wall-clock cap (ms) per `<prefix>_invoke` call (S6). Default 30_000.
		 * A per-call `timeoutMs` argument overrides it. When the cap elapses
		 * the runner fires the per-kind cancellation ladder (SIGTERM→SIGKILL
		 * for `cli`, `$/cancelRequest` for `mcp-server`, `AbortController` for
		 * `api`) then surfaces a `timeout-exceeded` error.
		 */
		invokeTimeoutMs: z.number().int().min(1).optional(),
		/** Warm subprocess pool size (S6). Default 2. */
		subprocessPoolSize: z.number().int().min(1).optional(),
		/** Max concurrent in-flight invocations (S6). Default 4. */
		concurrencyLimit: z.number().int().min(1).optional(),
		/** Max fallback hops when a provider fails (S6). Default 3. */
		maxFallbackDepth: z.number().int().min(1).optional(),
		/**
		 * How the runner walks the fallback chain (CRITICAL I7). `rerank`
		 * (default) re-scores with the failed provider excluded and relaxes
		 * the cost-tier cap by 1 per hop; `tier-down` walks strictly downward.
		 */
		fallbackStrategy: z.enum(['rerank', 'tier-down']).optional(),
		/**
		 * Safety default (CRITICAL I5): OFF. When false the runner NEVER spends
		 * the user's API money — `api`/`cli` invocations return an
		 * `execution-disabled` error with a handoff, not a spawn. Flip to true
		 * to allow spending (still gated by `confirmBeforeExecute`).
		 */
		executeApi: z.boolean().optional(),
		/**
		 * Safety default (CRITICAL I5): ON. With `executeApi:true`, each
		 * `api`/`cli` invocation still requires a signed confirmation token
		 * tied to that specific invocation (emitted via an MCP elicitation).
		 * The LLM cannot mint its own token. Set false ONLY with the explicit
		 * per-session opt-in; every auto-bypassed invocation is recorded.
		 */
		confirmBeforeExecute: z.boolean().optional(),
		/**
		 * Explicit per-session opt-in that lets `confirmBeforeExecute:false`
		 * actually auto-bypass the token prompt (the CLI's
		 * `--yes-i-take-responsibility-for-spend` equivalent). Without this the
		 * runner refuses to bypass even when `confirmBeforeExecute` is false.
		 */
		autoBypassConfirmed: z.boolean().optional(),
		/**
		 * Injected cross-plugin dependencies (e.g. the shared loop detector).
		 * Passthrough — validated structurally by the seam resolver, never by
		 * this schema, so a host can inject a class instance.
		 */
		dependencies: z.unknown().optional(),
	})
	.strict();

export type OrchestratorRunnerOptions = z.infer<typeof OptionsSchema>;

export const DEFAULT_OPTIONS = {
	sessionStickinessTtlSeconds: 300,
	defaultCostPreference: 'balanced' as const,
	invokeTimeoutMs: 30_000,
	subprocessPoolSize: 2,
	concurrencyLimit: 4,
	maxFallbackDepth: 3,
	fallbackStrategy: 'rerank' as const,
	executeApi: false,
	confirmBeforeExecute: true,
	autoBypassConfirmed: false,
};
