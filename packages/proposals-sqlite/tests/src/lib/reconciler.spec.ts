import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	reconcile,
	reconcileProposalMarkdown,
} from '../../../src/lib/reconciler';

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

	it('dispatches shadow inputs with paths and sha to staging reconciliation', () => {
		const rootDir = mkdtempSync(
			join(tmpdir(), 'proposals-sqlite-reconcile-'),
		);
		try {
			const result = reconcile({
				mode: 'shadow',
				workspacePath: join(rootDir, 'workspace'),
				statePath: join(rootDir, '.delendai', 'state'),
				sourceCommit: 'abc1234',
				sha: 'tree-abc1234',
				files: [
					{
						path: 'ready/fixes/x00001.md',
						sha: 'blob-x00001',
						raw: `---\nid: x00001\ntitle: One\nkind: fix\nstatus: ready\ntype: proposal\ntrack: general\n---\n# One`,
					},
				],
				now: Date.parse('2026-09-07T12:00:00.000Z'),
			});

			expect('stagingPath' in result).toBe(true);
			if (!('stagingPath' in result)) return;
			expect(result.status).toBe('ok');
			expect(existsSync(result.stagingPath)).toBe(true);
		} finally {
			rmSync(rootDir, { recursive: true, force: true });
		}
	});
});
