import type { ICommandDeps } from './types';

export const REFRESH_COMMAND = 'delendai.refresh';

/**
 * Optional dashboard refreshers. The host wires them when the
 * dashboard / KPI panels are registered so a single "refresh"
 * command repaints every visible surface without the user having
 * to reopen each one.
 */
export interface IRefreshExtras {
	readonly memoryTree?: { refresh(): void };
	readonly dashboard?: { refresh(): Promise<void> | void };
	readonly kpiDashboard?: { refresh(): Promise<void> | void };
	readonly providerActions?: { refresh(): Promise<void> | void };
}

export const registerRefreshCommand = (deps: ICommandDeps & IRefreshExtras) =>
	deps.vscode.commands.registerCommand(REFRESH_COMMAND, async () => {
		deps.toolTree?.refresh();
		// f00097 S4: a global refresh also invalidates the proposals board
		// snapshot so the sidebar reflects the latest state.
		deps.proposalsTree?.refresh();
		deps.memoryTree?.refresh();
		await Promise.resolve(deps.dashboard?.refresh()).catch(() => undefined);
		// Dashboard panels have their own refresh methods; awaiting
		// them keeps the toast accurate (the user only sees the
		// confirmation after every surface finished repainting).
		await Promise.all([
			Promise.resolve(deps.kpiDashboard?.refresh()).catch(
				() => undefined,
			),
			Promise.resolve(deps.providerActions?.refresh()).catch(
				() => undefined,
			),
		]);
		await deps.vscode.window.showInformationMessage?.('delendai refreshed');
	});
