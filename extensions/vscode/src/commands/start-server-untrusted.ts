import type { ICommandQuickPickItem } from '../contracts/interfaces/command-quick-pick-item.interface';
import {
	createDefaultClient,
	resolveServerCommand,
	type IActivationDeps,
	type IExtensionContext,
	type IVscodeApi,
} from '../extension';
import {
	describeLaunch,
	isLaunchApproved,
	recordApproval,
	type IFingerprintStore,
} from './trust-fingerprint';

interface IQuickPickWindow {
	showQuickPick?(
		items: ReadonlyArray<ICommandQuickPickItem>,
		options?: {
			readonly placeHolder?: string;
			readonly detail?: string;
		},
	): Thenable<ICommandQuickPickItem | undefined>;
}

/**
 * x00072 SEC-001 S1: manual start of the stdio child in an untrusted
 * workspace. Re-runs the standard client creation with `trustOverride:
 * true` so the user can deliberately spawn the process after reading the
 * warning.
 */
export const registerStartServerUntrusted = async (
	context: IExtensionContext,
	vscode: IVscodeApi,
	deps: IActivationDeps,
): Promise<void> => {
	const launch = await resolveServerCommand(vscode);
	if (launch === undefined) {
		await vscode.window.showErrorMessage?.(
			'Configure delendai.server.command and delendai.server.args before starting the MCP server.',
		);
		return;
	}
	const store = context.globalState as unknown as IFingerprintStore;
	if (isLaunchApproved(store, launch)) {
		const client = await (
			deps.createClient ?? (() => createDefaultClient(vscode))
		)();
		await context.globalState.update('delendai.client', client);
		await deps.onClientConnected?.(client);
		return;
	}
	const detail = describeLaunch(launch);
	const pick = await (
		vscode.window as typeof vscode.window & IQuickPickWindow
	).showQuickPick?.(
		[
			{ id: 'approve', label: 'Approve & start', detail },
			{ id: 'cancel', label: 'Cancel', detail },
		],
		{
			placeHolder:
				'DelendAI: approve launching this command in an untrusted workspace?',
			detail,
		},
	);
	if (pick?.label !== 'Approve & start') return;
	const client = await (
		deps.createClient ?? (() => createDefaultClient(vscode))
	)();
	await context.globalState.update('delendai.client', client);
	await deps.onClientConnected?.(client);
	await recordApproval(store, launch);
	await vscode.window.showInformationMessage?.(
		'DelendAI: child server started in untrusted workspace.',
	);
};
