/**
 * states.ts — f00185 (Track D).
 *
 * The four canonical plugin states + the transition table.
 * Used by the router to filter `tools/list` and reject
 * `tools/call` for plugins that should not be reachable.
 *
 *   UNLOADED         — discovered but neither prepared nor
 *                      active.
 *   LOADED_HIDDEN    — `prepare()` ran; the plugin does NOT
 *                      appear in `tools/list`. Useful for shadow
 *                      plugins that validate manifests.
 *   ACTIVE           — `activate()` ran; capabilities granted;
 *                      reachable through `tools/list` and
 *                      `tools/call`.
 *   DENIED           — the policy denied capabilities. ABSORBENT:
 *                      requires a manual reset of the graph to
 *                      leave this state.
 *
 * Valid transitions:
 *
 *   UNLOADED      → LOADED_HIDDEN | DENIED
 *   LOADED_HIDDEN → ACTIVE | UNLOADED | DENIED
 *   ACTIVE        → UNLOADED | DENIED
 *   DENIED        → (absorbing — no outgoing edges)
 */

export type PluginState = 'UNLOADED' | 'LOADED_HIDDEN' | 'ACTIVE' | 'DENIED';

export interface ITransitionReason {
	readonly trigger:
		| 'PREPARE'
		| 'ACTIVATE'
		| 'DISPOSE'
		| 'POLICY_DENY'
		| 'MANAGER_HIDE'
		| 'MANAGER_UNLOAD'
		| 'MANAGER_ACTIVATE'
		| 'MANAGER_DENY'
		| 'BOOT_RESET';
	readonly at: number;
	readonly note?: string;
}

const VALID_TRANSITIONS: Readonly<Record<PluginState, readonly PluginState[]>> =
	{
		UNLOADED: ['LOADED_HIDDEN', 'DENIED'],
		LOADED_HIDDEN: ['ACTIVE', 'UNLOADED', 'DENIED'],
		ACTIVE: ['UNLOADED', 'DENIED'],
		DENIED: [],
	};

export const canTransition = (from: PluginState, to: PluginState): boolean =>
	VALID_TRANSITIONS[from].includes(to);

export class PluginStateError extends Error {
	constructor(
		readonly from: PluginState,
		readonly to: PluginState,
		readonly reason: ITransitionReason,
	) {
		super(
			`Plugin state transition rejected: ${from} → ${to} (trigger=${reason.trigger})`,
		);
		this.name = 'PluginStateError';
	}
}

export interface IPluginStateMachine {
	readonly current: PluginState;
	transition(to: PluginState, reason: ITransitionReason): void;
	canTransition(to: PluginState): boolean;
	onTransition(
		listener: (event: {
			readonly from: PluginState;
			readonly to: PluginState;
			readonly reason: ITransitionReason;
		}) => void,
	): () => void;
	readonly history: readonly {
		readonly from: PluginState;
		readonly to: PluginState;
		readonly reason: ITransitionReason;
	}[];
}

export const createPluginStateMachine = (
	initial: PluginState = 'UNLOADED',
): IPluginStateMachine => {
	let current = initial;
	const history: {
		from: PluginState;
		to: PluginState;
		reason: ITransitionReason;
	}[] = [];
	const listeners = new Set<
		(event: {
			readonly from: PluginState;
			readonly to: PluginState;
			readonly reason: ITransitionReason;
		}) => void
	>();
	return {
		get current() {
			return current;
		},
		get history() {
			return history.slice();
		},
		canTransition(to) {
			return canTransition(current, to);
		},
		onTransition(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		transition(to, reason) {
			if (!canTransition(current, to)) {
				throw new PluginStateError(current, to, reason);
			}
			const event = { from: current, to, reason };
			history.push(event);
			current = to;
			for (const listener of listeners) {
				listener(event);
			}
		},
	};
};
