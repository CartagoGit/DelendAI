import {
	closeSync,
	fsyncSync,
	mkdirSync,
	openSync,
	renameSync,
	rmSync,
	writeSync,
} from 'node:fs';
import { constants } from 'node:fs';
import { mkdir, open, readdir, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';

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
/** The longest file name most file systems accept, in bytes. */
const NAME_MAX_BYTES = 255;
/** Room for `.<time36>-<12 hex>.tmp` after the stem. */
const TMP_SUFFIX_BYTES = 32;
/** Hex characters of the name's hash kept in a shortened stem. */
const STEM_HASH_CHARS = 12;

/**
 * The name a temporary of `base` starts with. It is `base` itself when
 * the temporary's name fits the file system's limit; otherwise the start
 * of `base`, cut on a character boundary, plus a hash of the whole name.
 * Appending the suffix to a proposal file named after a long title made a
 * 242-byte name longer than 255 bytes, and the write failed with
 * ENAMETOOLONG.
 */
export const tmpStemFor = (base: string): string => {
	if (Buffer.byteLength(base) + TMP_SUFFIX_BYTES <= NAME_MAX_BYTES) {
		return base;
	}
	const hash = createHash('sha256')
		.update(base)
		.digest('hex')
		.slice(0, STEM_HASH_CHARS);
	const budget = NAME_MAX_BYTES - TMP_SUFFIX_BYTES - hash.length - 1;
	let kept = '';
	for (const char of base) {
		if (Buffer.byteLength(kept + char) > budget) break;
		kept += char;
	}
	return `${kept}~${hash}`;
};

const tmpPathFor = (absolutePath: string): string =>
	join(
		dirname(absolutePath),
		`${tmpStemFor(basename(absolutePath))}.${Date.now().toString(36)}-${randomBytes(6).toString('hex')}.tmp`,
	);

/** Flush a directory entry to disk so a rename into it is durable. Best-effort. */
/**
 * How old an empty temporary of this writer must be before it counts as a
 * dead writer's. Opening a temporary and writing it takes milliseconds.
 */
const ORPHAN_TMP_AGE_MS = 60_000;

/**
 * Remove the empty temporaries of `absolutePath` that a writer left when
 * its process ended between opening and writing one (x00734).
 *
 * A short-lived process (a CLI command, a generator) whose plugin refreshes
 * a cache in the background exits mid-write; nothing ever cleaned up, and
 * `check-stray-cache-files` failed every gate run in that checkout. The
 * next successful write of the same file sweeps them. Best effort: it
 * never fails the write.
 */
const sweepOrphanTemporaries = async (absolutePath: string): Promise<void> => {
	const dir = dirname(absolutePath);
	const prefix = `${tmpStemFor(basename(absolutePath))}.`;
	let names: readonly string[];
	try {
		names = await readdir(dir);
	} catch {
		return;
	}
	const cutoff = Date.now() - ORPHAN_TMP_AGE_MS;
	await Promise.all(
		names
			.filter(
				(name) =>
					name.startsWith(prefix) &&
					/^[0-9a-z]+-[0-9a-f]{12}\.tmp$/u.test(
						name.slice(prefix.length),
					),
			)
			.map(async (name) => {
				const path = join(dir, name);
				const info = await stat(path).catch(() => undefined);
				if (
					info !== undefined &&
					info.size === 0 &&
					info.mtimeMs < cutoff
				) {
					await rm(path, { force: true });
				}
			}),
	);
};

const fsyncDir = async (dir: string): Promise<void> => {
	try {
		// Read-only, never created: a directory is opened only to fsync it.
		const handle = await open(dir, constants.O_RDONLY, 0o600);
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
	// The mode the file ends with: the one it had, or a new file's.
	const finalMode = await stat(absolutePath).then(
		(info) => info.mode & 0o777,
		() => 0o666 & ~process.umask(),
	);
	try {
		// Created exclusively and private: a temporary in a shared directory
		// (the OS temp dir) can be neither pre-planted as a symlink nor read
		// while it is being written. It takes the final mode before the rename.
		const handle = await open(tmp, 'wx', 0o600);
		try {
			if (typeof content === 'string') {
				await handle.writeFile(content, 'utf8');
			} else {
				await handle.writeFile(content);
			}
			await handle.sync(); // fsync data before it becomes visible
			await handle.chmod(finalMode);
		} finally {
			await handle.close();
		}
		await rename(tmp, absolutePath);
		await fsyncDir(dir);
	} catch (error) {
		try {
			await rm(tmp, { force: true });
		} catch {
			// The original failure is the one to report.
		}
		throw error;
	}
	try {
		await sweepOrphanTemporaries(absolutePath);
	} catch {
		// Best effort: the write already landed.
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
