/**
 * quiet-git-setup.ts — no git maintenance outlives the test that caused it.
 *
 * Since git 2.47 the maintenance that `git push` triggers on the
 * receiving repository detaches by default and keeps running after the
 * push has returned. A spec that pushes into a throwaway bare remote and
 * deletes it in `afterEach` then races that process: CI (git 2.55) failed
 * develop's full run on 2026-09-24 with `ENOTEMPTY: directory not empty,
 * rmdir '/tmp/commit-policy-work-ref-remote-…/info'`. It never reproduced
 * on a machine with an older git, where the same maintenance runs in the
 * foreground.
 *
 * The fix is to not start it: every git a test spawns inherits this
 * environment, so none runs auto-gc or auto-maintenance. `GIT_CONFIG_*`
 * entries are appended to whatever the caller already set, and applied
 * once per process.
 */
const QUIET_GIT: readonly (readonly [string, string])[] = [
	['receive.autogc', 'false'],
	['maintenance.auto', 'false'],
	['gc.auto', '0'],
];

if (process.env.DELENDAI_QUIET_GIT !== '1') {
	const base = Number.parseInt(process.env.GIT_CONFIG_COUNT ?? '0', 10) || 0;
	QUIET_GIT.forEach(([key, value], index) => {
		process.env[`GIT_CONFIG_KEY_${String(base + index)}`] = key;
		process.env[`GIT_CONFIG_VALUE_${String(base + index)}`] = value;
	});
	process.env.GIT_CONFIG_COUNT = String(base + QUIET_GIT.length);
	process.env.DELENDAI_QUIET_GIT = '1';
}

export {};
