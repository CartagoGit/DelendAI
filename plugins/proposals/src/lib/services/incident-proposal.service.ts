import { createHash } from 'node:crypto';

import {
	classificationFromEvidence,
	type SafeFailureClass,
} from '@mcp-vertex/error-reporting/public';
import type { ILogIncident } from '@mcp-vertex/logs/public';

import {
	INCIDENT_TRACK_BY_CLASSIFICATION,
	type IncidentClassification,
} from '../contracts/constants/incident-taxonomy.constant';
import type { IBuildIncidentProposalDraftsOptions } from '../contracts/interfaces/incident-proposal-build-options.interface';
import type {
	IIncidentProposalDraft,
	IIncidentProposalResult,
} from '../contracts/interfaces/incident-proposal.interface';

const MAX_HEADLINE_CHARS = 96;
const MAX_ERROR_CHARS = 180;
const INCIDENT_SIGNATURE_HASH_LENGTH = 16;

const collapseWhitespace = (value: string): string =>
	value.replace(/\s+/g, ' ').trim();

const truncate = (value: string, max: number): string =>
	value.length > max ? `${value.slice(0, max - 1)}…` : value;

const incidentHaystackOf = (incident: ILogIncident): string =>
	[
		incident.incidentType,
		incident.toolName,
		incident.sampleSummary,
		incident.sampleError,
	]
		.map((value) => collapseWhitespace(value))
		.filter((value) => value.length > 0)
		.join(' ')
		.toUpperCase();

const failureClassOf = (incident: ILogIncident): SafeFailureClass => {
	const haystack = incidentHaystackOf(incident);
	if (haystack.includes('TIMEOUT') || haystack.includes('LATENCY')) {
		return 'INTERNAL_TIMEOUT';
	}
	if (haystack.includes('VALID')) return 'INTERNAL_VALIDATION_ERROR';
	if (haystack.includes('TYPEERROR') || haystack.includes('REFERENCEERROR')) {
		return 'INTERNAL_RUNTIME_ERROR';
	}
	return 'UNKNOWN_INTERNAL';
};

export function incidentSignatureOf(incident: ILogIncident): string {
	return `${collapseWhitespace(incident.toolName).toLowerCase()}:${createHash(
		'sha1',
	)
		.update(collapseWhitespace(incident.sampleError))
		.digest('hex')
		.slice(0, INCIDENT_SIGNATURE_HASH_LENGTH)}`;
}

export function draftTitleDedupKeyOf(title: string): string {
	return `title:${collapseWhitespace(title).toLowerCase()}`;
}

export function normalizeIncidentDedupKey(value: string): string {
	return collapseWhitespace(value).toLowerCase();
}

export function classifyIncidentProposal(
	incident: ILogIncident,
): IncidentClassification {
	const haystack = incidentHaystackOf(incident);
	if (haystack.length === 0 || haystack === 'UNKNOWN') return 'UNKNOWN';
	if (haystack.includes('DUPLICATE')) return 'DUPLICATE';
	if (haystack.includes('DESIGN')) return 'DESIGN_DECISION';
	if (haystack.includes('PRODUCT')) return 'PRODUCT_DECISION';
	if (haystack.includes('REPRO')) return 'NEEDS_REPRODUCTION';
	if (
		haystack.includes('TIMEOUT') ||
		haystack.includes('LATENCY') ||
		haystack.includes('PERF')
	) {
		return 'PERFORMANCE';
	}
	return classificationFromEvidence({
		toolId: incident.toolName,
		packageId: incident.incidentType,
		componentId: `${incident.sampleSummary} ${incident.sampleError}`,
		failureClass: failureClassOf(incident),
	});
}

const headlineOf = (incident: ILogIncident): string => {
	const seed = collapseWhitespace(
		incident.sampleError || incident.sampleSummary || incident.incidentType,
	);
	return truncate(
		seed.length > 0 ? seed : 'clustered internal incident',
		MAX_HEADLINE_CHARS,
	);
};

const buildDraft = (
	incident: ILogIncident,
	classification: IncidentClassification,
): IIncidentProposalDraft => {
	const title = `${incident.toolName}: ${headlineOf(incident)}`;
	const sampleError = truncate(
		collapseWhitespace(incident.sampleError),
		MAX_ERROR_CHARS,
	);
	return {
		signature: incidentSignatureOf(incident),
		toolName: incident.toolName,
		incidentType: incident.incidentType,
		classification,
		title,
		summary: `Clustered ${incident.count} failing events for ${incident.toolName}; sample error: ${sampleError}`,
		rationale: `Redacted cluster observed ${incident.count} times across ${incident.distinctAgents} agent(s) from ${incident.firstSeen} to ${incident.lastSeen}. Classification ${classification} is derived only from incidentType, summary and redacted error text.`,
		suggestedTrack: INCIDENT_TRACK_BY_CLASSIFICATION[classification],
		sourceCluster: {
			count: incident.count,
			distinctAgents: incident.distinctAgents,
			firstSeen: incident.firstSeen,
			lastSeen: incident.lastSeen,
			sampleSummary: incident.sampleSummary,
			sampleError: incident.sampleError,
			recentEventsCount: incident.recentEvents.length,
		},
	};
};

export function buildIncidentProposalDrafts(
	incidents: readonly ILogIncident[],
	existingSignatures: ReadonlySet<string>,
	options: IBuildIncidentProposalDraftsOptions = {},
): IIncidentProposalResult {
	const drafts: IIncidentProposalDraft[] = [];
	const seen = new Set(
		[...existingSignatures].map((entry) =>
			normalizeIncidentDedupKey(entry),
		),
	);
	let deduped = 0;
	for (const incident of incidents) {
		const classification =
			options.classifyIncident?.(incident) ??
			classifyIncidentProposal(incident);
		const draft = buildDraft(incident, classification);
		const signatureKey = normalizeIncidentDedupKey(draft.signature);
		const titleKey = draftTitleDedupKeyOf(draft.title);
		if (seen.has(signatureKey) || seen.has(titleKey)) {
			deduped += 1;
			continue;
		}
		seen.add(signatureKey);
		seen.add(titleKey);
		drafts.push(draft);
	}
	return {
		drafts,
		deduped,
		totalClusters: incidents.length,
	};
}
