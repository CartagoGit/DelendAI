/**
 * Contract shapes for `./host-supervisor`.
 */

/** One running server process, as the supervisor talks to it. */
export interface ISupervisedChild {
	/** Writes one JSON-RPC message (without its newline) to the child. */
	readonly send: (line: string) => void;
	/** Every message line the child writes to its stdout. */
	readonly onLine: (listener: (line: string) => void) => void;
	/** The child exited, on its own or because it was stopped. */
	readonly onExit: (listener: (code: number | null) => void) => void;
	readonly stop: () => void;
}

export interface IHostSupervisorDeps {
	/** Starts a fresh server process running the checkout's current code. */
	readonly spawn: () => ISupervisedChild;
	/** Writes one message line to the host (the supervisor's stdout). */
	readonly toHost: (line: string) => void;
	/** Tells the operator what happened (the supervisor's stderr). */
	readonly log: (line: string) => void;
	/** How long a new server may take to answer `initialize`. */
	readonly bootTimeoutMs?: number;
	readonly setTimer?: (run: () => void, ms: number) => { cancel: () => void };
}

/** Why a restart did or did not happen. */
export type IRestartOutcome =
	| { readonly restarted: true }
	| {
			readonly restarted: false;
			readonly reason:
				| 'not-connected'
				| 'already-restarting'
				| 'did-not-start';
	  };
