import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { repoRoot } from '../lib/repo-root';
import {
	closeClearedIssues,
	type IIssueForge,
	upsertIssue,
} from './upsert-issue';

/** A forge that holds `open` issues and logs each write. */
const fakeForge = (open: readonly number[]) => {
	const calls: string[] = [];
	const forge: IIssueForge = {
		listOpen: () => Promise.resolve(open),
		create: (title, body) => {
			calls.push(`create ${title}: ${body}`);
			return Promise.resolve();
		},
		edit: (number, body) => {
			calls.push(`edit ${String(number)}: ${body}`);
			return Promise.resolve();
		},
		close: (number, comment) => {
			calls.push(`close ${String(number)}: ${comment}`);
			return Promise.resolve();
		},
	};
	return { forge, calls };
};

describe('upsertIssue', () => {
	it('[<20ms] creates the issue when none is open', async () => {
		const { forge, calls } = fakeForge([]);
		expect(await upsertIssue(forge, 'T', 'B')).toBe('created');
		expect(calls).toEqual(['create T: B']);
	});

	it('[<20ms] edits the oldest open issue and closes the duplicates', async () => {
		const { forge, calls } = fakeForge([30, 10, 20]);
		expect(await upsertIssue(forge, 'T', 'B')).toBe('updated');
		expect(calls).toEqual([
			'close 20: Duplicate of #10.',
			'close 30: Duplicate of #10.',
			'edit 10: B',
		]);
	});
});

describe('closeClearedIssues', () => {
	it('[<20ms] closes every open issue with the comment once the condition clears', async () => {
		const { forge, calls } = fakeForge([1, 2]);
		expect(await closeClearedIssues(forge, 'T', 'gone')).toBe('closed');
		expect(calls).toEqual(['close 1: gone', 'close 2: gone']);
	});

	it('[<20ms] does nothing when no issue is open', async () => {
		const { forge, calls } = fakeForge([]);
		expect(await closeClearedIssues(forge, 'T', 'gone')).toBe('unchanged');
		expect(calls).toEqual([]);
	});
});

describe('createGhIssueForge', () => {
	it('[<20ms] lists only the exact title and writes through gh', async () => {
		const calls: string[] = [];
		const forge = createGhIssueForge((args) => {
			calls.push(args.join(' '));
			return JSON.stringify([
				{ number: 4, title: 'T' },
				{ number: 5, title: 'T and more' },
			]);
		});
		expect(await forge.listOpen('T')).toEqual([4]);
		await forge.create('T', 'B');
		await forge.edit(4, 'B2');
		await forge.close(4, 'done');
		expect(calls.slice(1)).toEqual([
			'issue create --title T --body B',
			'issue edit 4 --body B2',
			'issue close 4 --comment done',
		]);
	});
});

describe('the calibration workflow', () => {
	const text = readFileSync(
		`${repoRoot()}/.github/workflows/test-budget-calibration.yml`,
		'utf8',
	);

	it('[<20ms] writes its issue through the upsert script and never creates one by hand', () => {
		expect(text).toContain('tools/scripts/ci/upsert-issue.script.ts');
		expect(text).not.toContain('gh issue create');
	});

	it('[<20ms] closes the issue when the calibration has nothing to change', () => {
		expect(text).toContain('--close=');
	});
});
