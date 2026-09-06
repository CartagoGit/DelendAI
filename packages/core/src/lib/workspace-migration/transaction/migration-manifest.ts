/**
 * migration-manifest.ts — b00239 S6.
 *
 * The transactional migration writes a 10-field manifest so later
 * operators (or the explicit `migrate rollback` command) can tell
 * what ran, what files changed, and whether validation succeeded.
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export const MIGRATION_MANIFEST_VERSION = 1;

export const MIGRATION_MANIFESTS_DIR = [
	'.delendai',
	'migration-manifests',
] as const;

export interface IValidationReport {
	readonly ok: boolean;
	readonly reason: string;
}

export interface IManifestRename {
	readonly from: string;
	readonly to: string;
}

export interface IManifestPackageChange {
	readonly name: string;
	readonly from: string;
	readonly to: string;
}

export interface IManifestHostConfigChange {
	readonly file: string;
	readonly before: string;
	readonly after: string;
}

export interface IMigrationManifest {
	readonly id: string;
	readonly version: number;
	readonly timestamp: string;
	readonly affectedFiles: readonly string[];
	readonly hashesBefore: Readonly<Record<string, string>>;
	readonly hashesAfter: Readonly<Record<string, string>>;
	readonly renames: readonly IManifestRename[];
	readonly packageChanges: readonly IManifestPackageChange[];
	readonly hostConfigChanges: readonly IManifestHostConfigChange[];
	readonly validationResult: IValidationReport;
}

export interface IMigrationManifestInput {
	readonly id: string;
	readonly timestamp: string;
	readonly affectedFiles: readonly string[];
	readonly hashesBefore: Readonly<Record<string, string>>;
	readonly hashesAfter: Readonly<Record<string, string>>;
	readonly renames: readonly IManifestRename[];
	readonly packageChanges: readonly IManifestPackageChange[];
	readonly hostConfigChanges: readonly IManifestHostConfigChange[];
	readonly validationResult: IValidationReport;
}

export interface IStoredMigrationManifest {
	readonly path: string;
	readonly manifest: IMigrationManifest;
}

const sanitizeToken = (value: string): string =>
	value.replaceAll(/[^a-zA-Z0-9._-]+/g, '_');

export const buildManifest = (
	input: IMigrationManifestInput,
): IMigrationManifest => ({
	id: input.id,
	version: MIGRATION_MANIFEST_VERSION,
	timestamp: input.timestamp,
	affectedFiles: [...input.affectedFiles],
	hashesBefore: { ...input.hashesBefore },
	hashesAfter: { ...input.hashesAfter },
	renames: [...input.renames],
	packageChanges: [...input.packageChanges],
	hostConfigChanges: [...input.hostConfigChanges],
	validationResult: { ...input.validationResult },
});

export const serializeManifest = (manifest: IMigrationManifest): string =>
	`${JSON.stringify(manifest, null, '\t')}\n`;

export const manifestPathFor = (
	workspaceRoot: string,
	manifest: Pick<IMigrationManifest, 'id' | 'timestamp'>,
): string =>
	join(
		workspaceRoot,
		...MIGRATION_MANIFESTS_DIR,
		`${sanitizeToken(manifest.id)}-${sanitizeToken(manifest.timestamp)}.json`,
	);

export const readManifestFromDisk = async (
	manifestPath: string,
): Promise<IMigrationManifest | null> => {
	let text: string;
	try {
		text = await readFile(manifestPath, 'utf8');
	} catch (error) {
		if (
			typeof error === 'object' &&
			error !== null &&
			'code' in error &&
			(error as { code: unknown }).code === 'ENOENT'
		) {
			return null;
		}
		throw error;
	}
	const parsed: unknown = JSON.parse(text);
	if (!isMigrationManifest(parsed)) {
		throw new Error(
			`manifest at ${manifestPath} does not match IMigrationManifest shape`,
		);
	}
	return parsed;
};

export const writeManifest = async (
	workspaceRoot: string,
	manifest: IMigrationManifest,
): Promise<string> => {
	const path = manifestPathFor(workspaceRoot, manifest);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, serializeManifest(manifest), 'utf8');
	return path;
};

export const listManifestPaths = async (
	workspaceRoot: string,
): Promise<readonly string[]> => {
	const absoluteDir = join(workspaceRoot, ...MIGRATION_MANIFESTS_DIR);
	try {
		const entries = await readdir(absoluteDir, { withFileTypes: true });
		return entries
			.filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
			.map((entry) => join(absoluteDir, entry.name))
			.sort();
	} catch (error) {
		if (
			typeof error === 'object' &&
			error !== null &&
			'code' in error &&
			(error as { code: unknown }).code === 'ENOENT'
		) {
			return [];
		}
		throw error;
	}
};

export const readLatestManifestFromDisk = async (
	workspaceRoot: string,
): Promise<IStoredMigrationManifest | null> => {
	const latestPath = [...(await listManifestPaths(workspaceRoot))].at(-1);
	if (latestPath === undefined) return null;
	const manifest = await readManifestFromDisk(latestPath);
	if (manifest === null) return null;
	return { path: latestPath, manifest };
};

export const isMigrationManifest = (
	value: unknown,
): value is IMigrationManifest => {
	if (value === null || typeof value !== 'object') return false;
	const record = value as Record<string, unknown>;
	if (typeof record.id !== 'string') return false;
	if (typeof record.version !== 'number') return false;
	if (typeof record.timestamp !== 'string') return false;
	if (!Array.isArray(record.affectedFiles)) return false;
	if (
		record.affectedFiles.some((entry: unknown) => typeof entry !== 'string')
	) {
		return false;
	}
	if (!isStringRecord(record.hashesBefore)) return false;
	if (!isStringRecord(record.hashesAfter)) return false;
	if (!isRenames(record.renames)) return false;
	if (!isPackageChanges(record.packageChanges)) return false;
	if (!isHostConfigChanges(record.hostConfigChanges)) return false;
	if (!isValidationReport(record.validationResult)) return false;
	return true;
};

const isStringRecord = (
	value: unknown,
): value is Readonly<Record<string, string>> => {
	if (value === null || typeof value !== 'object') return false;
	return Object.values(value as Record<string, unknown>).every(
		(entry) => typeof entry === 'string',
	);
};

const isRenames = (value: unknown): value is readonly IManifestRename[] => {
	if (!Array.isArray(value)) return false;
	return value.every(
		(entry): entry is IManifestRename =>
			entry !== null &&
			typeof entry === 'object' &&
			typeof (entry as { from?: unknown }).from === 'string' &&
			typeof (entry as { to?: unknown }).to === 'string',
	);
};

const isPackageChanges = (
	value: unknown,
): value is readonly IManifestPackageChange[] => {
	if (!Array.isArray(value)) return false;
	return value.every(
		(entry): entry is IManifestPackageChange =>
			entry !== null &&
			typeof entry === 'object' &&
			typeof (entry as { name?: unknown }).name === 'string' &&
			typeof (entry as { from?: unknown }).from === 'string' &&
			typeof (entry as { to?: unknown }).to === 'string',
	);
};

const isHostConfigChanges = (
	value: unknown,
): value is readonly IManifestHostConfigChange[] => {
	if (!Array.isArray(value)) return false;
	return value.every(
		(entry): entry is IManifestHostConfigChange =>
			entry !== null &&
			typeof entry === 'object' &&
			typeof (entry as { file?: unknown }).file === 'string' &&
			typeof (entry as { before?: unknown }).before === 'string' &&
			typeof (entry as { after?: unknown }).after === 'string',
	);
};

const isValidationReport = (value: unknown): value is IValidationReport =>
	value !== null &&
	typeof value === 'object' &&
	typeof (value as { ok?: unknown }).ok === 'boolean' &&
	typeof (value as { reason?: unknown }).reason === 'string';
