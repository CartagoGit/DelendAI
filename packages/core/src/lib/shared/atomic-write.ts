import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Crash-safe, concurrency-safe file write: write to a temp file IN THE
 * SAME DIRECTORY, then `rename` over the target (atomic on POSIX). The
 * temp lives next to the destination — never `os.tmpdir()` — so the
 * rename can't fail with `EXDEV` across filesystems. A reader never sees
 * a partial file. Shared by every plugin store (locks, queue, registry,
 * memory) so no two agents can corrupt state.
 */
const tmpPathFor = (absolutePath: string): string =>
	`${absolutePath}.${Date.now().toString(36)}-${Math.random()
		.toString(36)
		.slice(2)}.tmp`;

export const writeFileAtomic = async (
	absolutePath: string,
	content: string,
): Promise<void> => {
	await mkdir(dirname(absolutePath), { recursive: true });
	const tmp = tmpPathFor(absolutePath);
	try {
		await writeFile(tmp, content, 'utf8');
		await rename(tmp, absolutePath);
	} catch (error) {
		await rm(tmp, { force: true }).catch(() => undefined);
		throw error;
	}
};

export const writeFileAtomicSync = (
	absolutePath: string,
	content: string,
): void => {
	mkdirSync(dirname(absolutePath), { recursive: true });
	const tmp = tmpPathFor(absolutePath);
	try {
		writeFileSync(tmp, content, 'utf8');
		renameSync(tmp, absolutePath);
	} catch (error) {
		try {
			rmSync(tmp, { force: true });
		} catch {
			// ignore cleanup failure
		}
		throw error;
	}
};
