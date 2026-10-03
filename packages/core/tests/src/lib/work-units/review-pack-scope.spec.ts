/**
 * review-pack-scope.spec.ts — a pack that holds another reviewer's
 * commits is recognised, and a pack of its own is not.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import type { IWorkUnitContext } from '@delendai/core/lib/contracts/interfaces/work-unit-context.interface';
import { runWorkUnit } from '@delendai/core/lib/work-units/work-unit.service';

import type { ISwarmUnit } from '@delendai/core/lib/contracts/interfaces/work-swarm.interface';
import {
	describeCarriedPacks,
	otherReviewPacks,
	packsCarried,
} from '@delendai/core/lib/work-units/review-pack-scope.service';

const unit = (agent: string, subject: string, ahead = 1): ISwarmUnit => ({
	ref: `ns/pr/${agent}/${subject}`,
	agent,
	subject,
	tip: `${agent}-tip`,
	ahead,
	behind: 0,
	paths: [],
});

describe('otherReviewPacks', () => {
	it("keeps other agents' packs that still hold work, and nothing else", () => {
		const packs = otherReviewPacks(
			[
				unit('reviewer-a', 'review/batch-all-g1/work'),
				unit('reviewer-b', 'review/batch-all-g1/work'),
				unit('reviewer-b', 'implement/x1-S1-g1/work'),
				unit('reviewer-c', 'review/batch-all-g1/work', 0),
			],
			'reviewer-a',
		);
		expect(packs.map((pack) => pack.agent)).toEqual(['reviewer-b']);
		expect(packs[0]?.subject).toBe('review/batch-all-g1/work');
	});
});

describe('packsCarried', () => {
	it('names each pack that holds a commit of this one, most shared first', () => {
		expect(
			packsCarried(
				['c1', 'c2', 'c3'],
				[
					{ ref: 'pack-b', commits: ['c2', 'b9'] },
					{ ref: 'pack-c', commits: ['c1', 'c2'] },
					{ ref: 'pack-d', commits: ['d1'] },
				],
			),
		).toEqual([
			{ ref: 'pack-c', shared: 2 },
			{ ref: 'pack-b', shared: 1 },
		]);
	});

	it('finds nothing in a pack of its own commits', () => {
		expect(
			packsCarried(['c1'], [{ ref: 'pack-b', commits: ['b1'] }]),
		).toEqual([]);
		expect(packsCarried([], [])).toEqual([]);
	});

	it('says which pack, and where a pack starts', () => {
		const text = describeCarriedPacks(
			[{ ref: 'pack-c', shared: 2 }],
			'develop',
		);
		expect(text).toContain('pack-c already carries 2');
		expect(text).toContain('starts from `develop`');
	});
});

describe('work publish of a review pack', () => {
	const roots: string[] = [];
	afterEach(() => {
		for (const root of roots.splice(0)) {
			rmSync(root, { recursive: true, force: true });
		}
	});

	const DOC = 'docs/proposals/done/x00001-closed.md';

	const repository = (): string => {
		const root = mkdtempSync(join(tmpdir(), 'review-pack-'));
		roots.push(root);
		const git = (...args: string[]) =>
			execFileSync('git', args, { cwd: root, encoding: 'utf8' });
		git('init', '-q', '-b', 'develop');
		git('config', 'user.email', 'work@example.com');
		git('config', 'user.name', 'Work');
		git('config', 'commit.gpgsign', 'false');
		writeFileSync(
			join(root, 'delendai.config.json'),
			JSON.stringify({
				docsDir: 'docs',
				development: {
					profile: 'shared-checkout-pr',
					branches: { namespacePrefix: 'delendai' },
				},
			}),
		);
		writeFileSync(join(root, '.gitignore'), '.cache/\n');
		mkdirSync(join(root, 'docs/proposals/done'), { recursive: true });
		writeFileSync(join(root, DOC), 'closed\n');
		git('add', '-A');
		git('commit', '-q', '-m', 'base');
		return root;
	};

	const work = (root: string, action: string, agent: string) =>
		runWorkUnit(
			[
				action,
				'--kind=review',
				'--proposal=batch',
				'--slice=all',
				`--agent=${agent}`,
			],
			fakePartial<IWorkUnitContext, 'cwd' | 'globals'>({
				cwd: root,
				globals: fakePartial<
					IWorkUnitContext['globals'],
					'workspace' | 'json'
				>({ workspace: root, json: true }),
			}),
		);

	const unitOf = async (root: string, agent: string) => {
		const entered = await work(root, 'enter', agent);
		const data = entered.data as { path: string; branch: string };
		return {
			branch: data.branch,
			git: (...args: string[]) =>
				execFileSync('git', args, { cwd: data.path, encoding: 'utf8' }),
			write: (path: string, text: string) =>
				writeFileSync(join(data.path, path), text),
		};
	};

	it("is refused when it carries another reviewer's pack, and names it", async () => {
		const root = repository();
		const other = await unitOf(root, 'reviewer-b');
		other.write(DOC, 'closed\nverdict of b\n');
		other.git('commit', '-qam', 'docs(review): verdict of b');

		const mine = await unitOf(root, 'reviewer-a');
		mine.git('merge', '-q', '--no-edit', other.branch);
		mine.write('docs/proposals/done/note.md', 'verdict of a\n');
		mine.git('add', '-A');
		mine.git('commit', '-qm', 'docs(review): verdict of a');

		const result = await work(root, 'publish', 'reviewer-a');
		expect(result.code).not.toBe(0);
		expect(result.error).toContain("carries another reviewer's pack");
		expect(result.error).toContain(other.branch);
	});

	it('is refused when it deletes a document', async () => {
		const root = repository();
		const mine = await unitOf(root, 'reviewer-a');
		mine.git('rm', '-q', DOC);
		mine.git('commit', '-qm', 'docs(review): drop a stale copy');

		const result = await work(root, 'publish', 'reviewer-a');
		expect(result.code).not.toBe(0);
		expect(result.error).toContain('never removes one');
		expect(result.error).toContain(DOC);
	});
});
