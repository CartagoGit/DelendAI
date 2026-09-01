import type { ILogIncident } from '@mcp-vertex/logs/public';

import type { IncidentClassification } from '../constants/incident-taxonomy.constant';

export interface IBuildIncidentProposalDraftsOptions {
	readonly classifyIncident?:
		| ((incident: ILogIncident) => IncidentClassification)
		| undefined;
}
