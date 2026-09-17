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
import { isAbsolute, join, resolve, sep } from 'node:path';

import {
	GUARD_BLOCK_BEGIN,
	GUARD_CREATED_FILE,
	type IGuardHookName,
	type IGuardInvocation,
	planGuardHook,
	removeGuardBlock,
} from '@delendai/core/cli';

import type {
	IGuardHooksReport,
	IHooksLocation,
} from '../contracts/interfaces/guard-hooks-service.interface';

export const GUARDED_HOOKS: readonly IGuardHookName[] = [
	'pre-commit',
	'reference-transaction',
	'pre-push',
];

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

const managerReason = (manager: 'lefthook' | 'husky-v9'): string =>
	manager === 'lefthook'
		? 'lefthook regenerates hook files; add a command running `delendai guard <hook> {args}` to each hook in lefthook.yml instead'
		: 'husky v9 regenerates `.husky/_`; add `delendai guard <hook> "$@"` to the matching file in `.husky/` instead';

const readHook = (path: string): string | undefined =>
	existsSync(path) ? readFileSync(path, 'utf8') : undefined;

export const installGuardHooks = (
	workspaceRoot: string,
	invocation: IGuardInvocation,
): IGuardHooksReport => {
	const location = locateHooks(workspaceRoot);
	if (location.manager !== undefined) {
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
	return {
		dir: location.dir,
		hooks: GUARDED_HOOKS.map((hook) => {
			const path = join(location.dir, hook);
			const edit = planGuardHook(hook, readHook(path), invocation);
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
	return {
		dir: location.dir,
		hooks: GUARDED_HOOKS.map((hook) => ({
			hook,
			state: readHook(join(location.dir, hook))?.includes(
				GUARD_BLOCK_BEGIN,
			)
				? 'installed'
				: 'absent',
		})),
	};
};
