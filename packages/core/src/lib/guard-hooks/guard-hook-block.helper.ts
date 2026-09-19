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
 *   so the CLI is started only when a local branch is being created.
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

/** The block for one hook, without a trailing newline. */
export const renderGuardBlock = (
	hook: IGuardHookName,
	invocation: IGuardInvocation,
): string => {
	const runner = quote(invocation.runner);
	const entry = quote(invocation.entry);
	const available = `command -v ${runner} >/dev/null 2>&1 && [ -f ${entry} ]`;
	const missing = `echo "delendai guard: ${invocation.runner} or ${invocation.entry} is missing; the development policy is not enforced for this ${hook}" >&2`;
	if (!readsStdin(hook)) {
		return [
			GUARD_BLOCK_BEGIN,
			`if ${available}; then`,
			`	${runner} ${entry} guard ${hook} "$@" || exit 1`,
			'else',
			`	${missing}`,
			'fi',
			GUARD_BLOCK_END,
		].join('\n');
	}
	const judged =
		hook === 'reference-transaction'
			? `[ "$1" = prepared ] && grep -q '^00* [^ ]* refs/heads/' "$delendai_guard_stdin"`
			: 'true';
	return [
		GUARD_BLOCK_BEGIN,
		'delendai_guard_stdin=$(mktemp) || exit 1',
		'cat > "$delendai_guard_stdin"',
		`if ${judged}; then`,
		`	if ${available}; then`,
		`		${runner} ${entry} guard ${hook} "$@" < "$delendai_guard_stdin" || { rm -f "$delendai_guard_stdin"; exit 1; }`,
		'	else',
		`		${missing}`,
		'	fi',
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
