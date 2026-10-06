import type { ILogIncident } from '@delendai/logs/public';

import type { IncidentClassification } from '../constants/incident-taxonomy.constant';

export interface IBuildIncidentProposalDraftsOptions {
	readonly classifyIncident?:
		| ((incident: ILogIncident) => IncidentClassification)
		| undefined;
}
