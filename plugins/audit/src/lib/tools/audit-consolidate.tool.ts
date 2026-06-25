import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import {
	resolveWorkspaceContained,
	toolError,
	toolJson,
	type IToolRegistration,
} from '@mcp-vertex/core/public';

import {
	consolidateAudits,
	renderConsolidationMarkdown,
} from '../services/audit-consolidate.service';
import { parseAuditFiles } from '../services/parse-audit.service';

// --- output schemas --------------------------------------------------------

const ConsolidationOutputSchema = z.object({
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
				'MUY_MAL',
				'MEJORABLE',
				'OK',
				'MUY_BIEN',
				'PERFECTO',
			] as const),
			files: z.array(z.string()),
			seenBy: z.array(z.string()),
		}),
	),
	topActions: z.array(z.string()),
	markdown: z.string(),
});

// --- input schema ----------------------------------------------------------

const ConsolidateInputSchema = z.object({
	/**
	 * Workspace-relative directory containing the individual audit
	 * `*.md` files. Default: `docs/mcp-vertex/proposals/done/audits`.
	 */
	auditDir: z.string().optional(),
	/** How many top actions to surface. Default: 5. */
	topActions: z.number().int().min(1).max(50).optional(),
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
	 * `docs/mcp-vertex/proposals/done/audits`.
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
}

/**
 * `<prefix>_audit_consolidate { auditDir?, topActions? }` — read every
 * `*.md` in the audits dir, parse each as an {@link IAuditDocument},
 * deduplicate findings across documents, average per-dimension scores,
 * and return both the structured view and the master markdown.
 */
export const buildConsolidateRegistration = (
	options: IConsolidateToolOptions,
): IToolRegistration => {
	const prefix = options.namespacePrefix;
	return {
		id: 'audit_consolidate',
		summary:
			'Read every *.md audit in the audits directory, parse + deduplicate + average scores, and return the master view + markdown.',
		descriptionKey: 'audit_consolidate',
		tags: ['audit', 'aggregate'],
		register: async (server) => {
			server.registerTool(
				`${prefix}_audit_consolidate`,
				{
					description:
						'Read every `*.md` in the audits directory, parse + deduplicate + average per-dimension scores across N models, and return both the structured consolidation (per-dimension scores, deduplicated findings with `seenBy`) and the rendered master markdown. Default dir: `docs/mcp-vertex/proposals/done/audits`.',
					inputSchema: ConsolidateInputSchema,
					outputSchema: ConsolidationOutputSchema,
				},
				async (args: {
					auditDir?: string | undefined;
					topActions?: number | undefined;
				}) => {
					const relDir = (
						args.auditDir ?? options.defaultAuditDir
					).replace(/^\.\//u, '');
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
					let entries: readonly string[];
					try {
						entries = await readdir(absDir);
					} catch (err) {
						return toolError(
							`cannot read audit dir "${relDir}"`,
							`Underlying error: ${(err as Error).message}`,
						);
					}
					const mdRel = entries
						.filter((n) => n.endsWith('.md') && n !== 'README.md')
						.sort();
					if (mdRel.length === 0) {
						return toolError(
							`no audit files found under "${relDir}"`,
							'Run several models with `audit_plan` and drop their reports into this directory.',
						);
					}
					const docs: { path: string; body: string }[] = [];
					for (const name of mdRel) {
						const abs = path.join(absDir, name);
						try {
							const body = await readFile(abs, 'utf8');
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
					return toolJson({
						...result,
						markdown: renderConsolidationMarkdown(result, {
							...(options.projectName !== undefined
								? { projectName: options.projectName }
								: {}),
						}),
					});
				},
			);
		},
	};
};
