/**
 * What stops a review unit from being published, against a real
 * repository: outside the documents, a deletion, no verdict, or fine.
 */
import { execFileSync } from 'node:child_process';
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { IResolvedDevelopmentPolicy } from '@delendai/core/public';
import { fakePartial } from '@delendai/test-kit';

import { reviewUnitRefusal } from '@delendai/core/lib/work-units/review-unit-publish-check.service';

const policy = fakePartial<IResolvedDevelopmentPolicy>({
	branches: fakePartial<IResolvedDevelopmentPolicy['branches']>({
		integration: 'develop',
		workRefPrefix: 'delendai/wip/',
		publicationRefPrefix: 'delendai/pr/',
		workRefTemplate:
			'delendai/wip/${agent}/${proposal}-${slice}-g${generation}/${topic}',
	}),
});
const DOC = 'docs/delendai/proposals/review/x1.md';
const WORK = 'delendai/wip/me/review/x1-S1-g1/t';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const unit = (change: (root: string) => void) => {
	const root = mkdtempSync(join(tmpdir(), 'review-check-'));
	roots.push(root);
	const git = (...args: string[]): string =>
		execFileSync(
			'git',
			[
				'-c',
				'user.name=t',
				'-c',
				'user.email=t@t.invalid',
				'-c',
				'core.hooksPath=/dev/null',
				...args,
			],
			{ cwd: root, encoding: 'utf8' },
		).trim();
	const put = (path: string, text: string): void => {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), text);
	};
	git('init', '-q', '-b', 'develop');
	put(DOC, 'one\n');
	put('src/a.ts', 'a\n');
	git('add', '-A');
	git('commit', '-q', '-m', 'base');
	git('switch', '-q', '-c', WORK);
	change(root);
	git('add', '-A');
	git('commit', '-q', '--allow-empty', '-m', 'unit');
	return reviewUnitRefusal({
		root,
		policy,
		workRef: WORK,
		base: 'develop',
		agent: 'me',
	});
};

const edit = (root: string, path: string, text: string): void => {
	mkdirSync(dirname(join(root, path)), { recursive: true });
	writeFileSync(join(root, path), text);
};

describe('reviewUnitRefusal', () => {
	it('[<1000ms] refuses a review that changes the product', async () => {
		const result = await unit((root) => edit(root, 'src/a.ts', 'b\n'));
		expect(result?.error).toContain('verdicts do not change the product');
	});

	it('[<1000ms] refuses a review that deletes a document', async () => {
		const result = await unit((root) => unlinkSync(join(root, DOC)));
		expect(result?.error).toContain('it never removes one');
	});

	it('[<1000ms] refuses a review that changes nothing', async () => {
		const result = await unit(() => undefined);
		expect(result?.error).toContain('records no verdict of its own');
	});

	it('[<1000ms] lets a review that records a verdict in a document through', async () => {
		const result = await unit((root) => edit(root, DOC, 'two\n'));
		expect(result).toBeUndefined();
	});
});
