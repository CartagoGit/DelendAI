import type { IncidentClassification } from '../constants/incident-taxonomy.constant';
import type { IIncidentProposalDraft } from './incident-proposal.interface';

export type IncidentSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface IAutoFixPolicyInput {
	readonly classification: IncidentClassification;
	readonly severity?: IncidentSeverity;
	readonly affectedPaths?: readonly string[];
	readonly affectsPublishedOutputSchema?: boolean;
	readonly reproducible?: boolean;
	readonly signature?: IIncidentProposalDraft['signature'];
}

export interface IAutoFixDecision {
	readonly decision: 'auto-fixable' | 'needs-human';
	readonly reason: string;
}
