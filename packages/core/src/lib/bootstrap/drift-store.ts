// drift-store: persist the last analysis snapshot to disk so the drift
// detector can diff the current analysis against it.
//
// AGENTS.md invariant #4: "New persisted state → mutex + atomic write +
// a corruption test." This module is the canonical example for drift
// state; the same primitives are used by the memory, proposals and
// audit plugins.
//
// Layout: `<cacheDir>/drift/last-analysis.json` (one file). The file
// shape is stable across versions; we version the envelope with
// `version: 1` so a future migration can read older snapshots.
//
// Concurrency model: `withFileMutex` for read-modify-write, but writes
// are always "replace the whole file", not append. So a writer only
// needs to acquire the mutex, write the new bytes, and release. A
// reader just opens the file; the worst case on contention is reading
// a slightly older snapshot, which is fine for drift detection
// (drift is computed against the latest persisted snapshot, not a
// realtime stream).

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { writeFileAtomic } from '../shared/atomic-write';
import { quarantineCorruptFile } from '../shared/quarantine-corrupt-file';
import { withFileMutex } from '../shared/with-file-mutex';
import type { IProjectAnalysis } from './analyze-project';
import type { IWorkspacePathProvider } from '../contracts/interfaces/workspace-paths.interface';

export const DRIFT_STORE_VERSION = 1 as const;

export interface IDriftSnapshotEnvelope {
	readonly version: typeof DRIFT_STORE_VERSION;
	readonly savedAt: string;
	readonly analysis: IProjectAnalysis;
}

const envelopeMatches = (value: unknown): value is IDriftSnapshotEnvelope => {
	if (typeof value !== 'object' || value === null) return false;
	const v = value as Record<string, unknown>;
	return (
		v.version === DRIFT_STORE_VERSION &&
		typeof v.savedAt === 'string' &&
		typeof v.analysis === 'object' &&
		v.analysis !== null
	);
};

export interface ILoadDriftSnapshotResult {
	readonly snapshot: IDriftSnapshotEnvelope | undefined;
	readonly corruptBackupPath: string | null;
}

export const loadDriftSnapshot = async (
	workspace: IWorkspacePathProvider,
	cacheDir: string,
): Promise<ILoadDriftSnapshotResult> => {
	const absolute = workspace.resolve(
		join(cacheDir, 'drift', 'last-analysis.json'),
	);
	try {
		const raw = await readFile(absolute, 'utf8');
		const parsed: unknown = JSON.parse(raw);
		if (!envelopeMatches(parsed)) {
			const backup = await quarantineCorruptFile(absolute);
			return { snapshot: undefined, corruptBackupPath: backup };
		}
		return { snapshot: parsed, corruptBackupPath: null };
	} catch (error) {
		const code =
			typeof error === 'object' && error !== null && 'code' in error
				? (error as { code?: unknown }).code
				: undefined;
		if (code === 'ENOENT') {
			return { snapshot: undefined, corruptBackupPath: null };
		}
		const backup = await quarantineCorruptFile(absolute);
		return { snapshot: undefined, corruptBackupPath: backup };
	}
};

export const saveDriftSnapshot = async (
	workspace: IWorkspacePathProvider,
	cacheDir: string,
	analysis: IProjectAnalysis,
): Promise<void> => {
	const envelope: IDriftSnapshotEnvelope = {
		version: DRIFT_STORE_VERSION,
		savedAt: new Date().toISOString(),
		analysis,
	};
	const absolute = workspace.resolve(
		join(cacheDir, 'drift', 'last-analysis.json'),
	);
	await withFileMutex(absolute, async () => {
		await writeFileAtomic(absolute, JSON.stringify(envelope, null, '\t'));
	});
};
