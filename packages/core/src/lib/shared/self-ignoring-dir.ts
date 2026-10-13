/**
 * A directory delendai creates in somebody's project, that git never
 * shows them.
 *
 * `.delendai/` was chosen as the home for runtime-owned workspace state
 * on the stated grounds that it "is already gitignored". It is — in THIS
 * repository, which added the line. In every other project it is a new
 * directory nobody asked for, and it appears in `git status` the moment
 * it is created.
 *
 * That is what the report looked like from the outside: opening a folder
 * produced a handful of unexplained files, one of them a hidden
 * directory with the tool's name on it. The reaction it earned —
 * *"parece hasta un virus"* — is the correct reaction to a tool that
 * writes where it was not invited.
 *
 * Some of this state genuinely has to exist: a record of which
 * migrations ran is what stops them running twice. What does not have to
 * exist is the surprise. A directory can hide itself, without touching a
 * single file the project owns:
 *
 * ```
 * <dir>/.gitignore   →   *
 * ```
 *
 * `*` ignores everything inside, the `.gitignore` included, so the whole
 * subtree vanishes from `git status` and from `git add -A`. It is git's
 * own documented mechanism, it is contained entirely within the
 * directory being created, and it survives a clone — unlike an entry
 * appended to the project's `.gitignore`, which is the project's file to
 * write and not ours.
 *
 * Deliberately NOT done: editing the project's own `.gitignore`. That is
 * a tracked file with the project's history in it, and the whole point
 * of this module is that starting a tool does not edit files somebody
 * else owns.
 */
import { mkdir, writeFile } from 'node:fs/promises';

import {
	SELF_IGNORE_BODY,
	SELF_IGNORE_FILE,
} from './self-ignoring-dir.constant';

/**
 * Create `directory` if it is missing, and make sure git ignores
 * everything in it.
 *
 * Idempotent, and safe to call before every write: the `.gitignore` is
 * written only when it is absent, so a project that deliberately edited
 * it keeps its version.
 */
export const ensureSelfIgnoringDir = async (
	directory: string,
): Promise<void> => {
	await mkdir(directory, { recursive: true });
	try {
		// `wx` fails when the file exists, which is the check and the
		// write in one syscall — no window between them.
		await writeFile(`${directory}/${SELF_IGNORE_FILE}`, SELF_IGNORE_BODY, {
			flag: 'wx',
		});
	} catch {
		// Already there, or a directory that will not take it. Either way
		// the caller's own write is what matters; a visible file is worse
		// than a failed one, but a refused write here must not stop the
		// state being recorded.
	}
};
