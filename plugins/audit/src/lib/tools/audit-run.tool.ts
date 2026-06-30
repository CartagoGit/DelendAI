/**
 * `<prefix>_audit_run` — Alcance B of the audit plugin (f00077).
 *
 * Closes the audit loop: dispatch the brief to N providers in
 * parallel, save each markdown report, consolidate the findings, and
 * scaffold ready-to-run proposal files for every actionable
 * severity band (FATAL / MUY_MAL / MEJORABLE).
 *
 * Pipeline (each step is a pure call into a dedicated service):
 *
 *  1. `buildBrief(scope, …)` — same renderer the `audit_plan` tool
 *     uses. We DO NOT mutate the existing plan tool; alcances A and
 *     B share the brief definition, only the entry point differs.
 *  2. `callLlmFanOut(targets, brief, …)` — S2 service. One
 *     promise-all over the configured provider list, bounded to
 *     4 concurrent calls so we never hammer a provider's cold-start
 *     rate limit. The transport is injected for the e2e spec (S4).
 *  3. `writeFileAtomic` — each successful markdown is saved to the
 *     configured `auditDir` (workspace-contained).
 *  4. `parseAuditFiles` + `consolidateAudits` — same parsers the
 *     `audit_consolidate` tool uses. We re-invoke them on the just-
 *     written files so the orchestrator's view of the world is
 *     always the freshly-merged consolidation, not a stale one.
 *  5. `scaffoldProposals` — S3 service. Returns the in-memory
 *     proposal records. The tool then writes them to
 *     `docs/mcp-vertex/proposals/ready/`.
 *
 * The tool is intentionally **not** idempotent across runs: a second
 * `audit_run` with the same inputs will create a new batch of
 * `YYYY-MM-DD- <provider>(<model>).md` files (new date prefix) and
 * a fresh round of proposal ids. Hosts that want reproducibility
 * should pass an explicit `date` and a stable `proposalStartAt`.
 */

import { mkdir, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import {
	resolveWorkspaceContained,
	toolError,
	toolJson,
	writeFileAtomic,
	type IToolRegistration,
} from '@mcp-vertex/core/public';

import {
	buildBrief,
	SCORE_DIMENSIONS,
	UNIVERSAL_SCOPES,
	type AuditMode,
	type ILayerConfig,
} from '../services/audit-brief.service';
import {
	auditDateStamp,
	auditFilename,
	callLlmFanOut,
	isoDate,
	type IHttpTransport,
	type ILlmCallOutcome,
	type IModelTarget,
	type LlmProvider,
} from '../services/llm-client.service';
import {
	consolidateAudits,
	renderConsolidationMarkdown,
} from '../services/audit-consolidate.service';
import { parseAuditFiles } from '../services/parse-audit.service';
import {
	scaffoldProposals,
	type IScaffoldedProposal,
} from '../services/proposal-scaffolder.service';

// ---------------------------------------------------------------------------
// Output schema
// ---------------------------------------------------------------------------

const SavedFileSchema = z.object({
	provider: z.string(),
	model: z.string(),
	path: z.string(),
	bytes: z.number(),
	elapsedMs: z.number(),
});

const FailedCallSchema = z.object({
	provider: z.string(),
	model: z.string(),
	error: z.string(),
	elapsedMs: z.number(),
});

const ScaffoldedSchema = z.object({
	id: z.string(),
	filename: z.string(),
	severity: z.string(),
	files: z.array(z.string()),
});

const RunOutputSchema = z.object({
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
	scaffolded: z.array(ScaffoldedSchema),
	projects: z.array(z.string()),
});

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const LlmProviderSchema = z.enum([
	'openrouter',
	'anthropic',
	'google',
	'openai',
] as const);

const TargetSchema = z.object({
	provider: LlmProviderSchema,
	model: z.string().min(1),
	apiKey: z.string().min(1),
});

const RunInputSchema = z.object({
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

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

export interface IRunToolOptions {
	readonly namespacePrefix: string;
	/** Absolute workspace root, used to resolve relative paths. */
	readonly workspaceRoot: string;
	/** Default `auditDir` (workspace-relative). */
	readonly defaultAuditDir: string;
	/** Default `proposalsDir` (workspace-relative). */
	readonly defaultProposalsDir: string;
	/** Default dimensions for the brief. Wired from `ctx.options.dimensions`. */
	readonly dimensions?: readonly string[];
	/** Configured layers, wired from `ctx.options.layers`. */
	readonly layers?: readonly ILayerConfig[];
	/** Project name forwarded to the brief + consolidation renderer. */
	readonly projectName?: string;
	/** Config file hint forwarded to the brief. */
	readonly configFileName?: string;
	/**
	 * Cross-cutting additions for the brief. Wired from
	 * `ctx.options.crossCuttingAdditions`.
	 */
	readonly crossCuttingAdditions?: readonly string[];
	/**
	 * Id set already known to the registry. The tool reads the
	 * cached proposals index so we never collide with an id the
	 * user authored. Optional: when omitted, the scaffolder falls
	 * back to an empty set (still correct, but may collide with
	 * pre-existing proposals if the host forgets to wire it).
	 */
	readonly knownProposalIds?: ReadonlySet<string>;
	/**
	 * Transport for outbound HTTP. The default uses global
	 * `fetch`; the e2e spec injects an in-memory mock.
	 */
	readonly transport?: IHttpTransport;
	/** Optional clock injection for tests. */
	readonly now?: () => Date;
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

const sanitizeRel = (rel: string): string => rel.replace(/^\.\//u, '');

const resolveDir = (
	workspaceRoot: string,
	relDir: string,
): { ok: true; abs: string } | { ok: false; reason: string } => {
	const contained = resolveWorkspaceContained(workspaceRoot, relDir);
	if (!contained.ok) {
		return {
			ok: false,
			reason:
				contained.reason ?? 'Path must stay inside the workspace root.',
		};
	}
	return { ok: true, abs: contained.abs };
};

// ---------------------------------------------------------------------------
// Build the registered tool
// ---------------------------------------------------------------------------

/**
 * `<prefix>_audit_run { scope, targets, … }` — run an end-to-end
 * multi-model audit and scaffold follow-up proposals. See file
 * header for the full pipeline.
 */
export const buildRunRegistration = (
	options: IRunToolOptions,
): IToolRegistration => {
	const prefix = options.namespacePrefix;
	const defaultDimensions = options.dimensions ?? SCORE_DIMENSIONS;
	const configuredLayers = options.layers ?? [];
	const allAvailableScopes = [
		...UNIVERSAL_SCOPES,
		...configuredLayers.map((l) => l.name),
	];
	const configuredLayerNames = new Set(configuredLayers.map((l) => l.name));
	const transport = options.transport;
	const now = options.now ?? (() => new Date());

	return {
		id: 'audit_run',
		summary:
			'Alcance B: dispatch the audit brief (general / specific / monorepo modes) to one or more LLM targets in parallel, save the markdown reports, consolidate the findings, and scaffold fix proposals for every actionable severity band (FATAL/MUY_MAL/MEJORABLE).',
		descriptionKey: 'audit_run',
		tags: ['audit', 'automation', 'fan-out'],
		register: async (server) => {
			server.registerTool(
				`${prefix}_audit_run`,
				{
					description:
						'Run an end-to-end multi-model audit. Provide one or more `targets` (provider + model + API key) and optionally `mode` (`general`/`specific`/`monorepo`) plus `projects` for the monorepo filter. The tool sends the brief to each target, saves the markdown, deduplicates findings via `consolidateAudits`, and writes ready-to-run proposal files for every actionable severity. Workspace-contained: `auditDir` and `proposalsDir` are validated against the workspace root before any write happens.',
					inputSchema: RunInputSchema,
					outputSchema: RunOutputSchema,
				},
				async (args: {
					scope?: string | undefined;
					mode?: AuditMode | undefined;
					projects?: readonly string[] | undefined;
					targets: ReadonlyArray<{
						provider: LlmProvider;
						model: string;
						apiKey: string;
					}>;
					auditDir?: string | undefined;
					scaffoldProposals?: boolean | undefined;
					proposalsDir?: string | undefined;
					proposalStartAt?: number | undefined;
					proposalPrefix?: string | undefined;
					auditId?: string | undefined;
					date?: string | undefined;
					timeoutMs?: number | undefined;
				}) => {
					// --- 1. Resolve scope + mode + projects --------------
					const scope = args.scope ?? 'full';
					if (!allAvailableScopes.includes(scope)) {
						return toolError(
							`unknown scope "${scope}"`,
							`Available scopes: ${allAvailableScopes.join(', ')}.`,
						);
					}
					const projects = args.projects ?? [];
					if (projects.length > 0) {
						const unknown = projects.filter(
							(p) => !configuredLayerNames.has(p),
						);
						if (unknown.length > 0) {
							return toolError(
								`unknown project(s): ${unknown.join(', ')}`,
								`Available layer projects for monorepo mode: ${[...configuredLayerNames].join(', ') || '(none configured)'}.`,
							);
						}
					}
					const mode: AuditMode =
						args.mode ??
						(projects.length > 0
							? 'monorepo'
							: scope === 'full'
								? 'general'
								: 'specific');

					// --- 2. Resolve directories ---------------------------
					const auditRel = sanitizeRel(
						args.auditDir ?? options.defaultAuditDir,
					);
					const proposalsRel = sanitizeRel(
						args.proposalsDir ?? options.defaultProposalsDir,
					);
					const auditDirResult = resolveDir(
						options.workspaceRoot,
						auditRel,
					);
					if (!auditDirResult.ok) {
						return toolError(
							`audit dir "${auditRel}" is not allowed`,
							auditDirResult.reason,
						);
					}
					const proposalsDirResult = resolveDir(
						options.workspaceRoot,
						proposalsRel,
					);
					if (!proposalsDirResult.ok) {
						return toolError(
							`proposals dir "${proposalsRel}" is not allowed`,
							proposalsDirResult.reason,
						);
					}
					const auditDirAbs = auditDirResult.abs;
					const proposalsDirAbs = proposalsDirResult.abs;
					await mkdir(auditDirAbs, { recursive: true });
					await mkdir(proposalsDirAbs, { recursive: true });

					// --- 3. Build the brief -------------------------------
					const brief = buildBrief(scope, {
						dimensions: defaultDimensions,
						layers: configuredLayers,
						mode,
						projects,
						...(options.projectName !== undefined
							? { projectName: options.projectName }
							: {}),
						...(options.configFileName !== undefined
							? { configFileName: options.configFileName }
							: {}),
						...(options.crossCuttingAdditions !== undefined
							? {
									crossCuttingAdditions:
										options.crossCuttingAdditions,
								}
							: {}),
					});

					// --- 4. Fan-out --------------------------------------
					const date = args.date ?? isoDate(now());
					// `auditDateStamp` produces the `DD-MM-YYYY` shape
					// the existing audit parser recognises. The
					// response's `date` field stays ISO (`YYYY-MM-DD`)
					// because it is also embedded in the proposal
					// frontmatter, where the proposal lint expects
					// ISO.
					const fileStamp = auditDateStamp(now());
					const targets: readonly IModelTarget[] = args.targets;
					const outcomes: readonly ILlmCallOutcome[] =
						await callLlmFanOut(targets, brief, {
							...(args.timeoutMs !== undefined
								? { timeoutMs: args.timeoutMs }
								: {}),
							...(transport !== undefined ? { transport } : {}),
						});

					// --- 5. Save each successful markdown -----------------
					const saved: Array<{
						provider: string;
						model: string;
						path: string;
						bytes: number;
						elapsedMs: number;
					}> = [];
					const failed: Array<{
						provider: string;
						model: string;
						error: string;
						elapsedMs: number;
					}> = [];
					const docs: { path: string; body: string }[] = [];
					for (const outcome of outcomes) {
						if (outcome.ok) {
							const filename = auditFilename(
								outcome.target,
								fileStamp,
							);
							const absPath = path.join(auditDirAbs, filename);
							await writeFileAtomic(absPath, outcome.markdown);
							const bytes = Buffer.byteLength(
								outcome.markdown,
								'utf8',
							);
							saved.push({
								provider: outcome.target.provider,
								model: outcome.target.model,
								path: path.join(auditRel, filename),
								bytes,
								elapsedMs: outcome.elapsedMs,
							});
							docs.push({
								path: filename,
								body: outcome.markdown,
							});
						} else {
							failed.push({
								provider: outcome.target.provider,
								model: outcome.target.model,
								error: outcome.error,
								elapsedMs: outcome.elapsedMs,
							});
						}
					}

					// --- 6. Consolidate ----------------------------------
					const parsed = parseAuditFiles(docs);
					const consolidation = consolidateAudits(parsed);
					const markdown = renderConsolidationMarkdown(
						consolidation,
						{
							...(options.projectName !== undefined
								? { projectName: options.projectName }
								: {}),
						},
					);

					// --- 7. Scaffold proposals ----------------------------
					const shouldScaffold = args.scaffoldProposals !== false;
					let scaffoldedRecords: readonly IScaffoldedProposal[] = [];
					if (shouldScaffold && consolidation.findings.length > 0) {
						scaffoldedRecords = scaffoldProposals(consolidation, {
							...(options.knownProposalIds !== undefined
								? { existingIds: options.knownProposalIds }
								: {}),
							outputDir: proposalsRel,
							...(args.auditId !== undefined
								? { auditId: args.auditId }
								: {}),
							date, // ISO for proposal frontmatter
							...(args.proposalStartAt !== undefined
								? { startAt: args.proposalStartAt }
								: {}),
							...(args.proposalPrefix !== undefined
								? { prefix: args.proposalPrefix }
								: {}),
						});
						for (const record of scaffoldedRecords) {
							await writeFileAtomic(
								path.join(proposalsDirAbs, record.filename),
								record.body,
							);
						}
					}

					return toolJson({
						scope,
						mode,
						date,
						saved,
						failed,
						consolidation: {
							auditsFound: consolidation.auditsFound,
							skipped: [...consolidation.skipped],
							findings: consolidation.findings.map((f) => ({
								id: f.id,
								worstSeverity: f.worstSeverity,
								titles: [...f.titles],
								files: [...f.files],
								seenBy: [...f.seenBy],
							})),
							topActions: [...consolidation.topActions],
							markdown,
						},
						scaffolded: scaffoldedRecords.map((r) => ({
							id: r.id,
							filename: r.filename,
							severity: r.severity,
							files: [...r.files],
						})),
						projects: [...projects],
					});
				},
			);
		},
	};
};

// ---------------------------------------------------------------------------
// Probe helpers (test seams)
// ---------------------------------------------------------------------------

/**
 * Probe helper exported for the e2e spec (S4). Lists the audit
 * files currently in a directory and parses them through the same
 * pipeline the tool uses. Lets the test assert on the final state
 * of the disk without re-implementing the read/parse contract.
 */
export const probeAudits = async (
	auditDirAbs: string,
): Promise<{ auditsFound: number; paths: string[] }> => {
	let entries: readonly string[];
	try {
		entries = await readdir(auditDirAbs);
	} catch {
		return { auditsFound: 0, paths: [] };
	}
	const md = entries
		.filter((n) => n.endsWith('.md') && n !== 'README.md')
		.sort();
	const docs: { path: string; body: string }[] = [];
	for (const name of md) {
		try {
			const body = await readFile(path.join(auditDirAbs, name), 'utf8');
			docs.push({ path: name, body });
		} catch {
			/* skip — same tolerance as the consolidate tool */
		}
	}
	return {
		auditsFound: parseAuditFiles(docs).length,
		paths: md,
	};
};

/**
 * Lightweight helper exported for tests and external scripts that
 * want to peek at the just-written proposals directory. Returns the
 * proposal ids found in `*.md` filenames inside `proposalsDirAbs`.
 */
export const probeProposals = async (
	proposalsDirAbs: string,
): Promise<readonly string[]> => {
	let entries: readonly string[];
	try {
		entries = await readdir(proposalsDirAbs);
	} catch {
		return [];
	}
	const ids: string[] = [];
	for (const name of entries) {
		const m = /^([a-z])(\d{5})-/u.exec(name);
		if (m) ids.push(`${m[1]}${m[2]}`);
	}
	return ids.sort();
};
