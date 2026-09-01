import { readdir } from 'node:fs/promises';
import path from 'node:path';

import z from 'zod';

import type { IPeerPluginRegistry } from '@mcp-vertex/core/public';
import {
	DETAIL_LEVELS,
	projectDetail,
	SafeWorkspaceReader,
	resolveWorkspaceContained,
	toolError,
	toolJson,
	type Detail,
	type IToolRegistration,
} from '@mcp-vertex/core/public';

import {
	consolidateAudits,
	renderConsolidationMarkdown,
} from '../services/audit-consolidate.service';
import type { AuditType } from '../services/audit-brief.service';
import {
	resolveAutoScaffold,
	type IAutoScaffoldOptions,
} from '../services/auto-scaffold-proposals.service';
import {
	canonicalAuditPathMessage,
	isCanonicalAuditDir,
} from '../services/audit-path-policy.service';
import { parseAuditFiles } from '../services/parse-audit.service';

const DetailSchema = z.enum(DETAIL_LEVELS);

const collectMarkdownFiles = async (
	root: string,
	relative = '',
): Promise<readonly string[]> => {
	const entries = await readdir(path.join(root, relative), {
		withFileTypes: true,
	});
	const files: string[] = [];
	for (const entry of entries) {
		const child =
			relative.length > 0 ? `${relative}/${entry.name}` : entry.name;
		if (entry.isDirectory()) {
			files.push(...(await collectMarkdownFiles(root, child)));
		} else if (
			entry.isFile() &&
			entry.name.endsWith('.md') &&
			entry.name !== 'README.md'
		) {
			files.push(child);
		}
	}
	return files.sort();
};

// --- output schemas --------------------------------------------------------

const ConsolidationOutputSchema = z.object({
	detail: DetailSchema,
	auditType: z.enum(['plan', 'valuation']),
	auditsFound: z.number(),
	skipped: z.array(z.object({ path: z.string(), reason: z.string() })),
	consensus: z.array(
		z.object({
			dimension: z.string(),
			scores: z.array(
				z.object({ model: z.string(), score: z.number().nullable() }),
			),
			average: z.number().nullable(),
		}),
	),
	findings: z.array(
		z.object({
			id: z.string(),
			titles: z.array(z.string()),
			worstSeverity: z.enum([
				'FATAL',
				'BAD',
				'MINOR',
				'OK',
				'GOOD',
				'PERFECT',
				'EXEMPLARY',
			] as const),
			files: z.array(z.string()),
			seenBy: z.array(z.string()),
		}),
	),
	topActions: z.array(z.string()),
	markdown: z.string(),
	/**
	 * Proposal-scaffolding summary. Three possible shapes:
	 *  - `{ scaffolded: [...] }` — the proposals plugin was loaded
	 *    and the tool wrote the audit record plus any plan/fix proposals.
	 *  - `{ skipped: "proposals-not-loaded" }` — proposals is NOT
	 *    loaded; the audit consolidated but the fix-loop was deferred.
	 *  - `{ disabled: true }` — the caller opted out via
	 *    `autoScaffoldProposals: false`.
	 */
	proposals: z.union([
		z.object({
			scaffolded: z.array(
				z.object({
					id: z.string(),
					filename: z.string(),
					severity: z.string(),
					files: z.array(z.string()),
					kind: z.enum(['audit', 'fix', 'plan']),
				}),
			),
			reason: z.string().optional(),
		}),
		z.object({ skipped: z.string() }),
		z.object({ disabled: z.literal(true) }),
	]),
});

// --- input schema ----------------------------------------------------------

const MAX_TOP_ACTIONS = 50;

const ConsolidateInputSchema = z.object({
	detail: DetailSchema.optional(),
	/** Select an implementation-plan scaffold or normal fix proposals. */
	auditType: z.enum(['plan', 'valuation']).optional(),
	/**
	 * Workspace-relative directory containing the individual audit
	 * `*.md` files. Default: the host's configured `defaultAuditDir`
	 * (`<docsDir>/proposals/done/audits` unless overridden).
	 */
	auditDir: z.string().optional(),
	/** How many top actions to surface. Default: 5. */
	topActions: z.number().int().min(1).max(MAX_TOP_ACTIONS).optional(),
	/**
	 * Override the host's `autoScaffoldProposals` setting for this
	 * call. Pass `false` to opt out of proposal scaffolding without
	 * touching the config file.
	 */
	autoScaffoldProposals: z.boolean().optional(),
	/**
	 * Workspace-relative directory for the scaffolded proposals.
	 * Default: the host's configured `defaultProposalsDir`
	 * (`<docsDir>/proposals/ready` unless overridden). Path is
	 * validated against the workspace root like `auditDir`.
	 */
	proposalsDir: z.string().optional(),
});

// --- builders --------------------------------------------------------------

export interface IConsolidateToolOptions {
	readonly namespacePrefix: string;
	/** Absolute workspace root, used to resolve relative audit paths. */
	readonly workspaceRoot: string;
	/**
	 * Default audits directory (workspace-relative). Used when the
	 * tool call does not pass `auditDir`. The host wires this from
	 * `ctx.options.auditDir` when present, defaulting to
	 * `<docsDir>/proposals/done/audits`.
	 */
	readonly defaultAuditDir: string;
	/**
	 * Default for `topActions` (1–50). Used when the tool call does
	 * not pass an override. The host wires this from
	 * `ctx.options.topActions` when present, defaulting to 5.
	 */
	readonly defaultTopActions?: number;
	/**
	 * Project name rendered in the master document header. Host wires
	 * this from `ctx.options.projectName` so the consolidated markdown
	 * does not hardcode mcp-vertex vocabulary.
	 */
	readonly projectName?: string;
	/**
	 * Default for `autoScaffoldProposals`. Defaults from the plugin
	 * options; the per-call argument overrides it.
	 */
	readonly autoScaffoldProposals?: boolean;
	/**
	 * Peer-plugin registry. Empty/missing at register time;
	 * populated by the core once every plugin has loaded.
	 */
	readonly peerPlugins?: IPeerPluginRegistry;
	/** Default `proposalsDir` (workspace-relative). */
	readonly defaultProposalsDir?: string;
}

/**
 * `<prefix>_audit_consolidate { auditDir?, topActions? }` — read every
 * `*.md` in the audits dir, parse each as an {@link IAuditDocument},
 * deduplicate findings across documents, average per-dimension scores,
 * and (when the `proposals` peer plugin is loaded AND the host opts
 * in via `autoScaffoldProposals: true`) scaffold a native parent plan
 * plus linked fix proposals for every actionable finding. Explicit
 * `auditType: 'valuation'` keeps the report-oriented output.
 */
export const buildConsolidateRegistration = (
	options: IConsolidateToolOptions,
): IToolRegistration => {
	const prefix = options.namespacePrefix;
	return {
		id: 'audit_consolidate',
		summary:
			'Read every *.md audit in the audits directory, parse + deduplicate + average scores, and return the master view + markdown. By default, auto-scaffold a native plan with linked fix proposals when the `proposals` plugin is loaded and `autoScaffoldProposals` is enabled.',
		descriptionKey: 'audit_consolidate',
		tags: ['audit', 'aggregate'],
		register: async (server) => {
			server.registerTool(
				`${prefix}_audit_consolidate`,
				{
					description: `Read every \`*.md\` in the audits directory, parse + deduplicate + average per-dimension scores across N models, and return both the structured consolidation (per-dimension scores, deduplicated findings with \`seenBy\`) and the rendered master markdown. By default, when the \`proposals\` plugin is loaded and \`autoScaffoldProposals\` is enabled, also scaffold a native parent plan plus one linked fix proposal per actionable finding under the proposals directory. Pass \`auditType: "valuation"\` for report-oriented output. Default dir: \`${options.defaultAuditDir}\`.`,
					inputSchema: ConsolidateInputSchema,
					outputSchema: ConsolidationOutputSchema,
				},
				async (args: {
					detail?: Detail | undefined;
					auditType?: AuditType | undefined;
					auditDir?: string | undefined;
					topActions?: number | undefined;
					autoScaffoldProposals?: boolean | undefined;
					proposalsDir?: string | undefined;
				}) => {
					const detail = args.detail ?? 'normal';
					const auditType = args.auditType ?? 'plan';
					const relDir = (
						args.auditDir ?? options.defaultAuditDir
					).replace(/^\.\//u, '');
					if (!isCanonicalAuditDir(relDir)) {
						return toolError(
							`audit dir "${relDir}" is not allowed: not canonical`,
							canonicalAuditPathMessage,
						);
					}
					const contained = resolveWorkspaceContained(
						options.workspaceRoot,
						relDir,
					);
					if (!contained.ok) {
						return toolError(
							`audit dir "${relDir}" is not allowed`,
							contained.reason ??
								'Path must stay inside the workspace root.',
						);
					}
					const absDir = contained.abs;
					const reader = new SafeWorkspaceReader(absDir);
					let entries: readonly string[];
					try {
						entries = await collectMarkdownFiles(absDir);
					} catch (err) {
						return toolError(
							`cannot read audit dir "${relDir}"`,
							`Underlying error: ${(err as Error).message}`,
						);
					}
					const mdRel = entries;
					if (mdRel.length === 0) {
						return toolError(
							`no audit files found under "${relDir}"`,
							'Run several models with `audit_plan` and drop their reports into this directory.',
						);
					}
					const docs: { path: string; body: string }[] = [];
					for (const name of mdRel) {
						try {
							const body = (await reader.readText(name)).content;
							docs.push({ path: name, body });
						} catch {
							// Skip unreadable files but keep going so a single
							// broken audit doesn't fail the whole consolidation.
						}
					}
					const result = consolidateAudits(parseAuditFiles(docs), {
						...(args.topActions !== undefined
							? { topActions: args.topActions }
							: options.defaultTopActions !== undefined
								? { topActions: options.defaultTopActions }
								: {}),
					});

					// Auto-scaffold proposals (gated on proposals availability
					// + host opt-in). Resolve the proposals dir workspace-
					// contained BEFORE writing; fall back to disabled if
					// anything fails so we never write outside the workspace.
					const enabled =
						args.autoScaffoldProposals ??
						options.autoScaffoldProposals ??
						true;
					const proposalsDir =
						args.proposalsDir ??
						options.defaultProposalsDir ??
						'docs/mcp-vertex/proposals/ready';
					const proposalsDirContained = resolveWorkspaceContained(
						options.workspaceRoot,
						proposalsDir,
					);
					let proposalsSummary:
						| {
								scaffolded: Array<{
									id: string;
									filename: string;
									severity: string;
									files: string[];
									kind: 'audit' | 'fix' | 'plan';
								}>;
								reason?: string;
						  }
						| { skipped: string }
						| { disabled: true };
					if (proposalsDirContained.ok) {
						const scaffoldOptions: IAutoScaffoldOptions = {
							enabled,
							auditType,
							peerPlugins: options.peerPlugins,
							// Pass the normalized workspace-relative path forward. The
							// persistence helper must never receive an absolute or escaping
							// tool input, even when that absolute path happens to point back
							// inside the workspace.
							proposalsDir: proposalsDirContained.rel,
							workspaceRoot: options.workspaceRoot,
						};
						const outcome = await resolveAutoScaffold(
							result,
							scaffoldOptions,
						);
						if (outcome.kind === 'scaffolded') {
							proposalsSummary = {
								scaffolded: outcome.records.map(
									(
										r,
									): {
										id: string;
										filename: string;
										severity: string;
										files: string[];
										kind: 'audit' | 'fix' | 'plan';
									} => ({
										id: r.id,
										filename: r.filename,
										severity: r.severity,
										files: [...r.files],
										kind: r.kind,
									}),
								),
							};
						} else if (outcome.kind === 'skipped') {
							proposalsSummary = { skipped: outcome.reason };
						} else {
							proposalsSummary = { disabled: true };
						}
					} else if (!enabled) {
						proposalsSummary = { disabled: true };
					} else {
						// proposals-dir escapes workspace AND opt-in is on:
						// refuse to scaffold so the caller notices the path
						// config bug, instead of silently writing outside.
						proposalsSummary = {
							skipped: 'proposals-dir-out-of-workspace',
						};
					}

					const payload = projectDetail(
						{
							auditType,
							...result,
							markdown: renderConsolidationMarkdown(result, {
								...(options.projectName !== undefined
									? { projectName: options.projectName }
									: {}),
							}),
							proposals: proposalsSummary,
						},
						{
							compact: (full) => ({
								...full,
								consensus: [],
								findings: [],
								markdown: '',
							}),
							normal: (full) => full,
							full: (full) => full,
						},
						detail,
					) as Omit<
						z.infer<typeof ConsolidationOutputSchema>,
						'detail'
					>;
					return toolJson({ detail, ...payload });
				},
			);
		},
	};
};
