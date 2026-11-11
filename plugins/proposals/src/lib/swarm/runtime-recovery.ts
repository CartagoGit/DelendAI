export interface IRuntimeRecoveryLock {
	readonly task_id?: string;
	readonly agent?: string;
	readonly last_seen?: string;
}

export interface IRuntimeRecoveryCheckpoint {
	readonly proposalId?: string;
	readonly status?: string;
	readonly updatedAt?: string;
	readonly lastUpdated?: string;
	readonly recovery?: {
		readonly repeatedCount?: number;
		readonly lastHealthyAt?: string;
	};
}

export const CLOSED_CHECKPOINT_STATUSES = new Set([
	'done',
	'complete',
	'closed',
	'slice-complete',
]);

export const CONTINUITY_STALE_WINDOW_MS = 15 * 60 * 1000;
export const CONTINUITY_REPEAT_RESET_THRESHOLD = 2;

function parseTimeMs(value: string | undefined): number | null {
	if (value === undefined || value.trim().length === 0) {
		return null;
	}

	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? null : parsed;
}

export function isStaleTimestamp(value: string | undefined): boolean {
	const timestamp = parseTimeMs(value);
	if (timestamp === null) {
		return false;
	}

	return Date.now() - timestamp >= CONTINUITY_STALE_WINDOW_MS;
}

export function isStaleLock(lock: IRuntimeRecoveryLock | undefined): boolean {
	if (lock === undefined) {
		return false;
	}

	return isStaleTimestamp(lock.last_seen);
}

export function shouldResetFromCheckpoint(
	checkpoint: IRuntimeRecoveryCheckpoint,
): boolean {
	const checkpointStatus = checkpoint.status?.trim().toLowerCase();
	if (
		checkpointStatus === undefined ||
		checkpointStatus.length === 0 ||
		CLOSED_CHECKPOINT_STATUSES.has(checkpointStatus)
	) {
		return false;
	}

	if (
		(checkpoint.recovery?.repeatedCount ?? 0) >=
		CONTINUITY_REPEAT_RESET_THRESHOLD
	) {
		return true;
	}

	return isStaleTimestamp(
		checkpoint.recovery?.lastHealthyAt ??
			checkpoint.updatedAt ??
			checkpoint.lastUpdated,
	);
}
