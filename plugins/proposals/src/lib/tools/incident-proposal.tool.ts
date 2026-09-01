import { join } from 'node:path';

import {
	redactSecrets,
	toolError,
	toolOk,
	type IToolRegistration,
	writeFileAtomic,
} from '@mcp-vertex/core/public';
import {
	createLogStore,
	logIncidents,
	type ILogIncidentsOptions,
} from '@mcp-vertex/logs/public';
import z from 'zod';

import type {
	IIncidentProposalLogReadResult,
	IIncidentProposalToolOptions,
} from '../contracts/interfaces/incident-proposal-tool-options.interface';
import {
	allocateNextProposalId,
	prefixForKind,
} from '../proposals/proposal-id-allocator';
import {
	buildIncidentProposalWriteSummarySchema,
	incidentProposalDraftSchema,
} from '../contracts/schemas/incident-proposal.schema';
import { readProposalIndex, readTextOrNull } from '../proposals/index-reader';
import {
	extractYamlBlock,
	parseFrontmatterBlock,
} from '../proposals/frontmatter-parser';
import { syncProposalRegistry } from '../proposals/sync-proposal-registry';
import { slugFromTitle } from '../shared/string-helpers';
import {
	buildIncidentProposalDrafts,
	draftTitleDedupKeyOf,
	normalizeIncidentDedupKey,
} from '../services/incident-proposal.service';
import type { IIncidentProposalDraft } from '../contracts/interfaces/incident-proposal.interface';

const MAX_INCIDENT_DRAFTS = 200;
const ISO_DATE_LENGTH = 10;

const INCIDENT_PROPOSAL_INPUT_SCHEMA = z.object({
	write: z.boolean().optional(),
	since: z.string().optional(),
	limit: z.number().int().positive().max(MAX_INCIDENT_DRAFTS).optional(),
});

const INCIDENT_PROPOSAL_OUTPUT_SCHEMA = buildIncidentProposalWriteSummarySchema(
	{
		ok: z.literal(true),
		drafts: z.array(incidentProposalDraftSchema()),
		deduped: z.number(),
		totalClusters: z.number(),
	},
);

type IProposalKind =
	| 'feat'
	| 'fix'
	| 'perf'
	| 'audit'
	| 'docs'
	| 'chore'
	| 'spike';

const PROPOSAL_KIND_BY_CLASSIFICATION: Record<string, IProposalKind> = {
	BUG: 'fix',
	REGRESSION: 'fix',
	SECURITY: 'audit',
	PRIVACY: 'audit',
	PERFORMANCE: 'perf',
	TOKEN_REGRESSION: 'perf',
	DOC_DRIFT: 'docs',
	CONFIG_DRIFT: 'chore',
	DUPLICATE: 'chore',
	NOT_A_BUG: 'chore',
	DESIGN_DECISION: 'feat',
	PRODUCT_DECISION: 'feat',
	NEEDS_REPRODUCTION: 'spike',
	UNKNOWN: 'spike',
};

export const proposalKindForIncidentClassification = (
	classification: string,
): IProposalKind => PROPOSAL_KIND_BY_CLASSIFICATION[classification] ?? 'spike';

const canonicalTitleOf = (title: string): string => title.trim();

const extractDocumentTitle = (raw: string): string | null => {
	const block = extractYamlBlock(raw);
	if (block !== null) {
		const parsed = parseFrontmatterBlock(block);
		if (
			typeof parsed.title === 'string' &&
			parsed.title.trim().length > 0
		) {
			return parsed.title.trim();
		}
	}
	const heading = raw.match(/^#\s+.+?—\s+(.+)$/m)?.[1]?.trim();
	return heading && heading.length > 0 ? heading : null;
};

export const readExistingDedupKeys = async (
	options: Pick<
		IIncidentProposalToolOptions,
		'indexPathAbs' | 'proposalsDirAbs'
	>,
): Promise<Set<string>> => {
	const entries = await readProposalIndex(options.indexPathAbs);
	const keys = new Set<string>();
	for (const entry of entries) {
		const raw = await readTextOrNull(
			join(options.proposalsDirAbs, entry.file),
		);
		if (raw === null) continue;
		const block = extractYamlBlock(raw);
		if (block !== null) {
			const parsed = parseFrontmatterBlock(block);
			if (
				typeof parsed.signature === 'string' &&
				parsed.signature.length > 0
			) {
				keys.add(normalizeIncidentDedupKey(parsed.signature));
			}
		}
		const title = extractDocumentTitle(raw);
		if (title !== null) {
			keys.add(draftTitleDedupKeyOf(canonicalTitleOf(title)));
		}
	}
	return keys;
};

export const readIncidentsWithDefault = async (
	options: IIncidentProposalToolOptions,
	query: ILogIncidentsOptions,
): Promise<IIncidentProposalLogReadResult> => {
	if (options.readIncidents !== undefined) {
		return options.readIncidents(query);
	}
	if (options.logsDirAbs === undefined) {
		return { incidents: [], totalIncidents: 0 };
	}
	const store = await createLogStore(options.logsDirAbs);
	return logIncidents(store, query);
};

export async function loadIncidentProposalDraftBatch(
	options: IIncidentProposalToolOptions,
	args: { since?: string | undefined; limit?: number | undefined },
) {
	const incidentResult = await readIncidentsWithDefault(options, {
		...(args.since !== undefined ? { since: args.since } : {}),
	});
	const limitedIncidents =
		typeof args.limit === 'number'
			? incidentResult.incidents.slice(0, args.limit)
			: incidentResult.incidents;
	const existingKeys = await readExistingDedupKeys(options);
	const result = buildIncidentProposalDrafts(limitedIncidents, existingKeys);
	return {
		incidentResult,
		limitedIncidents,
		result,
	};
}

const renderProposalBody = (
	id: string,
	kind: IProposalKind,
	draft: IIncidentProposalDraft,
): string => {
	const date = new Date().toISOString().slice(0, ISO_DATE_LENGTH);
	return [
		'---',
		`id: ${id}`,
		`title: ${JSON.stringify(draft.title)}`,
		`kind: ${kind}`,
		'status: ready',
		'type: proposal',
		`track: ${draft.suggestedTrack}`,
		`date: ${date}`,
		`signature: ${draft.signature}`,
		'---',
		'',
		`# ${id} — ${draft.title}`,
		'',
		'## Goal',
		'',
		`Investigate and resolve the ${draft.classification} incident cluster in ${draft.toolName} without relying on raw args or result payloads.`,
		'',
		'## why',
		'',
		draft.rationale,
		'',
		'## non-goals',
		'',
		'- Do not depend on non-redacted args, result payloads or stacks.',
		'- Do not widen the scope beyond this clustered incident until it is reproduced or disproved.',
		'',
		'## Slices',
		'',
		'- global_gate: type',
		'',
		'### S1 — reproduce and scope clustered incident',
		'- **Status**: pending',
		'- **Files**: `TODO`',
		'- **Gate**: type',
		'- acceptance:',
		`  - "The ${draft.toolName} incident is reproduced or decisively disproved from redacted evidence."`,
		`  - "A root-cause hypothesis exists for ${draft.incidentType}."`,
		'',
		'## acceptance',
		'',
		`- ${draft.summary}`,
		'- The proposal preserves only redacted incident evidence.',
		'',
		'## Source cluster',
		'',
		`- signature: ${draft.signature}`,
		`- classification: ${draft.classification}`,
		`- incidentType: ${draft.incidentType}`,
		`- count: ${draft.sourceCluster.count}`,
		`- distinctAgents: ${draft.sourceCluster.distinctAgents}`,
		`- firstSeen: ${draft.sourceCluster.firstSeen}`,
		`- lastSeen: ${draft.sourceCluster.lastSeen}`,
		`- sampleSummary: ${draft.sourceCluster.sampleSummary}`,
		`- sampleError: ${draft.sourceCluster.sampleError}`,
		'',
	].join('\n');
};

export function buildIncidentProposalRegistration(
	options: IIncidentProposalToolOptions,
): IToolRegistration {
	return {
		id: 'incident_proposals',
		effects: ['write'],
		summary:
			'Convert clustered redacted incidents into deduplicated local proposal drafts, and optionally write them.',
		tags: ['proposals', 'logs', 'dogfooding'],
		register: async (server) => {
			server.registerTool(
				`${options.namespacePrefix}_incident_proposals`,
				{
					description:
						'Analyze clustered internal incidents from the redacted log store, classify them, deduplicate against existing proposals and return local proposal drafts. Pass `write: true` to persist ready proposals through the proposals store.',
					inputSchema: INCIDENT_PROPOSAL_INPUT_SCHEMA,
					outputSchema: INCIDENT_PROPOSAL_OUTPUT_SCHEMA,
				},
				async (args: {
					write?: boolean | undefined;
					since?: string | undefined;
					limit?: number | undefined;
				}) => {
					const { result } = await loadIncidentProposalDraftBatch(
						options,
						args,
					);
					if (args.write !== true) {
						return toolOk({ ...result });
					}
					if (result.drafts.length === 0) {
						return toolOk({
							...result,
							written: 0,
							files: [],
						});
					}

					const written: Array<{ id: string; file: string }> = [];
					for (const draft of result.drafts) {
						const kind =
							PROPOSAL_KIND_BY_CLASSIFICATION[
								draft.classification
							] ?? 'spike';
						const prefix = prefixForKind(kind);
						if (prefix === null) {
							return toolError(
								`no proposal prefix for kind "${kind}"`,
								'Adjust the incident classification to a supported proposal kind.',
							);
						}
						const id = await allocateNextProposalId(prefix, {
							proposalsDirAbs: options.proposalsDirAbs,
							counterPathAbs: options.counterPathAbs,
						});
						const file = `ready/${id}-${slugFromTitle(draft.title, id)}.md`;
						const absPath = join(options.proposalsDirAbs, file);
						const { text } = redactSecrets(
							renderProposalBody(id, kind, draft),
						);
						await writeFileAtomic(absPath, text);
						written.push({ id, file });
					}
					const sync = await syncProposalRegistry(
						options.workspaceRoot,
						options.layout,
						options.extraFolders ?? [],
					);
					const files = written.map(
						({ id, file }) =>
							sync.proposals.find((entry) => entry.id === id)
								?.file ?? file,
					);
					return toolOk({
						...result,
						written: written.length,
						files,
						indexCount: sync.count,
					});
				},
			);
		},
	};
}
