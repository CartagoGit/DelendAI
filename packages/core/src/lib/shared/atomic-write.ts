import {
	closeSync,
	fsyncSync,
	mkdirSync,
	openSync,
	renameSync,
	rmSync,
	writeSync,
} from 'node:fs';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Crash-safe, concurrency-safe file write: write to a temp file IN THE
 * SAME DIRECTORY, fsync it, then `rename` over the target (atomic on
 * POSIX). The temp lives next to the destination — never `os.tmpdir()` —
 * so the rename can't fail with `EXDEV` across filesystems. A reader
 * never sees a partial file. Shared by every plugin store (locks, queue,
 * registry, memory) so no two agents can corrupt state.
 *
 * Durability (a00065 S6): the temp file's data is fsync'd to stable
 * storage BEFORE the rename makes it visible. Without that fsync a power
 * loss right after the rename can leave the target pointing at
 * still-buffered (zero-length) content — the well-known ext4
 * rename-after-truncate hazard — which would turn "atomic" into "atomic,
 * but sometimes empty". The parent directory is then fsync'd best-effort
 * so the rename entry itself survives a crash; that step is unsupported
 * on some platforms (Windows) so its failure never fails the write — the
 * data fsync above is the guarantee that matters.
 */
const tmpPathFor = (absolutePath: string): string =>
	`${absolutePath}.${Date.now().toString(36)}-${Math.random()
		.toString(36)
		.slice(2)}.tmp`;

/** Flush a directory entry to disk so a rename into it is durable. Best-effort. */
const fsyncDir = async (dir: string): Promise<void> => {
	try {
		const handle = await open(dir, 'r');
		try {
			await handle.sync();
		} finally {
			await handle.close();
		}
	} catch {
		// Directory fsync is not portable (Windows cannot open a directory
		// as a handle); the data fsync already protects file contents.
	}
};

/**
 * Binary payloads (downloaded artifacts, images) get the same crash-safe
 * treatment as text: `Uint8Array` is written verbatim, `string` as UTF-8.
 * Without this overload a plugin saving an artifact had no atomic option
 * and fell back to a raw `writeFile`, which the plugin drift budget
 * forbids for exactly the corruption reason above.
 */
export const writeFileAtomic = async (
	absolutePath: string,
	content: string | Uint8Array,
): Promise<void> => {
	const dir = dirname(absolutePath);
	await mkdir(dir, { recursive: true });
	const tmp = tmpPathFor(absolutePath);
	try {
		const handle = await open(tmp, 'w');
		try {
			if (typeof content === 'string') {
				await handle.writeFile(content, 'utf8');
			} else {
				await handle.writeFile(content);
			}
			await handle.sync(); // fsync data before it becomes visible
		} finally {
			await handle.close();
		}
		await rename(tmp, absolutePath);
		await fsyncDir(dir);
	} catch (error) {
		await rm(tmp, { force: true }).catch(() => undefined);
		throw error;
	}
};

/** Flush a directory entry to disk (sync). Best-effort — see {@link fsyncDir}. */
const fsyncDirSync = (dir: string): void => {
	try {
		const fd = openSync(dir, 'r');
		try {
			fsyncSync(fd);
		} finally {
			closeSync(fd);
		}
	} catch {
		// unsupported on some platforms — data fsync already protects contents
	}
};

/**
 * Boot-time one-shot only — hot paths must use the async variant
 * ({@link writeFileAtomic}). No `*Sync` filesystem calls inside tool
 * handlers or engines (AGENTS.md invariant 3).
 */
export const writeFileAtomicSync = (
	absolutePath: string,
	content: string,
): void => {
	const dir = dirname(absolutePath);
	mkdirSync(dir, { recursive: true });
	const tmp = tmpPathFor(absolutePath);
	try {
		const fd = openSync(tmp, 'w');
		try {
			writeSync(fd, content, null, 'utf8');
			fsyncSync(fd); // fsync data before it becomes visible
		} finally {
			closeSync(fd);
		}
		renameSync(tmp, absolutePath);
		fsyncDirSync(dir);
	} catch (error) {
		try {
			rmSync(tmp, { force: true });
		} catch {
			// ignore cleanup failure
		}
		throw error;
	}
};
