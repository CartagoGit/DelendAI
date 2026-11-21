/**
 * review-unit-publish-checks.service.spec.ts — what a review unit may not
 * publish. Git, the documents folder and the swarm are injected: no process.
 */
import { describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';

import { reviewUnitRefusal } from '@delendai/core/lib/work-units/review-unit-publish-checks.service';
import type { IReviewUnitChecksDeps } from '@delendai/core/lib/contracts/interfaces/review-unit-publish-checks.interface';
import type { ISwarmUnit } from '@delendai/core/lib/contracts/interfaces/work-swarm.interface';

const policy = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: { namespacePrefix: 'delendai' },
	},
});

const AGENT = 'claude-sonnet-5-5';
const REVIEW_REF = `refs/heads/delendai/wip/${AGENT}/review/x01000-all-g1/work`;
const REVALIDATION_REF = `refs/heads/delendai/wip/${AGENT}/review/batch-all-g1/revalidation`;
const IMPLEMENT_REF = `refs/heads/delendai/wip/${AGENT}/implement/x01000-S1-g1/work`;
const DOCS = 'docs/delendai';

interface IScript {
	readonly changed?: string;
	readonly status?: string;
	readonly commits?: Record<string, string>;
	readonly packs?: readonly ISwarmUnit[];
}

const depsOf = (script: IScript): IReviewUnitChecksDeps => ({
	git: (args) => {
		if (args[0] === 'rev-list') {
			return script.commits?.[args[2]?.split('..')[1] ?? ''] ?? '';
		}
		if (args.includes('--name-status')) return script.status ?? '';
		return script.changed ?? `${DOCS}/proposals/x.md`;
	},
	docsDir: () => Promise.resolve(DOCS),
	swarm: () => ({ units: script.packs ?? [], published: [] }),
});

const refuse = (workRef: string, script: IScript) =>
	reviewUnitRefusal(
		{ root: '/repo', policy, workRef, base: 'main', agent: AGENT },
		depsOf({
			commits: { [workRef]: 'c1\nc2' },
			...script,
		}),
	);

const pack = (tip: string): ISwarmUnit => ({
	ref: 'delendai/wip/gpt-6/review/x01000-all-g1/work',
	agent: 'gpt-6',
	subject: 'review/x01000-all-g1/work',
	tip,
	ahead: 2,
	behind: 0,
	paths: [],
});

describe('reviewUnitRefusal', () => {
	it('[<20ms] lets a unit that is not a review through', async () => {
		expect(await refuse(IMPLEMENT_REF, { changed: 'src/a.ts' })).toBe(
			undefined,
		);
	});

	it('[<20ms] lets a review that records a verdict in a document through', async () => {
		expect(await refuse(REVIEW_REF, {})).toBe(undefined);
	});

	it('[<20ms] does not refuse a revalidation batch that changes proposal documents, nor mistake it for another reviewer pack', async () => {
		expect(
			await refuse(REVALIDATION_REF, {
				packs: [pack('c1')],
			}),
		).toBe(undefined);
	});

	it('[<20ms] still keeps a revalidation batch to documents', async () => {
		const refusal = await refuse(REVALIDATION_REF, { changed: 'src/a.ts' });
		expect(refusal?.error).toContain('src/a.ts');
	});

	it('[<20ms] refuses a review that changes the product', async () => {
		const refusal = await refuse(REVIEW_REF, { changed: 'src/a.ts' });
		expect(refusal?.error).toContain('src/a.ts');
	});

	it('[<20ms] refuses a review that deletes a document', async () => {
		const refusal = await refuse(REVIEW_REF, {
			status: `D\t${DOCS}/proposals/x.md`,
		});
		expect(refusal?.error).toContain('deletes');
	});

	it('[<20ms] refuses a review that changes nothing', async () => {
		const refusal = await refuse(REVIEW_REF, { changed: '' });
		expect(refusal?.error).toContain('records no verdict');
	});

	it("[<20ms] refuses a review that carries another reviewer's pack", async () => {
		const refusal = await refuse(REVIEW_REF, {
			packs: [pack('other')],
			commits: { [REVIEW_REF]: 'c1\nc2', other: 'c2' },
		});
		expect(refusal?.error).toContain("another reviewer's pack");
	});

	it('[<20ms] lets a review through when the other pack shares no commit', async () => {
		expect(
			await refuse(REVIEW_REF, {
				packs: [pack('other')],
				commits: { [REVIEW_REF]: 'c1', other: 'c9' },
			}),
		).toBe(undefined);
	});
	it('[<20ms] refuses a review when git tells nothing about it', async () => {
		const refusal = await reviewUnitRefusal(
			{
				root: '/repo',
				policy,
				workRef: REVIEW_REF,
				base: 'main',
				agent: AGENT,
			},
			{
				git: () => undefined,
				docsDir: () => Promise.resolve(DOCS),
				swarm: () => ({ units: [], published: [] }),
			},
		);
		expect(refusal?.error).toContain('records no verdict');
	});
});
