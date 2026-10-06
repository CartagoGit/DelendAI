/**
 * reviewed-proposal.service.spec.ts — the reviewer of a proposal is kept
 * out of implementing it, and nobody else is.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import type { IWorkUnitContext } from '@delendai/core/lib/contracts/interfaces/work-unit-context.interface';
import { runWorkUnit } from '@delendai/core/lib/work-units/work-unit.service';

import {
	describeReviewedProposal,
	reviewerNamed,
	reviewersIn,
	sliceSectionOf,
} from '@delendai/core/lib/work-units/reviewed-proposal.service';

const document = [
	'### S1 — first',
	'- review-implementer: claude-opus-5-5',
	'- review-reviewer: minimax-m3',
	'- review-log: approved by minimax-m3',
	'### S2 — second',
	'- review-reviewer: minimax-m3',
	'### S3 — third',
	'  - review-reviewer: glm-5.3-flash  ',
].join('\n');

describe('reviewersIn', () => {
	it('names each reviewer once, and never the implementer', () => {
		expect(reviewersIn(document)).toEqual(['minimax-m3', 'glm-5.3-flash']);
		expect(reviewersIn('- review-log: approved by minimax-m3')).toEqual([]);
	});
});

describe('reviewerNamed', () => {
	it('recognises the reviewer under another spelling', () => {
		expect(reviewerNamed(document, 'minimax-m3')).toBe('minimax-m3');
		expect(reviewerNamed(document, 'MiniMax-M3')).toBe('minimax-m3');
	});

	it('leaves the implementer and an agent that reviewed nothing alone', () => {
		expect(reviewerNamed(document, 'claude-opus-5-5')).toBeUndefined();
		expect(reviewerNamed(document, 'qwen-3.8-max')).toBeUndefined();
		expect(reviewerNamed('', 'minimax-m3')).toBeUndefined();
	});

	it('says who makes the change instead', () => {
		expect(describeReviewedProposal('x00001', 'minimax-m3')).toContain(
			'any agent that has not reviewed x00001',
		);
	});
});

describe('sliceSectionOf', () => {
	it('is the slice from its heading to the next one', () => {
		const section = sliceSectionOf(document, 'S2');
		expect(section).toBe('### S2 — second\n- review-reviewer: minimax-m3');
		expect(reviewersIn(sliceSectionOf(document, 'S3'))).toEqual([
			'glm-5.3-flash',
		]);
	});

	it('is the whole document for the whole proposal or a slice it lacks', () => {
		expect(sliceSectionOf(document, 'all')).toBe(document);
		expect(sliceSectionOf(document, undefined)).toBe(document);
		expect(sliceSectionOf(document, 'S9')).toBe(document);
	});
});

describe('work enter by the reviewer of the proposal', () => {
	const roots: string[] = [];
	afterEach(() => {
		for (const root of roots.splice(0)) {
			rmSync(root, { recursive: true, force: true });
		}
	});

	const enter = (root: string, agent: string, kind: string, slice = 'S1') =>
		runWorkUnit(
			[
				'enter',
				'--proposal=x00001',
				`--slice=${slice}`,
				`--kind=${kind}`,
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

	it('refuses an implement unit, and lets in a review unit and another agent', async () => {
		const root = mkdtempSync(join(tmpdir(), 'reviewed-proposal-'));
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
		mkdirSync(join(root, 'docs/proposals/review'), { recursive: true });
		writeFileSync(
			join(root, 'docs/proposals/review/x00001-a-thing.md'),
			document,
		);
		git('add', '-A');
		git('commit', '-q', '-m', 'base');

		const reviewer = await enter(root, 'minimax-m3', 'implement');
		expect(reviewer.code).not.toBe(0);
		expect(reviewer.error).toContain('does not implement what it reviews');

		expect((await enter(root, 'minimax-m3', 'review')).code).toBe(0);
		expect((await enter(root, 'claude-opus-5-5', 'implement')).code).toBe(
			0,
		);
		// glm-5.3-flash judged S3 only: it is kept out of S3 and of the
		// whole proposal, and implements a slice it did not judge.
		expect(
			(await enter(root, 'glm-5.3-flash', 'implement', 'S3')).code,
		).not.toBe(0);
		expect(
			(await enter(root, 'glm-5.3-flash', 'implement', 'all')).code,
		).not.toBe(0);
		expect(
			(await enter(root, 'glm-5.3-flash', 'implement', 'S2')).code,
		).toBe(0);
	});
});
