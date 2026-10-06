/**
 * Typed models for the Connection-health status bar (S7 in f126).
 */

export type IConnectionState = 'up' | 'down' | 'retrying';

export interface IConnectionHealthEvent {
	readonly state: IConnectionState;
	readonly ts: string;
	readonly error?: string;
	readonly attempt?: number;
	readonly nextRetryAt?: string;
}

export interface IConnectionHealthSnapshot {
	readonly state: IConnectionState;
	readonly lastSeen: string | null;
	readonly lastError: string | null;
	readonly consecutiveFailures: number;
	readonly nextRetryAt: string | null;
}

export interface IConnectionHealthOptions {
	/** How often to ping (ms). Default 5_000. */
	readonly pingIntervalMs?: number;
	/** Max consecutive failures before going `down`. Default 2. */
	readonly failureThreshold?: number;
	/** Max time to wait for one ping (ms). Default 2_000. */
	readonly pingTimeoutMs?: number;
}
