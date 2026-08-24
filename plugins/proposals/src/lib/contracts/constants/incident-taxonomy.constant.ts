import { ISSUE_CLASSIFICATIONS } from '@mcp-vertex/error-reporting/public';

export const INCIDENT_CLASSIFICATIONS = [...ISSUE_CLASSIFICATIONS] as const;

export type IncidentClassification = (typeof INCIDENT_CLASSIFICATIONS)[number];

export const INCIDENT_TRACK_BY_CLASSIFICATION = {
	BUG: 'fix',
	REGRESSION: 'fix',
	SECURITY: 'security',
	PRIVACY: 'privacy',
	PERFORMANCE: 'perf',
	TOKEN_REGRESSION: 'tokens',
	DOC_DRIFT: 'docs',
	CONFIG_DRIFT: 'infra',
	DUPLICATE: 'chore',
	NOT_A_BUG: 'chore',
	DESIGN_DECISION: 'design',
	PRODUCT_DECISION: 'product',
	NEEDS_REPRODUCTION: 'spike',
	UNKNOWN: 'spike',
} as const satisfies Record<IncidentClassification, string>;
