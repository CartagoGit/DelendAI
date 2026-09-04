import type {
	ILogIncidentsOptions,
	ILogIncident,
} from '@delendai/logs/public';

import type { IHostPathLayout } from './swarm-path-layout.interface';

export interface IIncidentProposalLogReadResult {
	readonly incidents: readonly ILogIncident[];
	readonly totalIncidents: number;
}

export interface IIncidentProposalToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRoot: string;
	readonly proposalsDirAbs: string;
	readonly indexPathAbs: string;
	readonly counterPathAbs: string;
	readonly layout?: Pick<
		IHostPathLayout,
		'proposalsDir' | 'proposalIndexFile'
	>;
	readonly extraFolders?: readonly string[];
	readonly logsDirAbs?: string;
	readonly readIncidents?:
		| ((
				options: ILogIncidentsOptions,
		  ) => Promise<IIncidentProposalLogReadResult>)
		| undefined;
}
