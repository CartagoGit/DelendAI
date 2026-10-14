/**
 * run-workspace-reconciliation.ts — run the boot-time reconciliation
 * every loaded plugin contributed, before the server serves anything.
 *
 * The reconciliation itself belongs to whichever plugin owns the state:
 * core declares ports and must not import a storage engine, so wiring
 * it into the shipped CLI would put that dependency in the one place
 * that cannot have it. A project without such a plugin has nothing to
 * reconcile, which is a correct answer and not a missing feature.
 *
 * THE ORDER MATTERS AND THE FAILURE MODE MORE SO. A hook that throws is
 * reported as `not-executable` and does not abort the boot: the
 * reconciliation exists to repair a workspace, so letting a broken
 * repair stop the server would take away the only tool the operator has
 * left. A hook that reports `degraded` is likewise not fatal — but it
 * must reach the operator report rather than be printed beside it,
 * because a DEGRADED workspace announced as operational is the failure
 * this whole subsystem exists to prevent.
 */

import type {
	IMcpPlugin,
	IWorkspaceReconciliationInput,
	IWorkspaceReconciliationOutcome,
} from './plugin-contract';

import type { IPluginReconciliationReport } from './run-workspace-reconciliation.interface';

export type { IPluginReconciliationReport } from './run-workspace-reconciliation.interface';

/**
 * Runs every contributed hook in the order the plugins loaded.
 *
 * Sequential on purpose: two reconcilers touching the same workspace
 * concurrently is exactly the race each of them is trying to resolve.
 */
export const runWorkspaceReconciliation = async (
	plugins: readonly IMcpPlugin[],
	input: IWorkspaceReconciliationInput,
): Promise<readonly IPluginReconciliationReport[]> => {
	const reports: IPluginReconciliationReport[] = [];
	for (const plugin of plugins) {
		const hook = plugin.reconcileWorkspace;
		if (hook === undefined) continue;
		try {
			const outcome = await hook(input);
			reports.push({ plugin: plugin.name, outcome });
		} catch (error) {
			reports.push({
				plugin: plugin.name,
				outcome: {
					status: 'not-executable',
					summary: `reconciliation threw: ${
						error instanceof Error ? error.message : String(error)
					}`,
				},
			});
		}
	}
	return reports;
};

/** True when any contributed reconciliation could not certify the workspace. */
export const isWorkspaceDegraded = (
	reports: readonly IPluginReconciliationReport[],
): boolean => reports.some((report) => report.outcome.status !== 'reconciled');

/** Renders the reports as the stderr block printed before going live. */
export const renderReconciliationReports = (
	reports: readonly IPluginReconciliationReport[],
): string =>
	reports
		.flatMap((report) => [
			`[delendai] reconcile(${report.plugin}): ${report.outcome.status} — ${report.outcome.summary}`,
			...(report.outcome.details ?? []).map(
				(line) => `[delendai]   ${line}`,
			),
		])
		.join('\n');

export type { IWorkspaceReconciliationOutcome };
