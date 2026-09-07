import { describe, expect, it } from 'vitest';

import { reconcileProposalMarkdown } from '../../../src/lib/reconciler';

describe('reconciler (q00022 S2)', () => {
	it('produces a deterministic digest independent of file order', () => {
		const files = [
			{
				path: 'ready/fixes/x00002.md',
				raw: `---\nid: x00002\ntitle: two\nkind: fix\nstatus: ready\ntype: proposal\ntrack: general\n---\n# two`,
			},
			{
				path: 'ready/fixes/x00001.md',
				raw: `---\nid: x00001\ntitle: one\nkind: fix\nstatus: ready\ntype: proposal\ntrack: general\n---\n# one`,
			},
		] as const;

		const a = reconcileProposalMarkdown({
			sourceCommit: 'abc1234',
			files,
			mode: 'shadow',
		});
		const b = reconcileProposalMarkdown({
			sourceCommit: 'abc1234',
			files: [...files].reverse(),
			mode: 'shadow',
		});

		expect(a.logicalDigest).toBe(b.logicalDigest);
		expect(a.proposals.map((entry) => entry.uid)).toEqual([
			'x00001',
			'x00002',
		]);
	});

	it('quarantines markdown without stable identity', () => {
		const result = reconcileProposalMarkdown({
			sourceCommit: 'abc1234',
			files: [
				{
					path: 'ready/fixes/unknown.md',
					raw: `---\ntitle: untitled\n---\n# body`,
				},
			],
			mode: 'incremental',
		});

		expect(result.status).toBe('degraded');
		expect(result.proposals).toHaveLength(0);
		expect(result.quarantined[0]?.errorCode).toBe('missing-frontmatter-id');
	});
});
