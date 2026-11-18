/**
 * run-temp-root.global-setup.ts — one temp root for a whole test run.
 *
 * Every temporary directory a spec or a helper makes goes through
 * `os.tmpdir()`, which reads TMPDIR (TMP and TEMP on Windows). This setup
 * makes one directory, `delendai-test-run-<pid>`, points the three
 * variables at it before any worker starts (workers inherit the
 * environment of the process that forks them) and removes it when the run
 * ends, so the system temp directory holds the same entries before and
 * after a run. Wired once through `sharedTestOptions`, so no project opts
 * out and no spec has to clean up after itself.
 */
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** The variables `os.tmpdir()` reads. */
export const TEMP_VARIABLES = ['TMPDIR', 'TMP', 'TEMP'] as const;

/** Names the pid that made the run root, so a second setup in that process reuses it. */
export const RUN_ROOT_OWNER_VARIABLE = 'DELENDAI_TEST_RUN_ROOT_OWNER';

/** The run root a process owns, under `base`. */
export const runTempRootPath = (
	pid: number = process.pid,
	base: string = tmpdir(),
): string => join(base, `delendai-test-run-${String(pid)}`);

/**
 * Create the run root and point the temp variables at it. Returns the
 * function that restores the variables and removes the root.
 */
export const enterRunTempRoot = (
	env: NodeJS.ProcessEnv = process.env,
	root: string = runTempRootPath(),
): { readonly root: string; readonly leave: () => void } => {
	// Vitest runs one global setup per project in the same process: the
	// first makes the root, the others find it and leave it to the first.
	const reusable = env[RUN_ROOT_OWNER_VARIABLE] === String(process.pid);
	if (reusable && env.TMPDIR !== undefined) {
		return { root: env.TMPDIR, leave: () => undefined };
	}
	mkdirSync(root, { recursive: true });
	const previous = [...TEMP_VARIABLES, RUN_ROOT_OWNER_VARIABLE].map(
		(name) => [name, env[name]] as const,
	);
	for (const name of TEMP_VARIABLES) env[name] = root;
	env[RUN_ROOT_OWNER_VARIABLE] = String(process.pid);
	return {
		root,
		leave: () => {
			for (const [name, value] of previous) {
				if (value === undefined) delete env[name];
				else env[name] = value;
			}
			rmSync(root, { recursive: true, force: true });
		},
	};
};

/** The vitest globalSetup: the returned function is its teardown. */
export default function setup(): () => void {
	return enterRunTempRoot().leave;
}
