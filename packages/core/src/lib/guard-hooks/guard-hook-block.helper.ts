/**
 * The block delendai adds to a git hook so the development policy is
 * enforced for every commit, branch creation and push.
 *
 * It is added beside whatever the project already has, never instead of
 * it, and removed exactly. Three things make that safe:
 *
 * - it runs first and, for hooks that read stdin, buffers stdin and feeds
 *   the same bytes back, so the project's own hook still reads its input;
 * - a missing runner or CLI entry warns and lets git proceed, so removing
 *   delendai never leaves a repository whose commits all fail;
 * - `reference-transaction` fires for every ref update, fetches included,
 *   so the CLI is started only when a local branch is being created or
 *   something is being written to `refs/stash`.
 */
import type {
	IGuardHookEdit,
	IGuardHookName,
	IGuardInvocation,
} from '../contracts/interfaces/guard-hooks.interface';
import {
	GUARD_BLOCK_BEGIN,
	GUARD_BLOCK_END,
	GUARD_CREATED_FILE,
} from '../contracts/constants/guard-hooks.constant';

const quote = (value: string): string => `'${value.replaceAll("'", `'\\''`)}'`;

const readsStdin = (hook: IGuardHookName): boolean => hook !== 'pre-commit';

/**
 * Find delendai on the machine the hook is RUNNING on.
 *
 * The block used to carry the installing machine's absolute paths —
 * `/home/<somebody>/.bun/bin/bun` and an absolute path to a checkout —
 * straight into `.husky/*`, which projects track in git. That is wrong
 * three times over: it is wrong on every other computer, it leaks a
 * username into a tracked file, and it makes the hook stop working the
 * moment the person who installed it moves their tools.
 *
 * Resolution order, cheapest and most specific first:
 *
 *  1. `DELENDAI_GUARD_CMD` — an operator's explicit override, and the
 *     escape hatch for a layout none of the rest anticipates.
 *  2. `delendai.guard.runner` / `.entry` in git config. This is where
 *     the absolute paths went. `git config` is per-clone and git never
 *     takes it FROM a repository, so a value recorded there is true for
 *     the machine that recorded it and reaches nobody else — which is
 *     exactly the property the hook file lacked. `guard install` writes
 *     it; a clone that never ran install simply falls through.
 *  3. `node_modules/.bin/delendai` under the repository root. A project
 *     that depends on delendai has this, and it is the version THAT
 *     project pinned rather than whatever happens to be on PATH.
 *  4. `delendai` on PATH, for a global install.
 *  5. The runner and entry recorded at install time — but only when the
 *     entry lives inside the repository, in which case it is stored
 *     relative to the root and the runner is a bare command name for
 *     PATH to resolve. This is what makes delendai's own checkout work,
 *     where the CLI is a source file rather than a bin.
 *
 * Nothing absolute is written into the FILE, so it is identical on every
 * machine and the same bytes for everyone who clones the project.
 */
const resolveDelendai = (invocation: IGuardInvocation): readonly string[] => {
	const lines = [
		'delendai_guard_runner=""',
		'delendai_guard_entry=""',
		'delendai_guard_root=$(git rev-parse --show-toplevel 2>/dev/null) || delendai_guard_root=.',
		'delendai_guard_configured=$(git config --get delendai.guard.runner 2>/dev/null)',
		'if [ -n "${DELENDAI_GUARD_CMD:-}" ]; then',
		'	delendai_guard_runner="$DELENDAI_GUARD_CMD"',
		'elif [ -n "$delendai_guard_configured" ]; then',
		'	delendai_guard_runner="$delendai_guard_configured"',
		'	delendai_guard_entry=$(git config --get delendai.guard.entry 2>/dev/null)',
		'elif [ -x "$delendai_guard_root/node_modules/.bin/delendai" ]; then',
		'	delendai_guard_runner="$delendai_guard_root/node_modules/.bin/delendai"',
		'elif command -v delendai >/dev/null 2>&1; then',
		'	delendai_guard_runner=delendai',
	];
	if (invocation.entry !== '') {
		lines.push(
			// The entry is single-quoted and concatenated rather than
			// interpolated into a double-quoted word: a `$` or a backtick
			// in a filename expands inside `"..."`, and a filename is
			// whatever somebody named it.
			`elif command -v ${quote(invocation.runner)} >/dev/null 2>&1 && [ -f "$delendai_guard_root"/${quote(invocation.entry)} ]; then`,
			`	delendai_guard_runner=${quote(invocation.runner)}`,
			`	delendai_guard_entry="$delendai_guard_root"/${quote(invocation.entry)}`,
		);
	}
	lines.push('fi');
	return lines;
};

/** Run the guard, whichever of the two shapes was resolved. */
const invoke = (hook: IGuardHookName, tail: string, onFail: string): string[] =>
	[
		'if [ -n "$delendai_guard_entry" ]; then',
		`	"$delendai_guard_runner" "$delendai_guard_entry" guard ${hook} "$@"${tail} || ${onFail}`,
		'else',
		`	"$delendai_guard_runner" guard ${hook} "$@"${tail} || ${onFail}`,
		'fi',
	].map((line) => line);

const MISSING = (hook: IGuardHookName): string =>
	`echo "delendai guard: delendai was not found (DELENDAI_GUARD_CMD, node_modules/.bin/delendai, or delendai on PATH); the development policy is not enforced for this ${hook}" >&2`;

/** The block for one hook, without a trailing newline. */
export const renderGuardBlock = (
	hook: IGuardHookName,
	invocation: IGuardInvocation,
): string => {
	const resolve = resolveDelendai(invocation);
	const missing = MISSING(hook);
	if (!readsStdin(hook)) {
		return [
			GUARD_BLOCK_BEGIN,
			...resolve,
			'if [ -n "$delendai_guard_runner" ]; then',
			...invoke(hook, '', 'exit 1').map((line) => `\t${line}`),
			'else',
			`\t${missing}`,
			'fi',
			GUARD_BLOCK_END,
		].join('\n');
	}
	const judged =
		hook === 'reference-transaction'
			? `[ "$1" = prepared ] && grep -qE '^00* [^ ]* refs/heads/|^[^ ]* [0-9a-f]*[1-9a-f][0-9a-f]* refs/stash$' "$delendai_guard_stdin"`
			: 'true';
	return [
		GUARD_BLOCK_BEGIN,
		...resolve,
		'delendai_guard_stdin=$(mktemp) || exit 1',
		'cat > "$delendai_guard_stdin"',
		`if ${judged}; then`,
		'\tif [ -n "$delendai_guard_runner" ]; then',
		...invoke(
			hook,
			' < "$delendai_guard_stdin"',
			'{ rm -f "$delendai_guard_stdin"; exit 1; }',
		).map((line) => `\t\t${line}`),
		'\telse',
		`\t\t${missing}`,
		'\tfi',
		'fi',
		'# The same input, for whatever this hook does next.',
		'exec 0< "$delendai_guard_stdin"',
		'rm -f "$delendai_guard_stdin"',
		GUARD_BLOCK_END,
	].join('\n');
};

/** Remove the managed block, and nothing else. */
export const removeGuardBlock = (content: string): string => {
	const begin = content.indexOf(GUARD_BLOCK_BEGIN);
	if (begin === -1) return content;
	const endMarker = content.indexOf(GUARD_BLOCK_END, begin);
	if (endMarker === -1) return content;
	let end = endMarker + GUARD_BLOCK_END.length;
	if (content[end] === '\n') end += 1;
	return content.slice(0, begin) + content.slice(end);
};

const SHELL_SHEBANG =
	/^#!\s*\/(?:usr\/)?bin\/(?:env\s+)?(?:sh|bash|dash|zsh)\b/u;

/**
 * What installing the guard does to one hook, given its current content.
 * A hook that exists but is not a shell script cannot carry a shell block;
 * it is reported, never rewritten.
 */
export const planGuardHook = (
	hook: IGuardHookName,
	current: string | undefined,
	invocation: IGuardInvocation,
): IGuardHookEdit => {
	const block = renderGuardBlock(hook, invocation);
	if (current === undefined || current.trim() === '') {
		return {
			hook,
			action: 'create',
			// The marker follows the block, the same layout an update writes,
			// so installing again finds nothing to change.
			content: `#!/bin/sh\n${block}\n${GUARD_CREATED_FILE}\n`,
		};
	}
	const firstLine = current.split('\n', 1)[0] ?? '';
	if (!SHELL_SHEBANG.test(firstLine)) {
		return {
			hook,
			action: 'unsupported',
			reason: `the existing ${hook} hook is not a shell script (${firstLine || 'no shebang'}); add \`${invocation.runner} ${invocation.entry} guard ${hook} "$@"\` to it by hand`,
		};
	}
	const without = removeGuardBlock(current);
	const rest = without.slice(firstLine.length + 1);
	const next = `${firstLine}\n${block}\n${rest}`;
	return next === current
		? { hook, action: 'unchanged' }
		: { hook, action: 'update', content: next };
};
