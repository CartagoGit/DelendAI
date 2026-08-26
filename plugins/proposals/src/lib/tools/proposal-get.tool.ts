/**
 * `proposal_get` — `r00031`.
 *
 * Loads a single proposal by id and returns a view at the requested
 * detail level (compact | normal | full). The default level is
 * `'normal'` — strictly smaller than the legacy full payload.
 *
 * Acceptance (per the proposal):
 *   - compact ≤ 2 KB
 *   - normal ≤ 12 KB
 *   - full ≥ 40 KB (the complete document, opt-in)
 *   - no `undefined` fields appear in the JSON serialisation
 */

import { basename } from 'node:path';

import z from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { projectDetail, toolJson } from '@mcp-vertex/core/public';

import { locateProposal } from '../proposals/locate';
import {
	parseProposalDocument,
	type IProposalDocument,
} from '../proposals/proposal-document';
import {
	PROPOSAL_DETAIL_PROJECTIONS,
	type IProposalCompactView,
	type IProposalNormalView,
} from '../contracts/proposal-view.contract';

export interface IProposalGetToolOptions {
	readonly namespacePrefix: string;
	readonly proposalsDirAbs: string;
	readonly indexPathAbs: string;
}

const INPUT_SCHEMA = z.object({
	id: z.string().min(1, 'id must not be empty'),
	detail: z.enum(['compact', 'normal', 'full']).optional(),
});

/**
 * Load a proposal document from disk by id. Returns `null` when the
 * proposal is not found.
 */
const loadProposalDocument = async (
	id: string,
	options: IProposalGetToolOptions,
): Promise<IProposalDocument | null> => {
	const located = await locateProposal(id, {
		proposalsDirAbs: options.proposalsDirAbs,
		indexPathAbs: options.indexPathAbs,
	});
	if (located === null) return null;
	const doc = await parseProposalDocument(located.absPath);
	void basename; // project tree reference; prevents unused import on pruning
	return doc;
};

/** Strip `undefined` fields so the wire JSON is clean. */
const stripUndefined = (value: unknown): unknown => {
	if (value === null || typeof value !== 'object') return value;
	if (Array.isArray(value)) return value.map(stripUndefined);
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
		if (v === undefined) continue;
		out[k] = stripUndefined(v);
	}
	return out;
};

export const buildProposalGetRegistration = (
	options: IProposalGetToolOptions,
): IToolRegistration => ({
	id: 'proposal_get',
	summary:
		'Load a proposal by id and return a view at the requested detail level (compact | normal | full).',
	tags: ['proposals', 'read', 'lazy'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_proposal_get`,
			{
				inputSchema: INPUT_SCHEMA,
				outputSchema: z.object({
					id: z.string(),
					view: z.unknown(),
					level: z.enum(['compact', 'normal', 'full']),
				}),
				description:
					'Loads a single proposal by id and projects it at the requested detail level (compact | normal | full). Default level: normal. ' +
					'Compact returns { id, status, progress, next, summary, kind, track }. ' +
					'Normal extends with slices + acceptance. Full returns the complete document tree.',
			},
			async (args) => {
				const detail = args.detail ?? 'normal';
				const doc = await loadProposalDocument(args.id, options);
				if (doc === null) {
					return {
						content: [
							{
								type: 'text' as const,
								text: `proposal '${args.id}' not found`,
							},
						],
						isError: true,
					};
				}
				const view = stripUndefined(
					projectDetail(doc, PROPOSAL_DETAIL_PROJECTIONS, detail),
				);
				const payload = {
					id: args.id,
					view,
					level: detail,
				};
				return {
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify(payload),
						},
					],
					structuredContent: payload as unknown as Record<
						string,
						unknown
					>,
				};
			},
		);
	},
});

// Re-exports so consumers/tests can assert on the projected shapes.
export type { IProposalCompactView, IProposalNormalView };
