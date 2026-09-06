/**
 * tmp-file-sweeper.ts — r00042 S3.
 *
 * Moved out of `locks/engine.ts` verbatim: the engine was 1,394 lines
 * against the 600-line ceiling this proposal sets, and it is
 * concurrency-sensitive code with a recorded history of subtle
 * correctness bugs. Declarations were relocated, never rewritten.
 */
import type { IAgentLockTmpFileInfo } from '../contracts/interfaces/agent-lock.interface';
import { rm, stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { safeListDir } from '@delendai/core/public';
import { AGENT_LOCK_TMP_STALE_MS } from '../contracts/constants/agent-lock-engine.constant';

export const isAgentLockTmpFile = (
	lockPath: string,
	candidate: string,
): boolean => {
	const expectedPrefix = `${basename(lockPath)}.`;
	return candidate.startsWith(expectedPrefix) && candidate.endsWith('.tmp');
};

export const listStaleAgentLockTmpFiles = async (
	lockPath: string,
	staleMs = AGENT_LOCK_TMP_STALE_MS,
): Promise<readonly IAgentLockTmpFileInfo[]> => {
	const dir = dirname(lockPath);
	const nowMs = Date.now();
	// x00509 / B19: `safeListDir` distinguishes "no tmp files" from
	// "couldn't read the directory" — the previous `.catch(() => [])`
	// silently accumulated leftover lock files on EACCES, masking a
	// real failure as "nothing to sweep".
	const entries = (await safeListDir(dir)).entries;
	const staleTmpFiles: IAgentLockTmpFileInfo[] = [];
	for (const entry of entries) {
		if (!entry.isFile()) continue;
		if (!isAgentLockTmpFile(lockPath, entry.name)) continue;
		const absPath = join(dir, entry.name);
		const info = await stat(absPath).catch(() => null);
		if (info === null) continue;
		const ageMs = nowMs - info.mtimeMs;
		if (ageMs <= staleMs) continue;
		staleTmpFiles.push({
			absPath,
			relName: entry.name,
			mtime: info.mtime.toISOString(),
			ageSeconds: Math.floor(ageMs / 1000),
		});
	}
	staleTmpFiles.sort((a, b) => a.absPath.localeCompare(b.absPath));
	return staleTmpFiles;
};

export const sweepStaleAgentLockTmpFiles = async (
	lockPath: string,
	staleMs = AGENT_LOCK_TMP_STALE_MS,
): Promise<readonly IAgentLockTmpFileInfo[]> => {
	const staleTmpFiles = await listStaleAgentLockTmpFiles(lockPath, staleMs);
	for (const tmpFile of staleTmpFiles) {
		await rm(tmpFile.absPath, { force: true }).catch(() => undefined);
	}
	return staleTmpFiles;
};
