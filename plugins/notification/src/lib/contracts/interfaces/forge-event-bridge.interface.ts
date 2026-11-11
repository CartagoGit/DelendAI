/**
 * forge-event-bridge.interface.ts — what the bridge reads of a forge event
 * and what it tells a session. The event's full shape is the forge plugin's
 * port; the bridge reads these fields of the stored JSON and nothing else.
 */

/** The fields of a stored forge event the bridge reads. */
export interface IForgeEventView {
	readonly kind: string;
	readonly repository: string;
	readonly number?: number | undefined;
	readonly change?: string | undefined;
	readonly label?: string | undefined;
	readonly check?: string | undefined;
	readonly conclusion?: string | undefined;
	readonly review?: string | undefined;
	readonly comment?: string | undefined;
}

/** What a subscribed session is told. */
export interface IForgeNotice {
	readonly agent: string;
	readonly repository: string;
	readonly number: number;
	readonly kind: string;
	/** One sentence: merged, a check failed and which, land's reason. */
	readonly outcome: string;
	readonly at: number;
}

/** Watch a directory; calls back with a file name, or none to rescan. */
export type IForgeEventWatch = (
	dir: string,
	onChange: (name: string | undefined) => void,
) => () => void;

export interface IForgeEventBridgeInput {
	/** The workspace's shared forge events store. */
	readonly dir: string;
	readonly watch?: IForgeEventWatch | undefined;
	/** Tell the session; the MCP notification. */
	readonly notify: (notice: IForgeNotice) => void;
}

/** A running bridge. */
export interface IForgeEventBridge {
	/** Mark `agent` as served by this session, and replay what it missed. */
	readonly bind: (agent: string) => Promise<void>;
	/** The notices queued for `agent`, or the next ones; `[]` on timeout. */
	readonly next: (
		agent: string,
		timeoutMs: number,
		signal?: AbortSignal,
	) => Promise<readonly IForgeNotice[]>;
	/** Handle one file now; the watcher calls this. */
	readonly handle: (name: string | undefined) => Promise<void>;
	readonly stop: () => void;
}

/** Options of the forge event tools. */
export interface IForgeEventToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRootAbs: string;
	/** The workspace's cache directory, relative to its root. */
	readonly cacheDir: string;
	/** Whether the project opted into forge events; off, nothing arrives. */
	readonly enabled: boolean;
	readonly watch?: IForgeEventWatch | undefined;
}
