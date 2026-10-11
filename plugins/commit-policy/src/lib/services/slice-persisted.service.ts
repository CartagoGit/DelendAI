/**
 * Whether a finished slice still has anything to persist.
 *
 * The processed-events store records what this plugin handled, and it
 * starts empty in a fresh cache, after the cache is cleared, or when the
 * plugin is first enabled on a project with history. Asked alone, it
 * called every already-`done` slice unpersisted: an adopter project got
 * checkpoints for ten slices committed two days earlier, all in the same
 * minute. Git knows better. A slice whose files have no uncommitted
 * change has nothing left to persist, whoever committed it.
 */
import type { IGitRunner } from '@delendai/core/contracts';

/**
 * True when every path the slice names is clean: no staged, unstaged or
 * untracked change. `false` when git cannot answer, so an unreadable
 * repository never silences a slice that does need persisting.
 */
export const sliceFilesAreCommitted = async (
	run: IGitRunner,
	files: readonly string[],
): Promise<boolean> => {
	if (files.length === 0) return false;
	const status = await run([
		'status',
		'--porcelain',
		'--untracked-files=all',
		'--',
		...files,
	]);
	return status.ok && status.output.trim() === '';
};

/** How long one reading of the working tree answers for. */
const STATUS_TTL_MS = 2000;

/** `XY ` before each path of `git status --porcelain`. */
const STATUS_PREFIX_LENGTH = 3;

/** Characters that make a path a pattern only git can expand. */
const PATTERN = /[*?[\]:]/u;

const withoutTrailingSlash = (path: string): string =>
	path.replace(/^\.\//u, '').replace(/\/+$/u, '');

/** Every path `git status --porcelain -z` names, both ends of a rename. */
const pathsOfStatus = (output: string): readonly string[] => {
	const records = output.split('\0').filter((record) => record.length > 0);
	const paths: string[] = [];
	for (let index = 0; index < records.length; index += 1) {
		const record = records[index] ?? '';
		paths.push(record.slice(STATUS_PREFIX_LENGTH));
		// A rename or a copy is followed by the path it came from.
		if (/^[RC]|^.[RC]/u.test(record)) {
			index += 1;
			paths.push(records[index] ?? '');
		}
	}
	return paths.filter((path) => path.length > 0);
};

/**
 * {@link sliceFilesAreCommitted} for many slices at a time: the working
 * tree is read once and every question within the next two seconds is
 * answered from that reading.
 *
 * A server that starts on a repository with history asks this once per
 * finished slice. One `git status` each was three thousand processes in
 * a row here, minutes of a core at every start, to learn what a single
 * call says. A pattern only git can expand is still asked of git.
 */
export const createCommittedFilesProbe = (
	run: IGitRunner,
	now: () => number = Date.now,
): ((files: readonly string[]) => Promise<boolean>) => {
	let reading:
		| {
				readonly at: number;
				readonly dirty: Promise<readonly string[] | null>;
		  }
		| undefined;
	const dirtyPaths = (): Promise<readonly string[] | null> => {
		if (reading === undefined || now() - reading.at >= STATUS_TTL_MS) {
			reading = {
				at: now(),
				dirty: run([
					'status',
					'--porcelain',
					'-z',
					'--untracked-files=all',
				]).then(
					(status) =>
						status.ok ? pathsOfStatus(status.output) : null,
					() => null,
				),
			};
		}
		return reading.dirty;
	};
	return async (files) => {
		if (files.length === 0) return false;
		if (files.some((file) => PATTERN.test(file)))
			return sliceFilesAreCommitted(run, files);
		const dirty = await dirtyPaths();
		if (dirty === null) return false;
		const named = files.map(withoutTrailingSlash);
		return !dirty.some((path) =>
			named.some((file) => path === file || path.startsWith(`${file}/`)),
		);
	};
};
