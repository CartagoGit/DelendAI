import z from 'zod';

import {
	toolError,
	toolOk,
	type IToolRegistration,
} from '@delendai/core/public';
import type { ILogIncident } from '@delendai/logs/public';

import type { IIncidentProposalToolOptions } from '../contracts/interfaces/incident-proposal-tool-options.interface';
import type { IIncidentProposalDraft } from '../contracts/interfaces/incident-proposal.interface';
import type { IncidentSeverity } from '../contracts/interfaces/auto-fix-policy.interface';
import { buildIncidentProposalWriteSummarySchema } from '../contracts/schemas/incident-proposal.schema';
import {
	autoFixPolicy,
	defaultSeverityForClassification,
} from '../services/auto-fix-policy';
import { incidentSignatureOf } from '../services/incident-proposal.service';
import { createProposalDocument } from './authoring.tool';
import {
	loadIncidentProposalDraftBatch,
	proposalKindForIncidentClassification,
} from './incident-proposal.tool';

const MAX_AUTO_FIX_QUEUE_ITEMS = 200;

const AUTO_FIX_QUEUE_INPUT_SCHEMA = z.object({
	write: z.boolean().optional(),
	limit: z.number().int().positive().max(MAX_AUTO_FIX_QUEUE_ITEMS).optional(),
});

const AUTO_FIX_QUEUE_OUTPUT_SCHEMA = buildIncidentProposalWriteSummarySchema({
	ok: z.literal(true),
	autoFixable: z.unknown(),
	needsHuman: z.unknown(),
	deduped: z.number(),
	totalClusters: z.number(),
});

interface IAutoFixQueueItem extends IIncidentProposalDraft {
	readonly severity: IncidentSeverity;
	readonly reproducible: boolean;
	readonly affectedPaths: readonly string[];
	readonly affectsPublishedOutputSchema: boolean;
	readonly decision: 'auto-fixable' | 'needs-human';
	readonly reason: string;
}

const severityWeight: Record<IncidentSeverity, number> = {
	critical: 4,
	high: 3,
	medium: 2,
	low: 1,
};

const hasReproductionEvidence = (incident: ILogIncident): boolean => {
	const sampleError = incident.sampleError.trim();
	if (sampleError.length > 0) return true;
	return /\b(repro(?:duced|duction|ducible)?|test)\b/i.test(
		`${incident.sampleSummary} ${incident.sampleError}`,
	);
};

const compareQueueItems = (
	left: IAutoFixQueueItem,
	right: IAutoFixQueueItem,
): number => {
	const severityDelta =
		severityWeight[right.severity] - severityWeight[left.severity];
	if (severityDelta !== 0) return severityDelta;
	const countDelta = right.sourceCluster.count - left.sourceCluster.count;
	if (countDelta !== 0) return countDelta;
	return left.title.localeCompare(right.title);
};

const queueItemFrom = (
	draft: IIncidentProposalDraft,
	incident: ILogIncident | undefined,
): IAutoFixQueueItem => {
	const reproducible = incident ? hasReproductionEvidence(incident) : false;
	const severity = defaultSeverityForClassification(draft.classification);
	const policy = autoFixPolicy({
		classification: draft.classification,
		severity,
		reproducible,
		affectedPaths: [],
		affectsPublishedOutputSchema: false,
		signature: draft.signature,
	});
	return {
		...draft,
		severity,
		reproducible,
		affectedPaths: [],
		affectsPublishedOutputSchema: false,
		decision: policy.decision,
		reason: policy.reason,
	};
};

const buildAutoFixProposal = async (
	item: IAutoFixQueueItem,
	options: IIncidentProposalToolOptions,
) =>
	createProposalDocument(
		{
			kind: proposalKindForIncidentClassification(item.classification),
			title: item.title,
			track: item.suggestedTrack,
			goal: `Resolve the reproducible ${item.classification} incident cluster in ${item.toolName} without changing public contracts.`,
			why: `${item.rationale} Auto-fix policy admitted this cluster because severity is ${item.severity}, reproduction evidence is present, and no public contract impact was detected during queueing.`,
			nonGoals: [
				'Do not change published outputSchema contracts, public index exports, preset catalog entries or plugin manifests.',
				'Do not widen the fix to high-severity, product or design decisions.',
			],
			globalGate: 'type',
			slices: [
				{
					sliceId: 'S1',
					title: 'reproduce and implement bounded auto-fix',
					files: ['TODO'],
					gate: 'type',
					acceptance: [
						'Reproduction is captured as a deterministic test or local check before the fix is closed.',
						'No public contract paths or published outputSchema signatures are changed.',
						item.summary,
					],
				},
			],
			extraFrontmatter: {
				auto_fix_candidate: true,
				classification: item.classification,
				incident_type: item.incidentType,
				public_contract_safe: true,
				severity: item.severity,
				signature: item.signature,
				tool_name: item.toolName,
			},
		},
		options,
	);

export function buildAutoFixQueueRegistration(
	options: IIncidentProposalToolOptions,
): IToolRegistration {
	return {
		id: 'auto_fix_queue',
		effects: ['write'],
		summary:
			'Queue reproducible low/medium incident drafts for auto-fix, and optionally write proposal documents through the existing authoring path.',
		tags: ['proposals', 'logs', 'dogfooding'],
		register: async (server) => {
			server.registerTool(
				`${options.namespacePrefix}_auto_fix_queue`,
				{
					description:
						'Separate incident proposal drafts into auto-fixable vs needs-human using the dogfooding severity/public-contract policy. Pass `write: true` to persist only the auto-fixable queue through the existing create_proposal authoring path.',
					inputSchema: AUTO_FIX_QUEUE_INPUT_SCHEMA,
					outputSchema: AUTO_FIX_QUEUE_OUTPUT_SCHEMA,
				},
				async (args: {
					write?: boolean | undefined;
					limit?: number | undefined;
				}) => {
					const { limitedIncidents, result } =
						await loadIncidentProposalDraftBatch(options, args);
					const incidentsBySignature = new Map<
						string,
						ILogIncident
					>();
					for (const incident of limitedIncidents) {
						const signature = incidentSignatureOf(incident);
						if (!incidentsBySignature.has(signature)) {
							incidentsBySignature.set(signature, incident);
						}
					}
					const queued = result.drafts.map((draft) =>
						queueItemFrom(
							draft,
							incidentsBySignature.get(draft.signature),
						),
					);
					const autoFixable = queued
						.filter((item) => item.decision === 'auto-fixable')
						.sort(compareQueueItems);
					const needsHuman = queued
						.filter((item) => item.decision === 'needs-human')
						.sort(compareQueueItems);
					if (args.write !== true) {
						return toolOk({
							autoFixable,
							needsHuman,
							deduped: result.deduped,
							totalClusters: result.totalClusters,
						});
					}
					if (autoFixable.length === 0) {
						return toolOk({
							autoFixable,
							needsHuman,
							deduped: result.deduped,
							totalClusters: result.totalClusters,
							written: 0,
							files: [],
						});
					}
					const files: string[] = [];
					let indexCount = 0;
					for (const item of autoFixable) {
						const created = await buildAutoFixProposal(
							item,
							options,
						);
						if (!created.ok) {
							return toolError(
								created.reason,
								created.nextAction,
							);
						}
						files.push(created.file);
						indexCount = created.indexCount;
					}
					return toolOk({
						autoFixable,
						needsHuman,
						deduped: result.deduped,
						totalClusters: result.totalClusters,
						written: files.length,
						files,
						indexCount,
					});
				},
			);
		},
	};
}
