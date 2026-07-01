import type { ILogStore } from './log-store';
import { normalizeEvent, type LogEventKind } from './normalize-event';

export type LogBusEventKind =
	| 'agent-alive'
	| 'agent-idle'
	| 'agent-dead'
	| 'lock-claimed'
	| 'lock-released'
	| 'stuck-detected';

export interface ILogEventBus {
	on(event: LogBusEventKind, listener: (payload: unknown) => void): void;
	off?(event: LogBusEventKind, listener: (payload: unknown) => void): void;
}

export interface ILogBusSubscription {
	close(): void;
}

const KIND_MAP: Readonly<Record<LogBusEventKind, LogEventKind>> = {
	'agent-alive': 'agent-alive',
	'agent-idle': 'agent-idle',
	'agent-dead': 'agent-dead',
	'lock-claimed': 'lock-claimed',
	'lock-released': 'lock-released',
	'stuck-detected': 'proposal-stale-detected',
};

export const subscribeToBus = (
	bus: ILogEventBus,
	store: Pick<ILogStore, 'appendEvent'>,
): ILogBusSubscription => {
	const listeners = new Map<LogBusEventKind, (payload: unknown) => void>();
	for (const event of Object.keys(KIND_MAP) as LogBusEventKind[]) {
		const listener = (payload: unknown): void => {
			void store.appendEvent(normalizeEvent(KIND_MAP[event], payload));
		};
		listeners.set(event, listener);
		bus.on(event, listener);
	}
	return {
		close() {
			if (!bus.off) return;
			for (const [event, listener] of listeners) {
				bus.off(event, listener);
			}
		},
	};
};
