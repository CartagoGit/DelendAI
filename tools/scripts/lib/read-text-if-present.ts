/**
 * read-text-if-present.ts — read a file in one step, so nothing can change
 * it between a check and the read.
 *
 * `existsSync(p) ? readFileSync(p) : …` and `statSync(p)` then
 * `readFileSync(p)` both look at a path twice; what is read may not be what
 * was checked (CodeQL's file-system-race). These read once, and the
 * descriptor they read from is the one they checked.
 */
import {
	closeSync,
	constants,
	fstatSync,
	openSync,
	readFileSync,
} from 'node:fs';

/** The file's text, or `undefined` when there is no such file. */
export const readTextIfPresent = (path: string): string | undefined => {
	try {
		return readFileSync(path, 'utf8');
	} catch (error) {
		if ((error as { code?: string }).code === 'ENOENT') return undefined;
		throw error;
	}
};

/**
 * The text of a regular file, or `undefined` for anything else: missing, a
 * directory, a symlink (not followed), or unreadable. The type is checked
 * on the open descriptor, and the text read from it.
 */
export const readRegularFile = (path: string): string | undefined => {
	let fd: number;
	try {
		fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
	} catch {
		return undefined;
	}
	try {
		return fstatSync(fd).isFile() ? readFileSync(fd, 'utf8') : undefined;
	} catch {
		return undefined;
	} finally {
		closeSync(fd);
	}
};
