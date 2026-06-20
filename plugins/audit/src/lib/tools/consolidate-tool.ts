import { z } from 'zod';

import {
	toolError,
	toolJson,
	type IFileReader,
	type IToolRegistration,
} from '@mcp-vertex/core/public';

import { consolidateAudits, renderConsolidationMarkdown } from '../consolidate';
import { parseAuditFiles } from '../parse-audit';

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
	 * `*.md` files. Default: `docs/proposals/audits`.
	 */
	auditDir: z.string().optional(),
	/** How many top actions to surface. Default: 5. */
	topActions: z.number().int().min(1).max(50).optional(),
});

// --- builders --------------------------------------------------------------

export interface IConsolidateToolOptions {
	readonly namespacePrefix: string;
	readonly reader: IFileReader;
	readonly defaultAuditDir: string;
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
						'Read every `*.md` in the audits directory, parse + deduplicate + average per-dimension scores across N models, and return both the structured consolidation (per-dimension scores, deduplicated findings with `seenBy`) and the rendered master markdown. Default dir: `docs/proposals/audits`.',
					inputSchema: ConsolidateInputSchema,
					outputSchema: ConsolidationOutputSchema,
				},
				async (args: { auditDir?: string; topActions?: number }) => {
					const dir = (
						args.auditDir ?? options.defaultAuditDir
					).replace(/^\.\//u, '');
					const files = options.reader
						.listDir(dir)
						.filter(
							(p) =>
								p.endsWith('.md') && !p.endsWith('README.md'),
						);
					if (files.length === 0) {
						return toolError(
							`no audit files found under "${dir}"`,
							'Run several models with `audit_plan` and drop their reports into this directory.',
						);
					}
					const docs = parseAuditFiles(
						files
							.map((p) => {
								const body = options.reader.readFile(p);
								return body === undefined
									? undefined
									: { path: p, body };
							})
							.filter(
								(x): x is { path: string; body: string } =>
									x !== undefined,
							),
					);
					const result = consolidateAudits(docs, {
						topActions: args.topActions,
					});
					return toolJson({
						...result,
						markdown: renderConsolidationMarkdown(result),
					});
				},
			);
		},
	};
};
