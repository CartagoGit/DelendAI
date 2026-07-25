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
import type { ICommandQuickPickItem } from '../contracts/interfaces/command-quick-pick-item.interface';

interface IQuickPickWindow {
	showQuickPick?(
		items: ReadonlyArray<ICommandQuickPickItem>,
		options?: {
			readonly placeHolder?: string;
			readonly detail?: string;
		},
	): Thenable<ICommandQuickPickItem | undefined>;
}

const readMcpJsonRaw = async (
	vscode: IVscodeApi,
	cwd: string | undefined,
): Promise<string | undefined> => {
	void vscode;
	if (cwd === undefined) return undefined;
	const { readFileSync } = await import('node:fs');
	const { join } = await import('node:path');
	try {
		return readFileSync(join(cwd, '.mcp.json'), 'utf8');
	} catch {
		return undefined;
	}
};

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
	const store = context.globalState as unknown as IFingerprintStore;
	const mcpJsonRaw = await readMcpJsonRaw(vscode, launch.cwd);
	if (isLaunchApproved(store, launch, mcpJsonRaw)) {
		const client = await (
			deps.createClient ?? (() => createDefaultClient(vscode))
		)();
		await context.globalState.update('client', client);
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
				'MCP-Vertex: approve launching this command in an untrusted workspace?',
			detail,
		},
	);
	if (!pick || pick.label !== 'Approve & start') return;
	const client = await (
		deps.createClient ?? (() => createDefaultClient(vscode))
	)();
	await context.globalState.update('client', client);
	await recordApproval(store, launch, mcpJsonRaw);
	await vscode.window.showInformationMessage?.(
		'MCP-Vertex: child server started in untrusted workspace.',
	);
};
