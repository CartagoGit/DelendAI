/**
 * Versioned-state migration runner (M14).
 *
 * Every persisted store carries a `version`. When its on-disk shape changes,
 * a migrator from the old version to the next is registered here; this runner
 * applies them in sequence to bring any old file up to the current version.
 * It is the safety net the audit asked for: a format change can no longer
 * silently break a workspace that still holds the old shape.
 *
 * Pure (no I/O) — the filesystem read-backup-write wrapper is `migrate-file.ts`.
 */

export interface IVersioned {
	readonly version: number;
}

/** Migrates a store from version N to N+1. Receives/returns plain JSON. */
export type IMigrator = (data: Record<string, unknown>) => Record<string, unknown>;

export class MigrationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'MigrationError';
	}
}

export interface IMigrationResult<T> {
	readonly data: T;
	readonly from: number;
	readonly to: number;
	/** Source versions whose migrator ran, in order (empty = already current). */
	readonly applied: number[];
}

/**
 * Bring `input` up to `targetVersion` by applying `migrators[v]` for each
 * version `v` from the input's version up to `targetVersion - 1`.
 *
 * - Already at target → no-op (returns the input untouched).
 * - Newer than target (downgrade) → throws (refuse to guess).
 * - Missing a migrator in the chain → throws (no silent partial migration).
 */
export const runMigrations = <T extends IVersioned>(
	input: IVersioned & Record<string, unknown>,
	migrators: Readonly<Record<number, IMigrator>>,
	targetVersion: number
): IMigrationResult<T> => {
	const from = input.version;
	if (typeof from !== 'number' || !Number.isInteger(from) || from < 1) {
		throw new MigrationError(`invalid store version: ${String(from)}`);
	}
	if (from > targetVersion) {
		throw new MigrationError(
			`store version ${from} is newer than the supported ${targetVersion} (downgrade not supported)`
		);
	}
	let current: Record<string, unknown> = input;
	const applied: number[] = [];
	for (let v = from; v < targetVersion; v += 1) {
		const migrator = migrators[v];
		if (migrator === undefined) {
			throw new MigrationError(
				`no migrator from version ${v} to ${v + 1} (chain ${from}→${targetVersion} is incomplete)`
			);
		}
		current = { ...migrator(current), version: v + 1 };
		applied.push(v);
	}
	return { data: current as T, from, to: targetVersion, applied };
};
