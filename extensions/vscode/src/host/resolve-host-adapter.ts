import type { IHostAdapter } from '@delendai/ui-extension/public';

import type { IVscodeApi } from '../extension';
import { createFakeHostFromVscode } from './stub-host-adapter';

/** Loads the adapter over the real editor API. */
type IHostAdapterLoader = () => Promise<IHostAdapter>;

const loadVscodeHostAdapter: IHostAdapterLoader = async () => {
	const { createVscodeHostAdapter } = await import('./vscode-host-adapter');
	return createVscodeHostAdapter();
};

/**
 * The host the extension's surfaces register on, or nothing when the
 * real one cannot be loaded.
 *
 * An injected API (a test, or a port to another editor) gets the minimal
 * adapter written for it. The real editor never does: that adapter's
 * operations throw or do nothing, and going on with it left a dashboard
 * that looked alive and answered nothing. The failure is shown instead,
 * and the caller registers no surface.
 */
export const resolveHostAdapter = async (
	vscode: IVscodeApi,
	injectedVscode: IVscodeApi | undefined,
	load: IHostAdapterLoader = loadVscodeHostAdapter,
): Promise<IHostAdapter | undefined> => {
	if (injectedVscode !== undefined) {
		return createFakeHostFromVscode(injectedVscode);
	}
	try {
		return await load();
	} catch (error) {
		void vscode.window.showErrorMessage?.(
			`DelendAI could not start its panels: the host adapter failed to load (${error instanceof Error ? error.message : String(error)}). Reload the window; if it persists, reinstall the extension.`,
		);
		return undefined;
	}
};
