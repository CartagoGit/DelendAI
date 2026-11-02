/** Constants for `harden-git-hooks.script.ts`. */

/** Present in every hook lefthook generates. */
export const LEFTHOOK_SIGNATURE = 'call_lefthook';

/** Present in a hook this script has already rewritten. */
export const HARDENED_MARKER = 'delendai:hooks-run-in-every-worktree';

/** The generated fallback that reports a missing binary and passes. */
export const NOT_FOUND_LINE = 'echo "Can\'t find lefthook in PATH"';

/** Hooks this repository lets lefthook own. */
export const MANAGED_HOOKS = [
	'pre-commit',
	'commit-msg',
	'pre-push',
	'post-merge',
	'post-checkout',
] as const;

/** `rwxr-xr-x` — a hook git will execute. */
export const HOOK_MODE = 0o755;

/**
 * The shell preamble inserted after the shebang.
 *
 * `--git-common-dir` is the one path that answers the same in the shared
 * checkout and in every worktree, so its parent is always the directory
 * that carries `node_modules`. Setting `LEFTHOOK_BIN` short-circuits the
 * generated search before it can consult a worktree that has no
 * dependencies installed, or an absolute path baked in from a worktree
 * that has since been removed.
 */
export const preambleFor = (): string =>
	[
		`# ${HARDENED_MARKER} — see tools/scripts/git/harden-git-hooks.script.ts`,
		'if [ -z "$LEFTHOOK_BIN" ]; then',
		'  _delendai_common="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)"',
		'  _delendai_root="$(dirname "$_delendai_common")"',
		'  if [ -x "$_delendai_root/node_modules/.bin/lefthook" ]; then',
		'    LEFTHOOK_BIN="$_delendai_root/node_modules/.bin/lefthook"',
		'    export LEFTHOOK_BIN',
		'  fi',
		'fi',
		'',
	].join('\n');
