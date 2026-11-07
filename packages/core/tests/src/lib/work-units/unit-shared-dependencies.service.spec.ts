import { execFileSync } from 'node:child_process';
import {
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readlinkSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { installUnitDependencies } from '../../../../src/lib/work-units/unit-dependencies.service';
import { linkSharedDependencies } from '../../../../src/lib/work-units/unit-shared-dependencies.service';

const git = (cwd: string, ...args: string[]): void => {
	execFileSync('git', args, { cwd, stdio: 'ignore' });
};

describe('a unit with the shared checkout lockfile', () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const dir of dirs.splice(0))
			rmSync(dir, { recursive: true, force: true });
	});

	/** A clone with its modules, and a worktree of it holding `lock`. */
	const clone = (lock: string): { shared: string; unit: string } => {
		const base = realpathSync(mkdtempSync(join(tmpdir(), 'unit-link-')));
		dirs.push(base);
		const shared = join(base, 'shared');
		mkdirSync(join(shared, 'packages', 'core', 'node_modules'), {
			recursive: true,
		});
		mkdirSync(join(shared, 'node_modules', '.bun', 'left-pad'), {
			recursive: true,
		});
		writeFileSync(
			join(shared, 'node_modules', '.bun', 'left-pad', 'x'),
			'shared',
		);
		mkdirSync(join(shared, 'node_modules', '@delendai'), {
			recursive: true,
		});
		mkdirSync(join(shared, 'node_modules', '.cache'));
		symlinkSync('.bun/left-pad', join(shared, 'node_modules', 'left-pad'));
		symlinkSync(
			'../../packages/core',
			join(shared, 'node_modules', '@delendai', 'core'),
		);
		symlinkSync(
			'../../../node_modules/.bun/left-pad',
			join(shared, 'packages', 'core', 'node_modules', 'left-pad'),
		);
		writeFileSync(join(shared, 'packages', 'core', 'package.json'), '{}');
		writeFileSync(join(shared, 'bun.lock'), '{}');
		writeFileSync(join(shared, '.gitignore'), 'node_modules\n');
		git(base, 'init', '-q', shared);
		git(shared, 'add', '-A');
		git(
			shared,
			'-c',
			'user.name=t',
			'-c',
			'user.email=t@t',
			'commit',
			'-qm',
			'init',
		);
		const unit = join(base, 'unit');
		git(shared, 'worktree', 'add', '-q', '-b', 'unit', unit);
		writeFileSync(join(unit, 'bun.lock'), lock);
		return { shared, unit };
	};

	it('links the shared modules and keeps workspace links on its own sources', async () => {
		const { shared, unit } = clone('{}');
		expect(await installUnitDependencies(unit, {})).toEqual({
			status: 'linked',
			from: shared,
		});
		const modules = join(unit, 'node_modules');
		expect(lstatSync(modules).isSymbolicLink()).toBe(false);
		expect(readlinkSync(join(modules, '.bun'))).toBe(
			join(shared, 'node_modules', '.bun'),
		);
		expect(readlinkSync(join(modules, '@delendai', 'core'))).toBe(
			'../../packages/core',
		);
		expect(existsSync(join(modules, '.cache'))).toBe(false);
		expect(
			readFileSync(
				join(unit, 'packages', 'core', 'node_modules', 'left-pad', 'x'),
				'utf8',
			),
		).toBe('shared');
	});

	it('installs, and links nothing, when the lockfile differs', async () => {
		const { unit } = clone('{"changed":true}');
		expect(await linkSharedDependencies(unit)).toBeUndefined();
		expect(existsSync(join(unit, 'node_modules'))).toBe(false);
	});
});
