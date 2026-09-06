/**
 * migration-manifest.ts — b00239 S6.
 *
 * The persisted record written after a transactional migration run.
 * The proposal names ten required fields; this module keeps those
 * field names stable in the JSON written to disk.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
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
	readonly file: string;
	readonly before: string;
	readonly after: string;
}

export interface IManifestHostConfigChange {
	readonly file: string;
	readonly scope: string;
	readonly before: string;
	readonly after: string;
}

export interface IMigrationManifest {
	readonly migration_id: string;
	readonly migration_version: number;
	readonly started_at: string;
	readonly finished_at: string;
	readonly affected_files: number;
	readonly renames: readonly IManifestRename[];
	readonly package_changes: readonly IManifestPackageChange[];
	readonly host_config_changes: readonly IManifestHostConfigChange[];
	readonly validation_outcome: string;
	readonly rollback_reason: string | null;
}

export interface IMigrationManifestInput {
	readonly migration_id: string;
	readonly migration_version?: number;
	readonly started_at: string;
	readonly finished_at: string;
	readonly affected_files: number;
	readonly renames: readonly IManifestRename[];
	readonly package_changes: readonly IManifestPackageChange[];
	readonly host_config_changes: readonly IManifestHostConfigChange[];
	readonly validation_outcome: string;
	readonly rollback_reason: string | null;
}

export const validationOutcomeFromReport = (
	report: IValidationReport,
): string => (report.ok ? 'ok' : `failed: ${report.reason}`);

export const buildManifest = (
	input: IMigrationManifestInput,
): IMigrationManifest => ({
	migration_id: input.migration_id,
	migration_version: input.migration_version ?? MIGRATION_MANIFEST_VERSION,
	started_at: input.started_at,
	finished_at: input.finished_at,
	affected_files: input.affected_files,
	renames: [...input.renames],
	package_changes: [...input.package_changes],
	host_config_changes: [...input.host_config_changes],
	validation_outcome: input.validation_outcome,
	rollback_reason: input.rollback_reason,
});

export const serializeManifest = (manifest: IMigrationManifest): string =>
	`${JSON.stringify(manifest, null, '\t')}\n`;

export const manifestPathFor = (
	workspaceRoot: string,
	manifest: Pick<IMigrationManifest, 'migration_id' | 'started_at'>,
): string => {
	const safeId = manifest.migration_id.replaceAll(/[^a-zA-Z0-9._-]+/g, '_');
	const safeTs = manifest.started_at.replaceAll(/[^a-zA-Z0-9._-]+/g, '_');
	return join(
		workspaceRoot,
		...MIGRATION_MANIFESTS_DIR,
		`${safeId}-${safeTs}.json`,
	);
};

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

export const isMigrationManifest = (
	value: unknown,
): value is IMigrationManifest => {
	if (value === null || typeof value !== 'object') return false;
	const record = value as Record<string, unknown>;
	if (typeof record.migration_id !== 'string') return false;
	if (typeof record.migration_version !== 'number') return false;
	if (typeof record.started_at !== 'string') return false;
	if (typeof record.finished_at !== 'string') return false;
	if (typeof record.affected_files !== 'number') return false;
	if (!isRenames(record.renames)) return false;
	if (!isPackageChanges(record.package_changes)) return false;
	if (!isHostConfigChanges(record.host_config_changes)) return false;
	if (typeof record.validation_outcome !== 'string') return false;
	if (
		record.rollback_reason !== null &&
		typeof record.rollback_reason !== 'string'
	) {
		return false;
	}
	return true;
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
			typeof (entry as { file?: unknown }).file === 'string' &&
			typeof (entry as { before?: unknown }).before === 'string' &&
			typeof (entry as { after?: unknown }).after === 'string',
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
			typeof (entry as { scope?: unknown }).scope === 'string' &&
			typeof (entry as { before?: unknown }).before === 'string' &&
			typeof (entry as { after?: unknown }).after === 'string',
	);
};
