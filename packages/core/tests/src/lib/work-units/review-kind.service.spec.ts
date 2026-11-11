/**
 * review-kind.service.spec.ts — a review is entered as a review (x01032).
 * The integration branch's document lookup is faked: no repository.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const lookup = vi.hoisted(() => ({
	base: 'develop' as string | undefined,
	path: undefined as string | undefined,
}));

vi.mock('@delendai/core/lib/work-units/work-unit-shared.service', () => ({
	integrationBase: () => lookup.base,
	refused: (what: string, how: string) => ({ code: 4, error: what, how }),
}));
vi.mock('@delendai/core/lib/work-units/development-policy.service', () => ({
	readWorkspaceDocsDir: () => Promise.resolve('docs/delendai/proposals'),
}));
vi.mock('@delendai/core/lib/work-units/reviewed-proposal.service', () => ({
	integratedDocumentPathOf: () => lookup.path,
}));

import type { IResolvedDevelopmentPolicy } from '@delendai/core/lib/contracts/interfaces/development-policy.interface';
import { withReviewKind } from '@delendai/core/lib/work-units/review-kind.service';

const policy = {} as IResolvedDevelopmentPolicy;

beforeEach(() => {
	lookup.base = 'develop';
	lookup.path = undefined;
});

describe('withReviewKind', () => {
	it('makes the batch a review unit when no kind, or review, is given', async () => {
		for (const given of [
			['--proposal=batch', '--slice=all'],
			['--proposal=batch', '--slice=all', '--kind=review'],
		]) {
			const { args, refusal } = await withReviewKind('/r', policy, given);
			expect(refusal).toBeUndefined();
			expect(args).toContain('--kind=review');
			expect(args).toContain('--proposal=batch');
			expect(args.filter((arg) => arg.startsWith('--kind'))).toHaveLength(
				1,
			);
		}
	});

	it('refuses another kind on the batch, naming review next', async () => {
		const { refusal } = await withReviewKind('/r', policy, [
			'--proposal=batch',
			'--slice=all',
			'--kind=implement',
		]);
		expect(JSON.stringify(refusal)).toContain('delendai review next');
	});

	it("turns a proposal waiting in review/ into the reviewer's batch", async () => {
		lookup.path = 'docs/delendai/proposals/review/x00900-waiting.md';
		const { args } = await withReviewKind('/r', policy, [
			'--proposal=x00900',
			'--slice=S1',
			'--agent=a',
		]);
		expect(args).toEqual([
			'--agent=a',
			'--kind=review',
			'--proposal=batch',
			'--slice=all',
		]);
	});

	it('leaves an explicit kind, an open proposal, an unknown one and a missing base alone', async () => {
		const given = ['--proposal=x00900', '--slice=S1'];
		lookup.path = 'docs/delendai/proposals/review/x00900-waiting.md';
		const explicit = [...given, '--kind=implement'];
		expect((await withReviewKind('/r', policy, explicit)).args).toBe(
			explicit,
		);
		lookup.path = 'docs/delendai/proposals/in-progress/x00900-open.md';
		expect((await withReviewKind('/r', policy, given)).args).toBe(given);
		lookup.path = undefined;
		expect((await withReviewKind('/r', policy, given)).args).toBe(given);
		lookup.base = undefined;
		expect((await withReviewKind('/r', policy, given)).args).toBe(given);
		const none = ['--slice=S1'];
		expect((await withReviewKind('/r', policy, none)).args).toBe(none);
	});
});
