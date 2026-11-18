import type { IncidentClassification } from '../constants/incident-taxonomy.constant';

export interface IIncidentProposalSourceCluster {
	readonly count: number;
	readonly distinctAgents: number;
	readonly firstSeen: string;
	readonly lastSeen: string;
	readonly sampleSummary: string;
	readonly sampleError: string;
	readonly recentEventsCount: number;
}

export interface IIncidentProposalDraft {
	readonly signature: string;
	readonly toolName: string;
	readonly incidentType: string;
	readonly classification: IncidentClassification;
	readonly title: string;
	readonly summary: string;
	readonly rationale: string;
	readonly suggestedTrack: string;
	readonly sourceCluster: IIncidentProposalSourceCluster;
}

export interface IIncidentProposalResult {
	readonly drafts: readonly IIncidentProposalDraft[];
	readonly deduped: number;
	readonly totalClusters: number;
}
