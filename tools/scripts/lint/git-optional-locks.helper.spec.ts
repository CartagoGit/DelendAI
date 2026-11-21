import { describe, expect, it } from 'vitest';

import {
	dropsInheritedEnvironment,
	installsOptionalLocksDefault,
	spawnsGit,
} from './git-optional-locks.helper';

describe('spawnsGit', () => {
	it('sees the ways git is started', () => {
		expect(spawnsGit("execFileSync('git', ['status'])")).toBe(true);
		expect(spawnsGit('spawnSync("git", args)')).toBe(true);
		expect(spawnsGit("Bun.spawn(['git', 'status'])")).toBe(true);
		expect(spawnsGit("execFileSync('node', [])")).toBe(false);
	});
});

describe('dropsInheritedEnvironment', () => {
	it('flags an env object that spreads nothing in', () => {
		expect(
			dropsInheritedEnvironment(
				"execFileSync('git', [], { env: { PATH: '/bin' } })",
			),
		).toBe(true);
	});

	it('accepts a spread, a variable, or no env at all', () => {
		expect(
			dropsInheritedEnvironment(
				"execFileSync('git', [], { env: { ...process.env, A: '1' } })",
			),
		).toBe(false);
		expect(
			dropsInheritedEnvironment(
				"execFileSync('git', [], { env: gitEnvironmentFor(cwd) })",
			),
		).toBe(false);
		expect(dropsInheritedEnvironment("execFileSync('git', [])")).toBe(
			false,
		);
	});

	it('ignores an env object in a file that starts no git', () => {
		expect(
			dropsInheritedEnvironment("spawn('node', [], { env: { A: '1' } })"),
		).toBe(false);
	});
});

describe('installsOptionalLocksDefault', () => {
	it('reads the call', () => {
		expect(
			installsOptionalLocksDefault('applyGitOptionalLocksDefault();'),
		).toBe(true);
		expect(installsOptionalLocksDefault('nothing')).toBe(false);
	});
});
