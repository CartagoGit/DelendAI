/**
 * `work rename-namespace` through the work engine (f00808 S7): a dry run
 * unless --apply, and refused when nothing says no pull request is open.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { EXIT_CODE } from '@delendai/core/lib/contracts/constants/exit-code.constant';
import { runWorkUnit } from '@delendai/core/lib/work-units/work-unit.service';

import { cleanUnitRepos, unitRepo } from './unit-repo.helper';

afterEach(cleanUnitRepos);

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const ctxOf = (root: string) => ({
	cwd: root,
	globals: { workspace: root, json: true, format: 'json' },
});

/** A repo whose config moved from `delendai` to no namespace, with a remote. */
const movedRepo = (): string => {
	const { root } = unitRepo();
	writeFileSync(
		join(root, 'delendai.config.json'),
		JSON.stringify({
			development: {
				profile: 'shared-checkout-pr',
				branches: {
					namespacePrefix: '',
					formerNamespacePrefixes: ['delendai'],
				},
			},
		}),
	);
	git(root, 'commit', '-q', '-am', 'moved');
	const remote = mkdtempSync(join(tmpdir(), 'rename-remote-'));
	git(remote, 'init', '-q', '--bare');
	git(root, 'remote', 'add', 'origin', remote);
	git(root, 'push', '-q', 'origin', 'develop', '--no-verify');
	return root;
};

describe('work rename-namespace', () => {
	it('renames nothing when the open pull requests cannot be read', async () => {
		const root = movedRepo();
		const result = await runWorkUnit(['rename-namespace', '--apply'], {
			...ctxOf(root),
		});
		// No forge answers for a throwaway remote: nothing proves that no
		// pull request uses the former namespace.
		expect(result.code).not.toBe(EXIT_CODE.OK);
		expect(result.error).toMatch(/could not be read|could not be listed/u);
	});

	it('has nothing to rename without a former namespace', async () => {
		const { root } = unitRepo();
		const result = await runWorkUnit(['rename-namespace'], ctxOf(root));
		expect(result.code).not.toBe(EXIT_CODE.OK);
	});
});
