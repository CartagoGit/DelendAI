/**
 * git-invocation-memo.helper.ts — what one command invocation need not ask
 * git twice.
 *
 * A `work status` asked `rev-parse --git-common-dir` fifteen times, `remote`
 * nine times and `worktree list` six, each a process. Within one invocation
 * those answers change only when git itself changes them, so this cache
 * answers the repeats and forgets on any git command that is not a known
 * read. Questions about two full object ids (`merge-base --is-ancestor`)
 * never change and are kept for the whole invocation. The shared worktree
 * status and `ls-remote` are repository reads too: a write here (a commit,
 * a push) is what changes their answer within one invocation.
 */
import type {
	IGitReadCache,
	IGitSpawn,
} from '../contracts/interfaces/git-read.interface';
import { withGitReadCache } from './git-read.helper';
import { WORKTREE_STATUS_ARGS } from '../contracts/constants/worktree-status.constant';

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

/** `rev-parse` flags that resolve one name without changing anything. */
const RESOLVING_FLAGS = new Set([
	'-q',
	'--quiet',
	'--verify',
	'--short',
	'--abbrev-ref',
	'--symbolic-full-name',
]);

/** `rev-parse [-q] [--verify] <name>`: one name, read flags only. */
const isRefResolve = (args: readonly string[]): boolean =>
	args[0] === 'rev-parse' &&
	args.slice(1).filter((arg) => !RESOLVING_FLAGS.has(arg)).length === 1 &&
	!args
		.slice(1)
		.some((arg) => arg.startsWith('-') && !RESOLVING_FLAGS.has(arg));

const SYMBOLIC_REF_READ_FLAGS = new Set(['-q', '--quiet', '--short']);

/**
 * `symbolic-ref [-q] [--short] <name>`: one name and read flags only. Two
 * names (`symbolic-ref <name> <target>`) or `-d` write.
 */
const isSymbolicRefRead = (args: readonly string[]): boolean =>
	args[0] === 'symbolic-ref' &&
	args.slice(1).filter((arg) => !arg.startsWith('-')).length === 1 &&
	args
		.slice(1)
		.every(
			(arg) => !arg.startsWith('-') || SYMBOLIC_REF_READ_FLAGS.has(arg),
		);

/**
 * Commands that read history and objects, never the working tree: their
 * answer changes only when a ref they name moves.
 */
const HISTORY_READS = new Set([
	'cat-file',
	'diff-tree',
	'log',
	'ls-tree',
	'merge-base',
	'rev-list',
	'show',
]);

/** Flags that make a history read depend on every ref, or on input. */
const REF_WIDE_FLAGS =
	/^--(all|branches|tags|remotes|glob|exclude|stdin|reflog|batch)/u;

const isHistoryRead = (args: readonly string[]): boolean =>
	HISTORY_READS.has(args[0] ?? '') &&
	!args.some((arg) => REF_WIDE_FLAGS.test(arg));

/** `<oid>`, `<oid>^{tree}`, `<oid>:<path>`, `<oid>..<oid>` or `<oid>...<oid>`. */
const OBJECT_SPEC =
	/^[0-9a-f]{40}(?:[0-9a-f]{24})?(?:\^\{tree\}|:.*|\.{2,3}[0-9a-f]{40}(?:[0-9a-f]{24})?)?$/u;

/** Every revision a history read names is a full object id. */
const namesObjectsOnly = (args: readonly string[]): boolean => {
	const paths = args.indexOf('--');
	const revisions = (paths === -1 ? args : args.slice(0, paths))
		.slice(1)
		.filter((arg) => !arg.startsWith('-'));
	return (
		revisions.length > 0 &&
		revisions.every((revision) => OBJECT_SPEC.test(revision))
	);
};

/** The status every dirty-state reader shares (worktree-status.helper). */
const isWorktreeStatus = (args: readonly string[]): boolean =>
	args.length === WORKTREE_STATUS_ARGS.length &&
	args.every((arg, index) => arg === WORKTREE_STATUS_ARGS[index]);

/** Reads whose answer holds until a git write. */
const isRepositoryRead = (args: readonly string[]): boolean =>
	isLocatingRevParse(args) ||
	isWorktreeStatus(args) ||
	args[0] === 'ls-remote' ||
	isRefResolve(args) ||
	isSymbolicRefRead(args) ||
	args[0] === 'for-each-ref' ||
	args[0] === 'show-ref' ||
	isConfigRead(args) ||
	(args[0] === 'remote' &&
		(args.length === 1 || (args.length === 3 && args[1] === 'get-url'))) ||
	(args.length === 3 &&
		args[0] === 'worktree' &&
		args[1] === 'list' &&
		args[2] === '--porcelain') ||
	isHistoryRead(args);

/** Reads whose answer never changes: they name object ids only. */
const isObjectRead = (args: readonly string[]): boolean =>
	(args.length === 4 &&
		args[0] === 'merge-base' &&
		args[1] === '--is-ancestor' &&
		OBJECT_ID.test(args[2] ?? '') &&
		OBJECT_ID.test(args[3] ?? '')) ||
	(isHistoryRead(args) && namesObjectsOnly(args));

const isSelfAncestry = (args: readonly string[]): boolean =>
	args[0] === 'merge-base' &&
	args[1] === '--is-ancestor' &&
	args[2] === args[3];

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

/**
 * Commands that only add objects: a new object changes no answer a
 * remembered read gave, since every read names refs or objects that
 * already existed.
 */
const OBJECT_WRITES = new Set(['commit-tree', 'mktree', 'write-tree']);

/** The command after any leading `-c key=value` pairs. */
const commandOf = (args: readonly string[]): readonly string[] => {
	let at = 0;
	while (args[at] === '-c') at += 2;
	return args.slice(at);
};

const changesNothing = (given: readonly string[]): boolean => {
	const args = commandOf(given);
	const command = args[0] ?? '';
	if (OBJECT_WRITES.has(command)) return true;
	if (command === 'hash-object') return !args.includes('-w');
	if (command === 'merge-tree') return !args.includes('--write-tree');
	if (command === 'stash') return args[1] === 'list';
	return READ_ONLY.has(command);
};

const keyOf = ({ cwd, args }: IGitSpawn): string =>
	`${cwd}\u0000${args.join('\u0000')}`;

/** A fresh cache for one invocation. */
/**
 * `worktree add` of a branch that exists, `worktree remove` and `prune`:
 * they change which worktrees there are, never a ref or an object.
 */
const isWorktreeChange = (args: readonly string[]): boolean =>
	args[0] === 'worktree' &&
	(args[1] === 'remove' ||
		args[1] === 'prune' ||
		(args[1] === 'add' &&
			!args.some((arg) => ['-b', '-B', '--orphan'].includes(arg))));

/** Remembered reads a worktree change can alter. */
const readsWorktrees = (args: readonly string[]): boolean =>
	args[0] === 'worktree' ||
	isWorktreeStatus(args) ||
	args.some((arg) => arg.includes('worktreepath'));

export const createGitInvocationMemo = (): IGitReadCache => {
	const repository = new Map<string, string | undefined>();
	const asked = new Map<string, IGitSpawn>();
	const objects = new Map<string, string | undefined>();
	return {
		recall: (spawn) => {
			// A commit is its own ancestor: nothing to ask.
			if (isObjectRead(spawn.args) && isSelfAncestry(spawn.args))
				return { output: '' };
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
			else if (isRepositoryRead(spawn.args)) {
				repository.set(keyOf(spawn), output);
				asked.set(keyOf(spawn), spawn);
			}
		},
		ran: (spawn) => {
			if (isRepositoryRead(spawn.args) || changesNothing(spawn.args))
				return;
			// `send-pack` moves refs on the remote only: what the remote
			// said is forgotten, nothing asked of this repository is.
			const remoteOnly = commandOf(spawn.args)[0] === 'send-pack';
			if (!remoteOnly && !isWorktreeChange(spawn.args)) {
				repository.clear();
				asked.clear();
				return;
			}
			// Forget what lists worktrees, and everything asked inside the
			// one removed; the refs every other read named did not move.
			const removed =
				spawn.args[1] === 'remove' ? spawn.args.at(-1) : undefined;
			for (const [key, read] of asked) {
				if (
					(remoteOnly
						? read.args[0] === 'ls-remote'
						: readsWorktrees(read.args)) ||
					(removed !== undefined && read.cwd.startsWith(removed))
				) {
					repository.delete(key);
					asked.delete(key);
				}
			}
		},
	};
};

/** Run one invocation with its own memo of git reads. */
export const withGitInvocationMemo = <T>(body: () => T): T =>
	withGitReadCache(createGitInvocationMemo(), body);
