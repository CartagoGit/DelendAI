/**
 * git-invocation-memo.helper.ts — what one command invocation need not ask
 * git twice.
 *
 * A `work status` asked `rev-parse --git-common-dir` fifteen times, `remote`
 * nine times and `worktree list` six, each a process. Within one invocation
 * those answers change only when git itself changes them, so this cache
 * answers the repeats and forgets on any git command that is not a known
 * read. Questions about two full object ids (`merge-base --is-ancestor`)
 * never change and are kept for the whole invocation.
 */
import type {
	IGitReadCache,
	IGitSpawn,
} from '../contracts/interfaces/git-read.interface';
import { withGitReadCache } from './git-read.helper';

const OBJECT_ID = /^[0-9a-f]{40}([0-9a-f]{24})?$/u;

/** `rev-parse` flags that locate the repository and name no revision. */
const LOCATING_FLAGS = new Set([
	'--path-format=absolute',
	'--path-format=relative',
	'--git-common-dir',
	'--git-dir',
	'--absolute-git-dir',
	'--show-toplevel',
	'--is-inside-work-tree',
]);

const isLocatingRevParse = (args: readonly string[]): boolean => {
	if (args[0] !== 'rev-parse' || args.length < 2) return false;
	for (let index = 1; index < args.length; index += 1) {
		const arg = args[index] ?? '';
		if (arg === '--git-path') {
			index += 1;
			if (index >= args.length) return false;
		} else if (!LOCATING_FLAGS.has(arg)) return false;
	}
	return true;
};

const isConfigRead = (args: readonly string[]): boolean =>
	args[0] === 'config' &&
	((args.length === 3 && args[1] === '--get') ||
		(args.length === 2 && /^[\w-]+\.[\w.-]+$/u.test(args[1] ?? '')));

/** Reads whose answer holds until a git write. */
const isRepositoryRead = (args: readonly string[]): boolean =>
	isLocatingRevParse(args) ||
	isConfigRead(args) ||
	(args[0] === 'remote' &&
		(args.length === 1 || (args.length === 3 && args[1] === 'get-url'))) ||
	(args.length === 3 &&
		args[0] === 'worktree' &&
		args[1] === 'list' &&
		args[2] === '--porcelain');

/** Reads whose answer never changes: they name object ids only. */
const isObjectRead = (args: readonly string[]): boolean =>
	args.length === 4 &&
	args[0] === 'merge-base' &&
	args[1] === '--is-ancestor' &&
	OBJECT_ID.test(args[2] ?? '') &&
	OBJECT_ID.test(args[3] ?? '');

/** Git commands that change nothing a remembered read answers. */
const READ_ONLY = new Set([
	'cat-file',
	'check-ignore',
	'check-ref-format',
	'diff',
	'diff-tree',
	'for-each-ref',
	'hash-object',
	'log',
	'ls-files',
	'ls-remote',
	'ls-tree',
	'merge-base',
	'merge-tree',
	'name-rev',
	'rev-list',
	'rev-parse',
	'show',
	'show-ref',
	'status',
	'var',
]);

const changesNothing = (args: readonly string[]): boolean => {
	const command = args[0] ?? '';
	if (command === 'hash-object') return !args.includes('-w');
	if (command === 'merge-tree') return !args.includes('--write-tree');
	if (command === 'stash') return args[1] === 'list';
	if (command === 'symbolic-ref')
		return (
			args
				.slice(1)
				.every((arg) => arg.startsWith('-') || arg === 'HEAD') &&
			!args.includes('-d') &&
			!args.includes('--delete')
		);
	return READ_ONLY.has(command);
};

const keyOf = ({ cwd, args }: IGitSpawn): string =>
	`${cwd}\u0000${args.join('\u0000')}`;

/** A fresh cache for one invocation. */
export const createGitInvocationMemo = (): IGitReadCache => {
	const repository = new Map<string, string | undefined>();
	const objects = new Map<string, string | undefined>();
	return {
		recall: (spawn) => {
			const key = keyOf(spawn);
			if (isObjectRead(spawn.args))
				return objects.has(key)
					? { output: objects.get(key) }
					: undefined;
			if (isRepositoryRead(spawn.args))
				return repository.has(key)
					? { output: repository.get(key) }
					: undefined;
			return undefined;
		},
		remember: (spawn, output) => {
			if (isObjectRead(spawn.args)) objects.set(keyOf(spawn), output);
			else if (isRepositoryRead(spawn.args))
				repository.set(keyOf(spawn), output);
		},
		ran: (spawn) => {
			if (isRepositoryRead(spawn.args) || changesNothing(spawn.args))
				return;
			repository.clear();
		},
	};
};

/** Run one invocation with its own memo of git reads. */
export const withGitInvocationMemo = <T>(body: () => T): T =>
	withGitReadCache(createGitInvocationMemo(), body);
