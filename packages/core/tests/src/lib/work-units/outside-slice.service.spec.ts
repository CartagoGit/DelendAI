import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';
import {
	isNamed,
	namedFiles,
	unitsOutsideTheirSlice,
} from '@delendai/core/lib/work-units/outside-slice.service';

const policy = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: { namespacePrefix: 'delendai' },
	},
});

const PROPOSAL = [
	'## slices',
	'### S1 — one',
	'- **Files**: `src/a.ts`, `src/lib/`',
	'### S2 — two',
	'- **Files**: `tests/**/*.spec.ts`',
].join('\n');

describe('the files a proposal names', () => {
	it('reads every Files line', () => {
		expect(namedFiles(PROPOSAL)).toEqual([
			'src/a.ts',
			'src/lib/',
			'tests/**/*.spec.ts',
		]);
	});

	it('matches a file by name, by folder and by glob', () => {
		const named = namedFiles(PROPOSAL);
		expect(isNamed('src/a.ts', named)).toBe(true);
		expect(isNamed('src/lib/deep/b.ts', named)).toBe(true);
		expect(isNamed('tests/x/y.spec.ts', named)).toBe(true);
		expect(isNamed('tests/y.spec.ts', named)).toBe(true);
		expect(isNamed('src/b.ts', named)).toBe(false);
	});
});

describe('unitsOutsideTheirSlice', () => {
	it('names the files an implement unit changed that its proposal does not', () => {
		const root = mkdtempSync(join(tmpdir(), 'outside-slice-'));
		const git = (...args: string[]): string =>
			execFileSync(
				'git',
				['-c', 'user.email=t@t', '-c', 'user.name=t', ...args],
				{ cwd: root, encoding: 'utf8' },
			).trim();
		git('init', '-q', '-b', 'develop');
		const dir = join(root, 'docs/delendai/proposals/ready/fixes');
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, 'x00001-demo.md'), `${PROPOSAL}\n`);
		git('add', '-A');
		git('commit', '-q', '-m', 'proposal');
		const tip = git('rev-parse', 'HEAD');
		const unit = (ref: string) => ({
			ref,
			agent: 'a',
			subject: '',
			tip,
			ahead: 1,
			behind: 0,
			paths: [
				'src/a.ts',
				'src/other.ts',
				'docs/delendai/proposals/ready/fixes/x00001-demo.md',
			],
		});
		expect(
			unitsOutsideTheirSlice({
				root,
				docsDir: 'docs/delendai',
				policy,
				units: [
					unit('delendai/wip/a/implement/x00001-S1-g1/t'),
					unit('delendai/wip/a/review/x00001-S1-g1/t'),
				],
			}),
		).toEqual([
			{
				ref: 'delendai/wip/a/implement/x00001-S1-g1/t',
				files: ['src/other.ts'],
			},
		]);
	});
});
