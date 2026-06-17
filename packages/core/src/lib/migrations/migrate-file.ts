/**
 * Filesystem wrapper around `runMigrations` (M14): read a versioned JSON store,
 * migrate it to the current version, and — only if something actually changed —
 * preserve the original bytes in a `.bak-<ts>` sidecar before writing the
 * migrated file atomically. `dryRun` reports the plan without touching disk.
 */
import { readFile } from 'node:fs/promises';

import { writeFileAtomic } from '../shared/atomic-write';
import {
	MigrationError,
	runMigrations,
	type IMigrationResult,
	type IMigrator,
	type IVersioned,
} from './migrate';

export interface IMigrateFileOptions {
	readonly migrators: Readonly<Record<number, IMigrator>>;
	readonly targetVersion: number;
	/** Report the plan without backing up or writing. */
	readonly dryRun?: boolean;
}

export interface IMigrateFileResult<T> extends IMigrationResult<T> {
	readonly path: string;
	/** True when at least one migrator ran (the file was rewritten). */
	readonly changed: boolean;
	/** Where the pre-migration bytes were preserved (null if no write). */
	readonly backupPath: string | null;
}

/**
 * Migrate a JSON store at `path`. Returns `null` if the file is missing
 * (nothing to migrate). Throws `MigrationError` on unparseable JSON or an
 * incomplete migrator chain.
 */
export const migrateJsonFile = async <T extends IVersioned>(
	path: string,
	options: IMigrateFileOptions
): Promise<IMigrateFileResult<T> | null> => {
	let raw: string;
	try {
		raw = await readFile(path, 'utf8');
	} catch {
		return null;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		throw new MigrationError(`cannot parse "${path}": ${String(err)}`);
	}
	const result = runMigrations<T>(
		parsed as IVersioned & Record<string, unknown>,
		options.migrators,
		options.targetVersion
	);
	const changed = result.applied.length > 0;
	if (!changed || options.dryRun === true) {
		return { ...result, path, changed, backupPath: null };
	}
	const backupPath = `${path}.bak-${Date.now().toString(36)}`;
	await writeFileAtomic(backupPath, raw); // preserve the original bytes
	await writeFileAtomic(path, `${JSON.stringify(result.data, null, 2)}\n`);
	return { ...result, path, changed, backupPath };
};
