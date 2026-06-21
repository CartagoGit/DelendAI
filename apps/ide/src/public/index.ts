/**
 * Public surface of `apps/ide/`. Re-exports the `IHostAdapter` types so
 * downstream packages can `import type { IHostAdapter } from
 * '@mcp-vertex/ide/public'` without dragging in the test helpers.
 */
export type {
	ICommandCallback,
	IConfigurationChangeEvent,
	IDisposable,
	IHostAdapter,
	IHostAlignment,
	IQuickPickItem,
	IStatusBarItem,
	ITreeDataProvider,
	ITreeNode,
	IWebviewOptions,
	IWebviewPanel,
	IWebviewViewProvider,
} from '../host-adapter.types';
