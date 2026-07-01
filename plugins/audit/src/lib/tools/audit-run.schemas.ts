/**
 * audit-run.schemas.ts — Zod input + output schemas for
 * `<prefix>_audit_run` (alcance B, f00077).
 *
 * Pure data declarations: no side effects, no I/O, no runtime
 * behaviour. Extracted from `audit-run.tool.ts` to keep the tool
 * file focused on its registration + handler plumbing (x00091 / s2).
 *
 * The schemas are INTERNAL to the audit-run module — they are
 * consumed only by `audit-run.tool.ts` and the corresponding e2e
 * spec. They are NOT re-exported from the audit plugin's public
 * barrel (`@mcp-vertex/audit`); the public surface of the tool
 * stays the registration + the probe helpers (see
 * `audit-run.tool.ts` for what is exported).
 *
 * Naming: `Run*Schema` is the public-facing schema names (the tool
 * binds them via `server.registerTool`); the others are nested
 * pieces (`SavedFileSchema`, `TargetSchema`, …) referenced from the
 * top-level shapes.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Output schema
// ---------------------------------------------------------------------------

export const SavedFileSchema = z.object({
	provider: z.string(),
	model: z.string(),
	path: z.string(),
	bytes: z.number(),
	elapsedMs: z.number(),
});

export const FailedCallSchema = z.object({
	provider: z.string(),
	model: z.string(),
	error: z.string(),
	elapsedMs: z.number(),
});

export const ScaffoldedSchema = z.object({
	id: z.string(),
	filename: z.string(),
	severity: z.string(),
	files: z.array(z.string()),
});

export const RunOutputSchema = z.object({
	scope: z.string(),
	mode: z.enum(['general', 'specific', 'monorepo']),
	date: z.string(),
	saved: z.array(SavedFileSchema),
	failed: z.array(FailedCallSchema),
	consolidation: z.object({
		auditsFound: z.number(),
		skipped: z.array(z.object({ path: z.string(), reason: z.string() })),
		findings: z.array(z.unknown()),
		topActions: z.array(z.string()),
		markdown: z.string(),
	}),
	/**
	 * Same proposal-scaffolding summary shape as `audit_consolidate`.
	 * Three possible shapes:
	 *  - `{ scaffolded: [...] }` — proposals plugin loaded + opt-in.
	 *  - `{ skipped: "proposals-not-loaded" }` — proposals NOT loaded.
	 *  - `{ disabled: true }` — caller passed `scaffoldProposals: false`.
	 */
	proposals: z.union([
		z.object({ scaffolded: z.array(ScaffoldedSchema) }),
		z.object({ skipped: z.string() }),
		z.object({ disabled: z.literal(true) }),
	]),
	projects: z.array(z.string()),
});

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

export const LlmProviderSchema = z.enum([
	'openrouter',
	'anthropic',
	'google',
	'openai',
] as const);

export const TargetSchema = z.object({
	provider: LlmProviderSchema,
	model: z.string().min(1),
	apiKey: z.string().min(1),
});

export const RunInputSchema = z.object({
	/**
	 * Audit scope — same vocabulary as `audit_plan`. Universal
	 * scopes (`full` default, `security`, `tokens`, `tests`, `docs`)
	 * or any configured layer.
	 */
	scope: z.string().optional(),
	/**
	 * Audit mode. Mirrors `audit_plan`:
	 *
	 *  - `general` — whole-project audit.
	 *  - `specific` — one dimension/layer.
	 *  - `monorepo` — restrict to a subset via `projects`.
	 *
	 * Inferred from `scope` + `projects` when omitted.
	 */
	mode: z.enum(['general', 'specific', 'monorepo']).optional(),
	/**
	 * Monorepo project filter. Same semantics as `audit_plan`:
	 * accepts a list of layer names; layers not in the list are
	 * dropped from this audit (but stay configured for future runs).
	 * Empty/missing ⇒ audit every configured layer.
	 */
	projects: z.array(z.string().min(1)).optional(),
	/**
	 * One or more LLM targets. Each is `(provider, model, apiKey)`.
	 * At least one is required; the tool caps concurrency at 4 and
	 * surfaces the remainder's results sequentially when more are
	 * passed (see {@link callLlmFanOut}).
	 */
	targets: z.array(TargetSchema).min(1).max(8),
	/**
	 * Workspace-relative directory for the saved audit markdowns.
	 * Default `docs/mcp-vertex/proposals/done/audits`. The path is
	 * validated against the workspace root before any write
	 * happens.
	 */
	auditDir: z.string().optional(),
	/**
	 * Whether to also scaffold proposals for the deduplicated
	 * findings. Default `true`. Hosts that only want the
	 * consolidation can set this to `false`.
	 */
	scaffoldProposals: z.boolean().optional(),
	/**
	 * Workspace-relative directory for the scaffolded proposals.
	 * Default `docs/mcp-vertex/proposals/ready`. Validated against
	 * the workspace root like `auditDir`.
	 */
	proposalsDir: z.string().optional(),
	/**
	 * First id (numeric part) the scaffolder should try when
	 * allocating new proposal ids. Default `1`. The scaffolder
	 * walks upward until it finds an unused number under the
	 * configured prefix.
	 */
	proposalStartAt: z.number().int().min(1).optional(),
	/**
	 * Prefix for new proposal ids. Default `x` (fix). Hosts that
	 * want a different band (e.g. `c` for chore) can override.
	 */
	proposalPrefix: z
		.enum(['f', 'x', 'c', 'r', 'd', 'a', 't', 'n', 'q', 'u', 'l'] as const)
		.optional(),
	/**
	 * Originating audit id. When set, the scaffolder links it as
	 * `related: [aNNNNN]` in each scaffolded proposal's
	 * frontmatter. Default: omit the link.
	 */
	auditId: z.string().optional(),
	/**
	 * ISO date (`YYYY-MM-DD`) for the saved audit filenames and
	 * the proposal `date` field. Default: today (UTC).
	 */
	date: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/u, 'expected YYYY-MM-DD')
		.optional(),
	/**
	 * Per-target timeout in ms. Default 90 000. Forwarded to the
	 * LLM client.
	 */
	timeoutMs: z.number().int().min(1_000).max(600_000).optional(),
});