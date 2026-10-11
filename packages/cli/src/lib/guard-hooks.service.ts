/**
 * Install, remove and inspect the development-policy guard in a project's
 * git hooks, beside whatever hooks the project already has.
 */
import { execFileSync } from 'node:child_process';
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';

import {
	GUARD_BLOCK_BEGIN,
	GUARD_CREATED_FILE,
	type IGuardInvocation,
	planGuardHook,
	removeGuardBlock,
} from '@delendai/core/cli';

import type {
	IGuardHooksReport,
	IHooksLocation,
} from '../contracts/interfaces/guard-hooks-service.interface';
import { GUARDED_HOOKS } from '../contracts/constants/guard-hooks.constant';

const EXECUTABLE = 0o755;
const LEFTHOOK_CONFIGS = [
	'lefthook.yml',
	'lefthook.yaml',
	'.lefthook.yml',
	'.lefthook.yaml',
];

/** The hooks directory git runs, honouring `core.hooksPath`. */
export const locateHooks = (workspaceRoot: string): IHooksLocation => {
	const raw = execFileSync('git', ['rev-parse', '--git-path', 'hooks'], {
		cwd: workspaceRoot,
		encoding: 'utf8',
	}).trim();
	const dir = isAbsolute(raw) ? raw : resolve(workspaceRoot, raw);
	if (
		LEFTHOOK_CONFIGS.some((name) => existsSync(join(workspaceRoot, name)))
	) {
		return { dir, manager: 'lefthook' };
	}
	if (dir.endsWith(`${sep}.husky${sep}_`) || dir.endsWith('/.husky/_')) {
		return { dir, manager: 'husky-v9' };
	}
	return { dir };
};

/**
 * The hooks a lefthook configuration declares: its top-level keys. Read as
 * text, because a key at column zero is all lefthook needs to own a hook,
 * and a YAML parser would be a dependency for one question.
 */
export const lefthookConfiguredHooks = (
	workspaceRoot: string,
): ReadonlySet<string> => {
	const hooks = new Set<string>();
	for (const name of LEFTHOOK_CONFIGS) {
		const text = readHook(join(workspaceRoot, name));
		if (text === undefined) continue;
		for (const match of text.matchAll(/^([a-z][a-z-]*):/gmu)) {
			const key = match[1];
			if (key !== undefined) hooks.add(key);
		}
	}
	return hooks;
};

/** Hooks whose guard may be asked under another hook's name. */
const GUARD_HOOK_ALIASES: Readonly<Record<string, readonly string[]>> = {
	'commit-msg': ['pre-commit'],
};

/**
 * Whether lefthook runs `guard <hook>` in that hook's section: the way a
 * lefthook project installs the guard, since lefthook regenerates the hook
 * files and a block written into them would not survive.
 */
export const lefthookRunsGuard = (
	workspaceRoot: string,
	hook: string,
): boolean => {
	for (const name of LEFTHOOK_CONFIGS) {
		const text = readHook(join(workspaceRoot, name));
		if (text === undefined) continue;
		const start = text.search(new RegExp(`^${hook}:`, 'mu'));
		if (start === -1) continue;
		const rest = text.slice(start + hook.length + 1);
		const end = rest.search(/^[a-z][a-z-]*:/mu);
		const section = end === -1 ? rest : rest.slice(0, end);
		// `commit-msg` judges the commit `pre-commit` judges, and a project
		// may ask it under that name (older CLIs know no other).
		const names = [hook, ...(GUARD_HOOK_ALIASES[hook] ?? [])];
		if (
			names.some((name) =>
				new RegExp(`\\bguard\\s+${name}\\b`, 'u').test(section),
			)
		)
			return true;
	}
	return false;
};

export const managerReason = (manager: 'lefthook' | 'husky-v9'): string =>
	manager === 'lefthook'
		? 'lefthook regenerates hook files; add a command running `delendai guard <hook> {args}` to each hook in lefthook.yml instead'
		: 'husky v9 regenerates `.husky/_`; add `delendai guard <hook> "$@"` to the matching file in `.husky/` instead';

const readHook = (path: string): string | undefined =>
	existsSync(path) ? readFileSync(path, 'utf8') : undefined;

/**
 * Strip the installing machine out of the invocation.
 *
 * Whatever this process was started as — an absolute path under
 * somebody's home directory, into their own checkout — is true here and
 * nowhere else.
 * The hook files are TRACKED in the project, so anything machine-specific
 * in them is wrong for every colleague and leaks a username besides.
 *
 * The runner keeps only its command name, for PATH to resolve. The entry
 * is kept only when it lives inside this repository, and then only as a
 * path relative to the root; an entry from somewhere else is dropped
 * entirely, and the hook finds delendai through `node_modules/.bin` or
 * PATH like any other consumer would.
 */
export const portableInvocation = (
	workspaceRoot: string,
	invocation: IGuardInvocation,
): IGuardInvocation => {
	const inside = relative(resolve(workspaceRoot), resolve(invocation.entry));
	return {
		runner: basename(invocation.runner),
		entry:
			inside.startsWith('..') || isAbsolute(inside) || inside === ''
				? ''
				: inside.split(sep).join('/'),
	};
};

/**
 * The entry as the clone can keep reaching it. One run from inside a
 * unit's worktree names that worktree's CLI, and the worktree is removed
 * when the unit lands: every hook of the clone then called a file that
 * was gone. The same path in the main checkout outlives every unit.
 */
export const durableEntry = (workspaceRoot: string, entry: string): string => {
	let listed = '';
	try {
		listed = execFileSync('git', ['worktree', 'list', '--porcelain'], {
			cwd: workspaceRoot,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		});
	} catch {
		return entry;
	}
	const worktrees = listed
		.split('\n')
		.filter((line) => line.startsWith('worktree '))
		.map((line) => resolve(line.slice('worktree '.length)));
	const [main, ...linked] = worktrees;
	if (main === undefined) return entry;
	const absolute = resolve(entry);
	const holder = linked.find((path) => absolute.startsWith(`${path}${sep}`));
	if (holder === undefined) return entry;
	const twin = join(main, relative(holder, absolute));
	return existsSync(twin) ? twin : entry;
};

/** The per-clone keys that say how the guard reaches the CLI. */
const GUARD_CONFIG_KEYS = [
	'delendai.guard.runner',
	'delendai.guard.entry',
] as const;

/**
 * Forget how this machine reached the CLI. Removing the hooks and leaving
 * these left the clone saying it was guarded, to anything that reads its
 * config, after the guard was gone.
 */
const forgetGuardCommand = (workspaceRoot: string): void => {
	for (const key of GUARD_CONFIG_KEYS) {
		try {
			execFileSync('git', ['config', '--local', '--unset-all', key], {
				cwd: workspaceRoot,
				stdio: 'ignore',
			});
		} catch {
			// Already absent: nothing to forget.
		}
	}
};

/** Remember, per clone, exactly how this machine reaches the CLI. */
const recordGuardCommand = (
	workspaceRoot: string,
	invocation: IGuardInvocation,
): void => {
	for (const [key, value] of [
		['delendai.guard.runner', invocation.runner],
		['delendai.guard.entry', invocation.entry],
	] as const) {
		try {
			execFileSync('git', ['config', '--local', key, value], {
				cwd: workspaceRoot,
				stdio: 'ignore',
			});
		} catch {
			// A repository that will not take local config still gets the
			// hooks; they fall through to node_modules/.bin or PATH.
		}
	}
};

export const installGuardHooks = (
	workspaceRoot: string,
	invocation: IGuardInvocation,
): IGuardHooksReport => {
	const portable = portableInvocation(workspaceRoot, invocation);
	const location = locateHooks(workspaceRoot);
	if (location.manager === 'husky-v9') {
		const reason = managerReason(location.manager);
		return {
			dir: location.dir,
			hooks: GUARDED_HOOKS.map((hook) => ({
				hook,
				state: 'unsupported',
				reason,
			})),
		};
	}
	mkdirSync(location.dir, { recursive: true });
	// The absolute paths go HERE, not into the hook file.
	//
	// `.git/config` is per-clone and git never takes it from a
	// repository, so what is recorded is true for this machine and
	// reaches nobody else. That is the property the tracked hook file
	// could never have, and the reason it used to carry somebody's home
	// directory to all of their colleagues.
	recordGuardCommand(workspaceRoot, {
		...invocation,
		entry: durableEntry(workspaceRoot, invocation.entry),
	});
	// Under lefthook, the hooks it declares are its own: it rewrites those
	// files, so they stay `unsupported` with the instruction to add the
	// guard to lefthook.yml. A hook it does not declare is not its file,
	// and lives in `.git/hooks`, which git never takes from the
	// repository, so installing it there adds nothing to anybody's commits.
	const managed =
		location.manager === 'lefthook'
			? lefthookConfiguredHooks(workspaceRoot)
			: new Set<string>();
	return {
		dir: location.dir,
		hooks: GUARDED_HOOKS.map((hook) => {
			if (managed.has(hook)) {
				// Already guarded through lefthook.yml: nothing to add.
				if (lefthookRunsGuard(workspaceRoot, hook)) {
					return { hook, state: 'unchanged' };
				}
				return {
					hook,
					state: 'unsupported',
					reason: managerReason('lefthook'),
				};
			}
			const path = join(location.dir, hook);
			const edit = planGuardHook(hook, readHook(path), portable);
			if (edit.action === 'unsupported') {
				return { hook, state: 'unsupported', reason: edit.reason };
			}
			if (edit.action === 'unchanged')
				return { hook, state: 'unchanged' };
			writeFileSync(path, edit.content);
			chmodSync(path, EXECUTABLE);
			return {
				hook,
				state: edit.action === 'create' ? 'created' : 'updated',
			};
		}),
	};
};

export const uninstallGuardHooks = (
	workspaceRoot: string,
): IGuardHooksReport => {
	const location = locateHooks(workspaceRoot);
	forgetGuardCommand(workspaceRoot);
	return {
		dir: location.dir,
		hooks: GUARDED_HOOKS.map((hook) => {
			const path = join(location.dir, hook);
			const current = readHook(path);
			if (current === undefined || !current.includes(GUARD_BLOCK_BEGIN)) {
				return { hook, state: 'absent' };
			}
			// A hook file the guard created goes away with it; any other
			// hook gets back exactly what it had.
			if (current.includes(GUARD_CREATED_FILE)) rmSync(path);
			else writeFileSync(path, removeGuardBlock(current));
			return { hook, state: 'removed' };
		}),
	};
};

export const inspectGuardHooks = (workspaceRoot: string): IGuardHooksReport => {
	const location = locateHooks(workspaceRoot);
	const lefthook = location.manager === 'lefthook';
	return {
		dir: location.dir,
		hooks: GUARDED_HOOKS.map((hook) => {
			const installed =
				readHook(join(location.dir, hook))?.includes(
					GUARD_BLOCK_BEGIN,
				) === true ||
				(lefthook && lefthookRunsGuard(workspaceRoot, hook));
			// Under lefthook a missing guard is fixed in its configuration;
			// `guard install` would write a block lefthook overwrites.
			return installed
				? { hook, state: 'installed' as const }
				: lefthook && lefthookConfiguredHooks(workspaceRoot).has(hook)
					? {
							hook,
							state: 'absent' as const,
							reason: managerReason('lefthook'),
						}
					: { hook, state: 'absent' as const };
		}),
	};
};
