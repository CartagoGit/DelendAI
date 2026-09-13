/**
 * Contract shapes for `./run-workspace-reconciliation`.
 */

import type { IWorkspaceReconciliationOutcome } from './plugin-contract';

/** One plugin's contributed reconciliation, and what it concluded. */
export interface IPluginReconciliationReport {
	readonly plugin: string;
	readonly outcome: IWorkspaceReconciliationOutcome;
}
