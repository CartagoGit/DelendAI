import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ownActivityAt } from '../../../../src/lib/work-units/unit-activity.helper';

const OWN = 1_700_000_000;
const LATER = OWN + 86_400;

/** A repository whose commits carry the dates the test gives them. */
const repository = () => {
	const root = mkdtempSync(join(tmpdir(), 'unit-activity-'));
	const run = (args: string[], at?: number): string =>
		execFileSync('git', args, {
			cwd: root,
			encoding: 'utf8',
			env: {
				...process.env,
				GIT_AUTHOR_NAME: 't',
				GIT_AUTHOR_EMAIL: 't@t',
				GIT_COMMITTER_NAME: 't',
				GIT_COMMITTER_EMAIL: 't@t',
				...(at === undefined
					? {}
					: {
							GIT_AUTHOR_DATE: `@${String(at)}`,
							GIT_COMMITTER_DATE: `@${String(at)}`,
						}),
			},
		}).trim();
	run(['init', '-q', '-b', 'develop']);
	run(['commit', '-q', '--allow-empty', '-m', 'base'], OWN - 100);
	const read = (args: readonly string[]): string => {
		try {
			return run([...args]);
		} catch {
			return '';
		}
	};
	return { run, read };
};

describe('ownActivityAt', () => {
	it('dates a unit by its own last commit, not by a later merge of the integration branch', () => {
		const repo = repository();
		repo.run(['checkout', '-q', '-b', 'unit']);
		repo.run(['commit', '-q', '--allow-empty', '-m', 'own work'], OWN);
		repo.run(['checkout', '-q', 'develop']);
		repo.run(['commit', '-q', '--allow-empty', '-m', 'others'], LATER - 10);
		repo.run(['checkout', '-q', 'unit']);
		repo.run(['merge', '-q', '--no-ff', '-m', 'hydrate', 'develop'], LATER);
		expect(ownActivityAt(repo.read, 'unit', 'develop')).toBe(OWN);
	});

	it('dates a unit with no work of its own by when it was first touched', () => {
		const repo = repository();
		repo.run(['checkout', '-q', '-b', 'unit']);
		repo.run(['checkout', '-q', 'develop']);
		repo.run(['commit', '-q', '--allow-empty', '-m', 'others'], OWN);
		repo.run(['checkout', '-q', 'unit']);
		repo.run(
			['merge', '-q', '--no-ff', '-m', 'hydrate 1', 'develop'],
			OWN + 5,
		);
		repo.run(['checkout', '-q', 'develop']);
		repo.run(['commit', '-q', '--allow-empty', '-m', 'more'], LATER - 5);
		repo.run(['checkout', '-q', 'unit']);
		repo.run(
			['merge', '-q', '--no-ff', '-m', 'hydrate 2', 'develop'],
			LATER,
		);
		expect(ownActivityAt(repo.read, 'unit', 'develop')).toBe(OWN + 5);
	});

	it('dates by the tip what holds nothing beyond the integration branch, and nothing it cannot read', () => {
		const repo = repository();
		expect(ownActivityAt(repo.read, 'develop', 'develop')).toBe(OWN - 100);
		expect(ownActivityAt(repo.read, 'missing', 'develop')).toBeUndefined();
	});
});
