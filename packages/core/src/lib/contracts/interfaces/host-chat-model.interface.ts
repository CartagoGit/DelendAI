/**
 * host-chat-model.interface.ts — a model the editor recorded serving a chat request.
 */

export interface IHostChatModel {
	/** As the editor records it: `<vendor>/<id>`, e.g. `minimax/MiniMax-M3.1-Flash-Preview`. */
	readonly model: string;
	/** When the session last changed, as an ISO 8601 timestamp. */
	readonly at: string;
	/** The editor user directory the session was read from. */
	readonly host: string;
}

/** How a model spelling reads, to match it with the model it names. */
export interface IModelSpelling {
	/** The first word: `minimax`, `claude`, `gpt`. */
	readonly brand: string;
	/** Every digit of its version, in order: `m3.1` and `31` are both `31`. */
	readonly digits: string;
	/** Its other words: `flash`, `preview`, `opus`. */
	readonly words: readonly string[];
}
