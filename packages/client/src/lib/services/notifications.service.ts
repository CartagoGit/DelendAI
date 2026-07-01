import type { McpStdioClient } from '../transport/mcp-stdio-client';
import { formatToolName } from './_namespace';

export interface INotificationStatus {
	readonly watching: string;
	readonly emitted: number;
	readonly lastReleases: readonly ILockReleasedEvent[];
	readonly agentEvents: number;
}

export interface IAwaitLockResult {
	readonly taskId: string;
	readonly released: boolean;
	readonly timedOut: boolean;
	readonly alreadyFree: boolean;
	readonly waitedMs: number;
}

export interface IAwaitLockOptions {
	readonly taskId: string;
	readonly timeoutMs?: number;
}

export type INotificationEventName = 'lock-released' | 'cap' | 'bloqueado';

export interface ILockReleasedEvent {
	readonly type: 'lock-released';
	readonly taskId: string;
	readonly agent: string;
	readonly files: readonly string[];
}

export interface ICapNotificationEvent {
	readonly type: 'cap';
	readonly message: string;
}

export interface IBloqueadoNotificationEvent {
	readonly type: 'bloqueado';
	readonly message: string;
}

export type IStatusNotificationEvent =
	| ICapNotificationEvent
	| IBloqueadoNotificationEvent;
export type INotificationEvent = ILockReleasedEvent | IStatusNotificationEvent;
export type INotificationListener<TEvent extends INotificationEvent> = (
	event: TEvent,
) => void | Promise<void>;

interface IListenerState {
	readonly callback: INotificationListener<INotificationEvent>;
	busy: boolean;
}

export class NotificationsService {
	private readonly listeners = new Map<
		INotificationEventName,
		Set<IListenerState>
	>();

	private readonly namespacePrefix: string | undefined;

	constructor(
		private readonly client: McpStdioClient,
		namespacePrefix?: string,
	) {
		this.namespacePrefix = namespacePrefix;
	}

	addEventListener<TName extends INotificationEventName>(
		type: TName,
		callback: INotificationListener<
			Extract<INotificationEvent, { type: TName }>
		>,
	): void {
		const bucket = this.listeners.get(type) ?? new Set<IListenerState>();
		bucket.add({
			callback: callback as INotificationListener<INotificationEvent>,
			busy: false,
		});
		this.listeners.set(type, bucket);
	}

	removeEventListener<TName extends INotificationEventName>(
		type: TName,
		callback: INotificationListener<
			Extract<INotificationEvent, { type: TName }>
		>,
	): void {
		const bucket = this.listeners.get(type);
		if (bucket === undefined) return;
		for (const state of bucket) {
			if (state.callback === callback) {
				bucket.delete(state);
			}
		}
	}

	async status(): Promise<INotificationStatus> {
		const output = await this.client.request<
			Record<string, never>,
			Omit<INotificationStatus, 'lastReleases'> & {
				readonly lastReleases: ReadonlyArray<{
					readonly taskId: string;
					readonly agent: string;
					readonly files: readonly string[];
				}>;
			}
		>(
			formatToolName(this.namespacePrefix, 'notification_notify_status'),
			{},
		);
		const status = {
			...output,
			lastReleases: output.lastReleases.map((event) => ({
				type: 'lock-released' as const,
				...event,
			})),
		};
		for (const event of status.lastReleases) {
			this.dispatch(event);
		}
		return status;
	}

	async awaitLock(options: IAwaitLockOptions): Promise<IAwaitLockResult> {
		const output = await this.client.request<
			IAwaitLockOptions,
			IAwaitLockResult
		>(
			formatToolName(this.namespacePrefix, 'notification_await_lock'),
			options,
		);
		if (output.released || output.alreadyFree) {
			this.dispatch({
				type: 'lock-released',
				taskId: output.taskId,
				agent: '',
				files: [],
			});
		}
		return output;
	}

	emitStatus(type: 'cap' | 'bloqueado', message: string): void {
		this.dispatch({ type, message });
	}

	private dispatch(event: INotificationEvent): void {
		const bucket = this.listeners.get(event.type);
		if (bucket === undefined) return;
		for (const state of bucket) {
			if (state.busy) continue;
			state.busy = true;
			void Promise.resolve(state.callback(event)).finally(() => {
				state.busy = false;
			});
		}
	}
}
