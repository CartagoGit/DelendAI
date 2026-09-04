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

import { basename, dirname, join } from 'node:path';

import type { IToolRegistration } from '@delendai/core/public';
import { SafeWorkspaceReader } from '@delendai/core/public';

import {
	proposalReadDescription,
	proposalReadInputSchema,
	proposalReadOutputSchema,
	PROPOSAL_READ_DEFAULT_PAGE_SIZE,
	type IProposalReadInput,
	type IProposalReadOutput,
} from '../contracts/surfaces/proposal-read.contract';
import { DECIMAL_RADIX } from '../shared/branch-tool-helpers';
import { locateProposal } from '../proposals/locate';
import { readProposalIndex } from '../proposals/index-reader';
import {
	parseProposalDocument,
	type IProposalDocument,
} from '../proposals/proposal-document';
import {
	extractYamlBlock,
	parseFrontmatterBlock,
} from '../proposals/frontmatter-parser';
import {
	projectProposalCompact,
	type IProposalCompactView,
	type IProposalNormalView,
} from '../contracts/proposal-view.contract';
import {
	readPeerReviewLog,
	type IPeerReviewLogEntry,
} from '../shared/peer-review-log';
import { parseProposalSlicePlan } from '../swarm/proposal-slice-plan';

export interface IProposalGetToolOptions {
	readonly namespacePrefix: string;
	readonly proposalsDirAbs: string;
	readonly indexPathAbs: string;
}

interface ILoadedProposalDocument {
	readonly id: string;
	readonly absPath: string;
	readonly raw: string;
	readonly doc: IProposalDocument;
}

const readProposalFile = async (absPath: string): Promise<string> =>
	(
		await new SafeWorkspaceReader(dirname(absPath)).readText(
			basename(absPath),
		)
	).content;

/**
 * Load a proposal document from disk by id. Returns `null` when the
 * proposal is not found.
 */
const loadProposalDocument = async (
	id: string,
	options: IProposalGetToolOptions,
): Promise<ILoadedProposalDocument | null> => {
	const located = await locateProposal(id, {
		proposalsDirAbs: options.proposalsDirAbs,
		indexPathAbs: options.indexPathAbs,
	});
	if (located === null) return null;
	const raw = await readProposalFile(located.absPath);
	const doc = await parseProposalDocument(located.absPath);
	return {
		id,
		absPath: located.absPath,
		raw,
		doc,
	};
};

const readFrontmatterObject = (
	raw: string,
): Readonly<Record<string, unknown>> => {
	const yamlBlock = extractYamlBlock(raw);
	if (yamlBlock === null) return {};
	const parsed = parseFrontmatterBlock(yamlBlock) as Record<string, unknown>;
	return parsed;
};

const readTitle = (input: ILoadedProposalDocument): string => {
	const frontmatter = readFrontmatterObject(input.raw);
	const frontmatterTitle = frontmatter.title;
	if (
		typeof frontmatterTitle === 'string' &&
		frontmatterTitle.trim() !== ''
	) {
		return frontmatterTitle.trim();
	}
	const heading = input.raw.match(/^#\s+(.+)$/mu)?.[1]?.trim();
	return heading && heading.length > 0 ? heading : input.doc.frontmatter.id;
};

const readStringList = (value: unknown): readonly string[] => {
	if (!Array.isArray(value)) return [];
	return value
		.filter((entry): entry is string => typeof entry === 'string')
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
};

const readAuditSection = (value: unknown): string | null => {
	if (typeof value !== 'object' || value === null) return null;
	const section = (value as { section?: unknown }).section;
	return typeof section === 'string' && section.trim() !== ''
		? section.trim()
		: null;
};

const buildCompactSummary = (
	loaded: ILoadedProposalDocument,
): IProposalCompactView => {
	const compact = projectProposalCompact(loaded.doc);
	return {
		...compact,
		title: readTitle(loaded),
	};
};

const buildSlices = (
	loaded: ILoadedProposalDocument,
): Extract<IProposalReadOutput, { view: 'slices' }>['slices'] =>
	(
		parseProposalSlicePlan(loaded.doc.frontmatter.id, loaded.raw)?.slices ??
		[]
	).map((slice) => ({
		id: slice.sliceId,
		status: slice.status,
		title: slice.title,
	}));

const buildDetailProposal = (
	loaded: ILoadedProposalDocument,
): Extract<IProposalReadOutput, { view: 'detail' }>['proposal'] => {
	const frontmatter = readFrontmatterObject(loaded.raw);
	return {
		...buildCompactSummary(loaded),
		priority:
			typeof frontmatter.priority === 'string' &&
			frontmatter.priority.trim() !== ''
				? frontmatter.priority.trim()
				: null,
		parentPlan:
			typeof frontmatter['parent-plan'] === 'string' &&
			frontmatter['parent-plan'].trim() !== ''
				? frontmatter['parent-plan'].trim()
				: null,
		auditSection: readAuditSection(frontmatter['audit-source']),
		related: [...readStringList(frontmatter.related)],
		slices: buildSlices(loaded),
		acceptance: (loaded.doc.frontmatter.acceptanceCriteria ?? []).map(
			(criterion) => ({
				command: criterion.command,
				expect: criterion.expect,
			}),
		),
	};
};

const toReviewAgent = (entry: IPeerReviewLogEntry): string => {
	if (entry.kind === 'transition') return 'system';
	return entry.reviewer ?? entry.implementer ?? 'unknown';
};

const buildHistoryEntries = (
	entries: readonly IPeerReviewLogEntry[],
	proposalId: string,
): Extract<IProposalReadOutput, { view: 'history' }>['history'] =>
	entries
		.filter((entry) => entry.proposalId === proposalId)
		.map((entry) => {
			if (entry.kind === 'transition') {
				return {
					timestamp: entry.ts,
					action: 'transition',
					note: `${entry.from} -> ${entry.to}`,
				};
			}
			return {
				timestamp: entry.ts,
				action: entry.action,
				agent: toReviewAgent(entry),
				...(entry.verdict !== undefined ? { note: entry.verdict } : {}),
			};
		})
		.sort((left, right) => left.timestamp.localeCompare(right.timestamp));

const buildReviewEntries = (
	entries: readonly IPeerReviewLogEntry[],
	proposalId: string,
): Extract<IProposalReadOutput, { view: 'review' }>['reviews'] =>
	entries
		.filter(
			(
				entry,
			): entry is Extract<IPeerReviewLogEntry, { kind: 'review' }> =>
				entry.proposalId === proposalId && entry.kind === 'review',
		)
		.map((entry) => ({
			timestamp: entry.ts,
			action: entry.action,
			agent: toReviewAgent(entry),
			...(entry.verdict !== undefined ? { note: entry.verdict } : {}),
		}));

const loadPeerReviewEntries = async (
	options: IProposalGetToolOptions,
): Promise<readonly IPeerReviewLogEntry[]> =>
	readPeerReviewLog(join(dirname(options.indexPathAbs), 'peer-review.jsonl'));

const buildSurfaceResponse = async (
	args: IProposalReadInput,
	options: IProposalGetToolOptions,
): Promise<IProposalReadOutput | null> => {
	if (args.view === 'list') {
		const entries = await readProposalIndex(options.indexPathAbs);
		const start = Number.parseInt(
			args.pagination?.cursor ?? '0',
			DECIMAL_RADIX,
		);
		const limit = args.pagination?.limit ?? PROPOSAL_READ_DEFAULT_PAGE_SIZE;
		const loaded = await Promise.all(
			entries.map(async (entry) => {
				const absPath = entry.file.startsWith('/')
					? entry.file
					: join(options.proposalsDirAbs, entry.file);
				const raw = await readProposalFile(absPath).catch(() => null);
				if (raw === null) return null;
				const doc = await parseProposalDocument(absPath).catch(
					() => null,
				);
				if (doc === null) return null;
				return {
					id: doc.frontmatter.id,
					absPath,
					raw,
					doc,
				} satisfies ILoadedProposalDocument;
			}),
		);
		const filtered = loaded
			.filter((entry): entry is ILoadedProposalDocument => entry !== null)
			.filter((entry) => {
				if (
					args.filters?.status !== undefined &&
					entry.doc.frontmatter.status !== args.filters.status
				) {
					return false;
				}
				if (
					args.filters?.track !== undefined &&
					entry.doc.frontmatter.track !== args.filters.track
				) {
					return false;
				}
				if (
					args.filters?.kind !== undefined &&
					(entry.doc.frontmatter.kind ?? '') !== args.filters.kind
				) {
					return false;
				}
				return true;
			});
		const page = filtered
			.slice(start, start + limit)
			.map(buildCompactSummary);
		return {
			view: 'list',
			proposals: page,
			nextCursor:
				start + limit < filtered.length ? String(start + limit) : null,
		};
	}

	const loaded = await loadProposalDocument(args.proposalId, options);
	if (loaded === null) return null;
	if (args.view === 'detail') {
		return {
			view: 'detail',
			level: args.detail ?? 'normal',
			proposal: buildDetailProposal(loaded),
		};
	}
	if (args.view === 'slices') {
		return {
			view: 'slices',
			slices: buildSlices(loaded),
		};
	}
	const entries = await loadPeerReviewEntries(options);
	if (args.view === 'history') {
		return {
			view: 'history',
			history: buildHistoryEntries(entries, args.proposalId),
		};
	}
	return {
		view: 'review',
		reviews: buildReviewEntries(entries, args.proposalId),
	};
};

export const buildProposalGetRegistration = (
	options: IProposalGetToolOptions,
): IToolRegistration => ({
	id: 'proposal_get',
	summary: proposalReadDescription,
	tags: ['proposals', 'read', 'lazy'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_proposal_get`,
			{
				inputSchema: proposalReadInputSchema,
				outputSchema: proposalReadOutputSchema,
				description: 'Read a proposal or list them with filters.',
			},
			async (args: IProposalReadInput) => {
				try {
					const payload = await buildSurfaceResponse(args, options);
					if (payload === null) {
						const target =
							'proposalId' in args ? args.proposalId : 'unknown';
						return {
							content: [
								{
									type: 'text' as const,
									text: `proposal '${target}' not found`,
								},
							],
							isError: true,
						};
					}
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
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					return {
						content: [
							{
								type: 'text' as const,
								text: message,
							},
						],
						isError: true,
					};
				}
			},
		);
	},
});

// Re-exports so consumers/tests can assert on the projected shapes.
export type { IProposalCompactView, IProposalNormalView };
