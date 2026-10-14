import type { IJsonRpcMessage } from '../../subprocess/server-registry';

/** What opening an MCP session with a booted server needs. */
export interface IHandshakeInput {
	/** The request id of `initialize`. */
	readonly id: number;
	readonly server: string;
	readonly send: (message: IJsonRpcMessage) => void;
	readonly waiters: Map<number | string, (message: IJsonRpcMessage) => void>;
	/** Told at once when the server answers: `undefined`, or why it failed. */
	readonly onSettled: (failure: string | undefined) => void;
}
