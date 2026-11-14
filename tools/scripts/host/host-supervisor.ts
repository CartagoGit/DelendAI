/**
 * host-supervisor.ts — the server the host talks to restarts onto the
 * checkout's current code without the host noticing (x00756).
 *
 * A host starts delendai once per session, and the checkout moves on as
 * pull requests merge. A server that kept running older code said so
 * (x00701), stopped pushing work refs (x00709), and waited for a person
 * to restart it — every time the integration branch moved, in every
 * session, on every machine.
 *
 * The host now talks to a supervisor that relays its messages to the real
 * server, a child process. When the child's code is behind the checkout,
 * the supervisor starts a new child, replays the host's `initialize` to
 * it, and switches over once the old child has no request in flight. The
 * host keeps its connection; it is told the tool, prompt and resource
 * lists changed. A new child that does not start keeps the old one
 * running. A child that dies is replaced the same way, and the requests
 * it held are answered with an error rather than left hanging.
 *
 * MCP's stdio transport is one JSON-RPC message per line.
 */
import type {
	IHostSupervisorDeps,
	IRestartOutcome,
	ISupervisedChild,
} from './host-supervisor.interface';

/** A new server needs this long, at most, to answer `initialize`. */
const DEFAULT_BOOT_TIMEOUT_MS = 120_000;

/** JSON-RPC: the server could not handle the request. */
const SERVER_ERROR = -32000;

type IMessage = {
	readonly id?: string | number;
	readonly method?: string;
	readonly result?: {
		readonly capabilities?: Record<string, { listChanged?: boolean }>;
	};
};

const parse = (line: string): IMessage | undefined => {
	try {
		const value: unknown = JSON.parse(line);
		return typeof value === 'object' && value !== null
			? (value as IMessage)
			: undefined;
	} catch {
		return undefined;
	}
};

const idKey = (id: string | number): string => `${typeof id}:${String(id)}`;

const defaultTimer = (run: () => void, ms: number): { cancel: () => void } => {
	const handle = setTimeout(run, ms);
	return { cancel: () => clearTimeout(handle) };
};

export interface IHostSupervisor {
	/** A message line from the host. */
	readonly fromHost: (line: string) => void;
	/** Moves onto a fresh server once the current one is idle. */
	readonly restart: () => Promise<IRestartOutcome>;
	readonly stop: () => void;
}

export const createHostSupervisor = (
	deps: IHostSupervisorDeps,
): IHostSupervisor => {
	const setTimer = deps.setTimer ?? defaultTimer;
	const bootTimeoutMs = deps.bootTimeoutMs ?? DEFAULT_BOOT_TIMEOUT_MS;
	let initialize: string | undefined;
	let initialized: string | undefined;
	let restarting = false;
	let stopped = false;
	let replay = 0;
	/** Host requests the current child has not answered. */
	const fromHostPending = new Map<string, string | number>();
	/** Child requests the host has not answered. */
	let fromChildPending = 0;
	/** Host messages held while the switch waits for the old child. */
	const held: string[] = [];
	let holding = false;
	let idleWaiter: (() => void) | undefined;

	const settleIfIdle = (): void => {
		if (fromHostPending.size === 0 && fromChildPending === 0) {
			const waiter = idleWaiter;
			idleWaiter = undefined;
			waiter?.();
		}
	};

	let child: ISupervisedChild;

	const attach = (next: ISupervisedChild): void => {
		next.onLine((line) => {
			if (next !== child) return;
			const message = parse(line);
			if (message?.id !== undefined) {
				if (message.method === undefined) {
					fromHostPending.delete(idKey(message.id));
				} else {
					fromChildPending += 1;
				}
			}
			deps.toHost(line);
			settleIfIdle();
		});
		next.onExit((code) => {
			if (next !== child || stopped) return;
			deps.log(
				`[delendai] the server exited (code ${String(code)}); starting it again.`,
			);
			// Nobody will answer what the dead child held.
			for (const id of fromHostPending.values()) {
				deps.toHost(
					JSON.stringify({
						jsonrpc: '2.0',
						id,
						error: {
							code: SERVER_ERROR,
							message:
								'The delendai server stopped while handling this request; it has been started again. Retry the call.',
						},
					}),
				);
			}
			fromHostPending.clear();
			fromChildPending = 0;
			settleIfIdle();
			void restartNow();
		});
	};

	child = deps.spawn();
	attach(child);

	const deliver = (line: string): void => {
		const message = parse(line);
		if (message?.method === 'initialize') initialize = line;
		if (message?.method === 'notifications/initialized') initialized = line;
		if (message?.id !== undefined) {
			if (message.method !== undefined) {
				fromHostPending.set(idKey(message.id), message.id);
			} else if (fromChildPending > 0) {
				fromChildPending -= 1;
			}
		}
		child.send(line);
	};

	/** Starts a child and brings it to the handshake the host already did. */
	const boot = (): Promise<
		| { readonly child: ISupervisedChild; readonly listChanged: string[] }
		| undefined
	> =>
		new Promise((resolve) => {
			if (initialize === undefined) {
				resolve(undefined);
				return;
			}
			replay += 1;
			const replayId = `delendai-supervisor-initialize-${String(replay)}`;
			const request = { ...JSON.parse(initialize), id: replayId };
			const next = deps.spawn();
			let done = false;
			const timer = setTimer(() => {
				if (done) return;
				done = true;
				next.stop();
				resolve(undefined);
			}, bootTimeoutMs);
			next.onExit(() => {
				if (done) return;
				done = true;
				timer.cancel();
				resolve(undefined);
			});
			next.onLine((line) => {
				if (done) return;
				const message = parse(line);
				if (message?.id !== replayId) return;
				done = true;
				timer.cancel();
				if (initialized !== undefined) next.send(initialized);
				const capabilities = message.result?.capabilities ?? {};
				resolve({
					child: next,
					listChanged: ['tools', 'prompts', 'resources'].filter(
						(kind) => capabilities[kind]?.listChanged === true,
					),
				});
			});
			next.send(JSON.stringify(request));
		});

	/** Routes to the new child and tells the host its lists changed. */
	const switchTo = (started: {
		readonly child: ISupervisedChild;
		readonly listChanged: readonly string[];
	}): void => {
		const previous = child;
		child = started.child;
		attach(started.child);
		previous.stop();
		for (const kind of started.listChanged) {
			deps.toHost(
				JSON.stringify({
					jsonrpc: '2.0',
					method: `notifications/${kind}/list_changed`,
				}),
			);
		}
	};

	/** After a crash: nothing is in flight, so switch as soon as it starts. */
	const restartNow = async (): Promise<void> => {
		if (stopped) return;
		if (initialize === undefined) {
			// No host has connected yet: a plain replacement is enough.
			child = deps.spawn();
			attach(child);
			return;
		}
		holding = true;
		try {
			const started = await boot();
			if (started === undefined) {
				deps.log(
					'[delendai] the server did not start again; the next message retries.',
				);
				child = deps.spawn();
				attach(child);
				return;
			}
			switchTo(started);
		} finally {
			holding = false;
			for (const line of held.splice(0)) deliver(line);
		}
	};

	return {
		fromHost: (line) => {
			if (holding) {
				held.push(line);
				return;
			}
			deliver(line);
		},
		restart: async () => {
			if (initialize === undefined) {
				return { restarted: false, reason: 'not-connected' };
			}
			if (restarting) {
				return { restarted: false, reason: 'already-restarting' };
			}
			restarting = true;
			try {
				// The new child boots while the old one keeps serving.
				const started = await boot();
				if (started === undefined) {
					deps.log(
						'[delendai] the new server did not start; the current one keeps running and the next check tries again.',
					);
					return { restarted: false, reason: 'did-not-start' };
				}
				// Only the switch waits: new requests are held until the old
				// child has answered what it holds.
				holding = true;
				await new Promise<void>((resolve) => {
					idleWaiter = resolve;
					settleIfIdle();
				});
				switchTo(started);
				return { restarted: true };
			} finally {
				holding = false;
				restarting = false;
				for (const line of held.splice(0)) deliver(line);
			}
		},
		stop: () => {
			stopped = true;
			child.stop();
		},
	};
};
