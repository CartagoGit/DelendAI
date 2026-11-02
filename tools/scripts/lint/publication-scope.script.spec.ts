/**
 * The gate that would have caught three contaminated candidates.
 *
 * A file named `node_modules`, whose content was
 * `/home/cartago/_projects/delendai/node_modules`, reached three open
 * publication candidates independently. It was a symlink made in a
 * scratch worktree to share one install, and `git add -A` took it as a
 * blob. Merging any of them would have put a FILE by that name at the
 * root of the integration branch.
 *
 * The cases are deliberately few. A scope gate that guesses at intent
 * gets turned off, and a gate that is off catches nothing — so the
 * second half of this file is about what it must NOT flag.
 */

import { describe, expect, it } from 'vitest';

import { judgePath, scopeViolations } from './publication-scope.script';

describe('judgePath — what may never travel', () => {
	// The exact shape that happened.
	it('flags a file named node_modules', () => {
		expect(
			judgePath({
				path: 'node_modules',
				content: '/home/cartago/_projects/delendai/node_modules',
			})?.code,
		).toBe('DEPENDENCY_TREE');
	});

	it('flags anything inside a dependency tree', () => {
		expect(
			judgePath({ path: 'packages/core/node_modules/a.js' })?.code,
		).toBe('DEPENDENCY_TREE');
	});

	// Content, not name: a symlink is a file whose content is a path,
	// and it is the content that says which machine it belongs to.
	it('flags a file whose content is an absolute host path', () => {
		expect(
			judgePath({ path: 'some-link', content: '/home/someone/thing' })
				?.code,
		).toBe('HOST_ABSOLUTE_PATH');
	});

	it('flags a Windows host path too', () => {
		expect(
			judgePath({ path: 'some-link', content: 'C:\\Users\\me\\thing' })
				?.code,
		).toBe('HOST_ABSOLUTE_PATH');
	});

	it('flags git internals', () => {
		expect(judgePath({ path: '.git/config' })?.code).toBe('VCS_INTERNALS');
	});

	it('flags a derived artifact of one run', () => {
		expect(judgePath({ path: '.cache/coverage/x.json' })?.code).toBe(
			'LOCAL_ARTIFACT',
		);
	});
});

describe('judgePath — what it must leave alone', () => {
	it('says nothing about source', () => {
		expect(
			judgePath({
				path: 'packages/core/src/lib/a.ts',
				content: 'export',
			}),
		).toBeUndefined();
	});

	it('says nothing about a doc that merely mentions a path', () => {
		expect(
			judgePath({
				path: 'docs/guide.md',
				content: 'Run it from /home/you/project to see the output.',
			}),
		).toBeUndefined();
	});

	it('says nothing about a config naming a cache directory', () => {
		expect(
			judgePath({
				path: 'vitest.config.ts',
				content: "reportsDirectory: '.cache/coverage'",
			}),
		).toBeUndefined();
	});

	// `.gitignore` lists exactly the things this gate refuses, and is
	// itself perfectly good source.
	it('says nothing about .gitignore', () => {
		expect(
			judgePath({
				path: '.gitignore',
				content: 'node_modules\n.cache\n',
			}),
		).toBeUndefined();
	});
});

describe('scopeViolations', () => {
	it('reports every offender and nothing else', () => {
		const found = scopeViolations([
			{ path: 'packages/core/src/a.ts', content: 'export const a = 1;' },
			{ path: 'node_modules', content: '/home/x/node_modules' },
			{ path: 'README.md', content: '# hello' },
		]);
		expect(found.map((each) => each.path)).toEqual(['node_modules']);
	});

	it('is empty for a clean candidate', () => {
		expect(scopeViolations([{ path: 'src/a.ts', content: 'x' }])).toEqual(
			[],
		);
	});
});
