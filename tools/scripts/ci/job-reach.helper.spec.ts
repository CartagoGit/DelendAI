import { describe, expect, it } from 'vitest';

import { jobsReached, scriptFilesOf } from './job-reach.helper';

const SCRIPTS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
	'.': {
		'lint:job:docs': 'bun run lint:a && bun run lint:b',
		'lint:a': 'bun tools/scripts/lint/a.script.ts --strict',
		'lint:b': "bun tools/scripts/lib/lock.script.ts b -- 'bun tools/b.ts'",
		'lint:vscode': 'bun run --cwd extensions/vscode check',
		'lint:brand': 'cd extensions/vscode && bun scripts/logo.ts',
	},
	'extensions/vscode': { check: 'bun scripts/check.ts' },
};

const EXISTING = new Set([
	'tools/scripts/lint/a.script.ts',
	'tools/scripts/lib/lock.script.ts',
	'tools/b.ts',
	'tools/scripts/lint/run-together.script.ts',
	'extensions/vscode/scripts/check.ts',
	'extensions/vscode/scripts/logo.ts',
]);

const filesOf = (text: string) =>
	scriptFilesOf({
		text,
		scriptsAt: (dir) => SCRIPTS[dir] ?? {},
		exists: (path) => EXISTING.has(path),
	});

describe('scriptFilesOf', () => {
	it('follows the package scripts a job names, through a lock wrapper', () => {
		expect(
			filesOf(
				'set -euo pipefail\nbun tools/scripts/lint/run-together.script.ts lint:job:docs',
			),
		).toEqual([
			'tools/b.ts',
			'tools/scripts/lib/lock.script.ts',
			'tools/scripts/lint/a.script.ts',
			'tools/scripts/lint/run-together.script.ts',
		]);
	});

	it('follows a --cwd and a cd into another package', () => {
		expect(filesOf('bun run lint:vscode')).toEqual([
			'extensions/vscode/scripts/check.ts',
		]);
		expect(filesOf('bun run lint:brand')).toEqual([
			'extensions/vscode/scripts/logo.ts',
		]);
	});

	it('answers nothing it can vouch for when a named script is missing', () => {
		expect(filesOf('bun tools/scripts/gone.script.ts')).toBeUndefined();
	});
});

describe('jobsReached', () => {
	const scripts = new Map<string, readonly string[] | undefined>([
		['lint-docs', ['tools/scripts/lint/a.script.ts']],
		['lint-governance', ['tools/scripts/lint/g.script.ts']],
		['lint-unknown', undefined],
	]);

	it('reaches the jobs whose scripts the change reaches by symbol', () => {
		expect([
			...jobsReached({
				reachedFiles: new Set([
					'packages/core/src/x.ts',
					'tools/scripts/lint/a.script.ts',
				]),
				changed: ['packages/core/src/x.ts'],
				scripts,
			}),
		]).toEqual(['lint-docs', 'lint-unknown']);
	});

	it('reaches a job with unresolved scripts only through a change to code', () => {
		expect([
			...jobsReached({
				reachedFiles: new Set(),
				changed: ['docs/a.md'],
				scripts,
			}),
		]).toEqual([]);
	});
});
