/**
 * `ConnectionHealthService` — pings the MCP server every N seconds
 * with the cheapest available tool (`status-marker_ping`) and emits
 * `up` / `down` / `retrying` events via an `EventTarget`-style API.
 *
 * Used by the VS Code extension to:
 *   - color the status-bar item (`$(circle-green)` / `$(circle-red)`);
 *   - surface a "Server is down" toast with a "Restart" action;
 *   - auto-retry on next interval (does NOT spawn a new server, the
 *     host's `restartServerCommand` does that when the user clicks
 *     Restart).
 */
import type { McpStdioClient } from '../transport/mcp-stdio-client';
import type {
	IConnectionHealthEvent,
	IConnectionHealthOptions,
	IConnectionHealthSnapshot,
	IConnectionState,
} from '../contracts/interfaces/connection-health.interface';

const TOOL_PING = 'status-marker_ping';

export type IConnectionHealthListener = (event: IConnectionHealthEvent) => void;

export class ConnectionHealthService {
	private readonly pingIntervalMs: number;
	private readonly failureThreshold: number;
	private readonly pingTimeoutMs: number;
	private state: IConnectionState = 'up';
	private lastSeen: string | null = null;
	private lastError: string | null = null;
	private consecutiveFailures = 0;
	private nextRetryAt: string | null = null;
	private timer: ReturnType<typeof setInterval> | null = null;
	private readonly listeners = new Set<IConnectionHealthListener>();

	constructor(
		private readonly client: McpStdioClient,
		options: IConnectionHealthOptions = {},
	) {
		this.pingIntervalMs = options.pingIntervalMs ?? 5_000;
		this.failureThreshold = options.failureThreshold ?? 2;
		this.pingTimeoutMs = options.pingTimeoutMs ?? 2_000;
	}

	start(): void {
		if (this.timer !== null) return;
		// Fire one ping immediately, then schedule.
		void this.ping();
		this.timer = setInterval(() => {
			void this.ping();
		}, this.pingIntervalMs);
	}

	stop(): void {
		if (this.timer !== null) clearInterval(this.timer);
		this.timer = null;
	}

	addEventListener(cb: IConnectionHealthListener): () => void {
		this.listeners.add(cb);
		return () => {
			this.listeners.delete(cb);
		};
	}

	snapshot(): IConnectionHealthSnapshot {
		return {
			state: this.state,
			lastSeen: this.lastSeen,
			lastError: this.lastError,
			consecutiveFailures: this.consecutiveFailures,
			nextRetryAt: this.nextRetryAt,
		};
	}

	private emit(event: IConnectionHealthEvent): void {
		for (const cb of this.listeners) cb(event);
	}

	private async ping(): Promise<void> {
		const attempt = this.consecutiveFailures + 1;
		try {
			await this.withTimeout(
				this.client.request(TOOL_PING, {}),
				this.pingTimeoutMs,
			);
			this.lastSeen = new Date().toISOString();
			this.lastError = null;
			this.consecutiveFailures = 0;
			this.nextRetryAt = null;
			if (this.state !== 'up') {
				this.state = 'up';
				this.emit({
					state: 'up',
					ts: this.lastSeen,
				});
			}
		} catch (err) {
			this.lastError = err instanceof Error ? err.message : String(err);
			this.consecutiveFailures += 1;
			if (this.consecutiveFailures >= this.failureThreshold) {
				if (this.state !== 'down') {
					this.state = 'down';
					this.emit({
						state: 'down',
						ts: new Date().toISOString(),
						error: this.lastError,
					});
				}
			} else {
				this.state = 'retrying';
				this.nextRetryAt = new Date(
					Date.now() + this.pingIntervalMs,
				).toISOString();
				this.emit({
					state: 'retrying',
					ts: new Date().toISOString(),
					attempt,
					nextRetryAt: this.nextRetryAt,
				});
			}
		}
	}

	private withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			const timer = setTimeout(
				() => reject(new Error(`ping timeout after ${ms}ms`)),
				ms,
			);
			p.then(
				(v) => {
					clearTimeout(timer);
					resolve(v);
				},
				(err) => {
					clearTimeout(timer);
					reject(err);
				},
			);
		});
	}
}
