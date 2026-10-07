import type { IGhExec } from './github.interface';

export interface ITriageToolsOptions {
	readonly namespacePrefix: string;
	readonly repo: string;
	readonly exec?: IGhExec | undefined;
	/**
	 * When present and `writeProposal` is set on the call, `triage_run`
	 * materialises the drafted proposal under `ready/` with an id
	 * allocated from the shared proposals counter.
	 */
	readonly proposals?:
		| {
				readonly proposalsDirAbs: string;
				readonly counterPathAbs: string;
		  }
		| undefined;
}
