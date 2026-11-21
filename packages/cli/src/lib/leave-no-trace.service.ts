import { existsSync, rmSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';

/** Where the server keeps its cache when `--cacheDir` does not say. */
const DEFAULT_CACHE_DIR = '.cache/delendai';

/**
 * The outermost directory a run would create to reach `cache`, or nothing
 * when `cache` is already there. Never the workspace itself.
 */
export const firstMissingDirectory = (
	workspace: string,
	cache: string,
): string | undefined => {
	if (existsSync(cache)) return undefined;
	const root = resolve(workspace);
	let first = cache;
	while (dirname(first) !== root && !existsSync(dirname(first))) {
		first = dirname(first);
	}
	return dirname(first) === root || first.startsWith(`${root}${sep}`)
		? first
		: undefined;
};

/**
 * What to call when a read-only command ends, so the project is left as it
 * was found. The server a command starts writes its cache as it boots,
 * whatever the command does; in a project that had no cache, asking
 * `delendai status` whether delendai is set up would otherwise set it up.
 * A project that already has its cache keeps everything written to it.
 */
export const leaveNoTrace = (
	workspace: string,
	cacheDir: string = DEFAULT_CACHE_DIR,
): (() => void) => {
	const created = firstMissingDirectory(
		workspace,
		resolve(workspace, cacheDir),
	);
	if (created === undefined) return () => undefined;
	return () => {
		rmSync(created, { recursive: true, force: true });
	};
};
