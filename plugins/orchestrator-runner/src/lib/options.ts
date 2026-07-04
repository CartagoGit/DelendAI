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
};
