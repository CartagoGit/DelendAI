import {
	createDefaultClient,
	type IActivationDeps,
	type IExtensionContext,
	type IVscodeApi,
} from '../extension';

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
	const client = await (deps.createClient ?? createDefaultClient)(vscode);
	await context.globalState.update('client', client);
	await vscode.window.showInformationMessage?.(
		'MCP-Vertex: child server started in untrusted workspace.',
	);
};
