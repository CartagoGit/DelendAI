import z from 'zod';

const INCIDENT_PROPOSAL_SOURCE_CLUSTER_SCHEMA = z
	.object({
		count: z.number(),
		distinctAgents: z.number(),
		firstSeen: z.string(),
		lastSeen: z.string(),
		sampleSummary: z.string(),
		sampleError: z.string(),
		recentEventsCount: z.number(),
	})
	.strict();

const INCIDENT_PROPOSAL_DRAFT_SCHEMA = z
	.object({
		signature: z.string(),
		toolName: z.string(),
		incidentType: z.string(),
		classification: z.string(),
		title: z.string(),
		summary: z.string(),
		rationale: z.string(),
		suggestedTrack: z.string(),
		sourceCluster: INCIDENT_PROPOSAL_SOURCE_CLUSTER_SCHEMA,
	})
	.strict();

export function incidentProposalSourceClusterSchema() {
	return INCIDENT_PROPOSAL_SOURCE_CLUSTER_SCHEMA;
}

export function incidentProposalDraftSchema() {
	return INCIDENT_PROPOSAL_DRAFT_SCHEMA;
}

export function buildIncidentProposalWriteSummarySchema(shape: z.ZodRawShape) {
	return z
		.object({
			...shape,
			written: z.number().optional(),
			files: z.array(z.string()).optional(),
			indexCount: z.number().optional(),
		})
		.strict();
}
