/**
 * fake-tool-server.interface.ts — the contract behind
 * `createFakeToolServer` (see `../../lib/fake-tool-server.ts`).
 */

/** One captured `server.registerTool(name, config, handler)` call. */
export interface IFakeRegisteredTool {
	readonly name: string;
	readonly config: unknown;
	readonly handler: (args: unknown) => unknown;
}

/** One captured `server.sendLoggingMessage(message)` call. */
export interface IFakeLoggingMessage {
	readonly level: string;
	readonly logger?: string | undefined;
	readonly data: unknown;
}

/**
 * Hooks a test wires up to observe calls the code under test makes
 * against the fake `McpServer`. Each hook is strongly typed against a
 * plain, hand-authored shape — not the SDK's generic method signatures
 * (see the module doc in `fake-tool-server.ts` for why that distinction
 * is load-bearing).
 */
export interface IFakeToolServerOverrides {
	readonly onRegisterTool?: (call: IFakeRegisteredTool) => void;
	readonly onSendLoggingMessage?: (
		message: IFakeLoggingMessage,
	) => void | Promise<void>;
}
