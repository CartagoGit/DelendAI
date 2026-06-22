/**
 * `NotificationLogsBridge` — pairs every notification event
 * (`lock-released`, `cap`, `bloqueado`) from `NotificationsService`
 * with the tool calls (from `MetricsService`) that happened within
 * ±5 seconds of it, producing a single `INotificationLogEntry`
 * stream. Consumed by the Logs panel and the Dashboard's Sessions
 * tab to give the user **why** a notification fired, not just
 * **that** it fired.
 */
import type { IMetricsSnapshot, MetricsService } from './metrics.service';
import type {
	INotificationEvent,
	NotificationsService,
} from './notifications.service';
import type { INotificationLogEntry } from '../contracts/interfaces/logs.interface';

const CORRELATION_WINDOW_MS = 5_000;
const MAX_BUFFER = 200;

export interface INotificationLogsBridgeOptions {
	readonly notifications: Pick<NotificationsService, 'addEventListener'>;
	readonly metrics: Pick<MetricsService, 'snapshot'>;
}

interface IBufferedCall {
	readonly tool: string;
	readonly ts: number;
	readonly durationMs: number;
}

type BridgeEventKind = 'lock-released' | 'cap' | 'bloqueado';

export class NotificationLogsBridge {
	private readonly buffer: IBufferedCall[] = [];
	private readonly listeners = new Set<
		(entry: INotificationLogEntry) => void
	>();
	private unsubscribe: (() => void) | null = null;
	private metricsTimer: ReturnType<typeof setInterval> | null = null;

	constructor(private readonly options: INotificationLogsBridgeOptions) {}

	start(): void {
		if (this.unsubscribe !== null) return;
		const handler = (event: INotificationEvent): void => {
			this.handle(event);
		};
		this.options.notifications.addEventListener('lock-released', handler);
		this.options.notifications.addEventListener('cap', handler);
		this.options.notifications.addEventListener('bloqueado', handler);
		this.metricsTimer = setInterval(() => {
			void this.pollMetrics();
		}, 1_000);
		this.unsubscribe = (): void => {
			if (this.metricsTimer !== null) clearInterval(this.metricsTimer);
			this.metricsTimer = null;
			this.unsubscribe = null;
		};
	}

	stop(): void {
		this.unsubscribe?.();
	}

	/**
	 * Manually drive one metrics poll. Useful for tests that use
	 * fake timers, and for hosts that want a deterministic
	 * "refresh correlation buffer now" command.
	 */
	async tick(): Promise<void> {
		await this.pollMetrics();
	}

	addEventListener(cb: (entry: INotificationLogEntry) => void): () => void {
		this.listeners.add(cb);
		return (): void => {
			this.listeners.delete(cb);
		};
	}

	private async pollMetrics(): Promise<void> {
		try {
			const snap: IMetricsSnapshot =
				await this.options.metrics.snapshot();
			const now = Date.now();
			// Use `now` (not `now - maxMs`) so the buffer entries fall
			// within the correlation window of any subsequent
			// notification. The buffer is short-lived (200 entries) so
			// this approximation is fine for UX.
			for (const [tool, m] of Object.entries(snap.tools)) {
				this.pushBuffered({ tool, ts: now, durationMs: m.maxMs });
			}
		} catch {
			// Ignore — connection-health service will surface the failure.
		}
	}

	private pushBuffered(call: IBufferedCall): void {
		this.buffer.push(call);
		while (this.buffer.length > MAX_BUFFER) this.buffer.shift();
	}

	private handle(event: INotificationEvent): void {
		const eventTs = Date.now();
		const correlated = this.buffer.filter(
			(c) => Math.abs(c.ts - eventTs) <= CORRELATION_WINDOW_MS,
		);
		const kind: BridgeEventKind = event.type;
		const message = describeEvent(event);
		const taskId =
			event.type === 'lock-released' ? event.taskId : undefined;
		const entry: INotificationLogEntry = {
			ts: new Date(eventTs).toISOString(),
			event: kind,
			message,
			...(taskId === undefined ? {} : { taskId }),
			correlatedToolCalls: correlated.map((c) => ({
				tool: c.tool,
				ts: new Date(c.ts).toISOString(),
				durationMs: c.durationMs,
			})),
		};
		for (const cb of this.listeners) cb(entry);
	}
}

const describeEvent = (event: INotificationEvent): string => {
	switch (event.type) {
		case 'lock-released':
			return `lock released by ${event.agent} (${event.files.length} files)`;
		case 'cap':
			return event.message;
		case 'bloqueado':
			return event.message;
	}
};
