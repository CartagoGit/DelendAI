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

	it('projects a plan and one row per declared slice from a kind: plan file', () => {
		const raw = `---
id: q00042
title: Fixture plan
kind: plan
status: in-progress
type: proposal
track: architecture
---
# Fixture plan

## Goal

Project plans and slices, not just proposals.

## Slices

- global_gate: type

### S1 — First slice
- **Status**: done (2026-07-24)
- **Files**: \`a.ts\`
- **Gate**: type

### S2 — Second slice
- **Status**: pending
- **Files**: \`b.ts\`
- **Gate**: type

### Not a slice heading

## acceptance

- Something.
`;

		const result = reconcileProposalMarkdown({
			sourceCommit: 'abc1234',
			files: [{ path: 'ready/plans/q00042.md', raw }],
			mode: 'shadow',
		});

		expect(result.quarantined).toHaveLength(0);
		expect(result.proposals.map((entry) => entry.uid)).toEqual(['q00042']);
		expect(result.plans).toHaveLength(1);
		expect(result.plans[0]?.uid).toBe('q00042');
		expect(result.plans[0]?.proposalUid).toBe('q00042');
		expect(result.plans[0]?.status).toBe('in-progress');
		expect(result.slices.map((slice) => slice.uid)).toEqual([
			'q00042.S1',
			'q00042.S2',
		]);
		expect(result.slices.map((slice) => slice.planUid)).toEqual([
			'q00042',
			'q00042',
		]);
		expect(result.slices.map((slice) => slice.title)).toEqual([
			'First slice',
			'Second slice',
		]);
		// `done (2026-07-24)` is prose around a lifecycle status.
		expect(result.slices[0]?.status).toBe('done');
		// `pending` is the markdown spelling of `ready`.
		expect(result.slices[1]?.status).toBe('ready');
	});

	it('produces zero slices for markdown without a Slices section', () => {
		const result = reconcileProposalMarkdown({
			sourceCommit: 'abc1234',
			files: [
				{
					path: 'ready/fixes/x00001.md',
					raw: `---\nid: x00001\ntitle: One\nkind: fix\nstatus: ready\ntype: proposal\ntrack: general\n---\n# One\n\nNo slices here.`,
				},
			],
			mode: 'shadow',
		});

		expect(result.status).toBe('ok');
		expect(result.proposals).toHaveLength(1);
		expect(result.plans).toHaveLength(0);
		expect(result.slices).toHaveLength(0);
	});

	it('keeps the digest independent of read order once plans and slices are in it', () => {
		const planRaw = (id: string): string => `---
id: ${id}
title: Plan ${id}
kind: plan
status: ready
type: proposal
track: architecture
---
# Plan ${id}

## Slices

### S1 — one
- **Status**: pending

### S2 — two
- **Status**: done
`;
		const files = [
			{ path: 'ready/plans/q00002.md', raw: planRaw('q00002') },
			{ path: 'ready/plans/q00001.md', raw: planRaw('q00001') },
			{
				path: 'ready/fixes/x00003.md',
				raw: `---\nid: x00003\ntitle: Three\nkind: fix\nstatus: ready\ntype: proposal\ntrack: general\n---\n# Three`,
			},
		] as const;

		const forward = reconcileProposalMarkdown({
			sourceCommit: 'abc1234',
			files,
			mode: 'shadow',
		});
		const reversed = reconcileProposalMarkdown({
			sourceCommit: 'abc1234',
			files: [...files].reverse(),
			mode: 'shadow',
		});

		expect(reversed.logicalDigest).toBe(forward.logicalDigest);
		expect(reversed.plans).toEqual(forward.plans);
		expect(reversed.slices).toEqual(forward.slices);
		expect(forward.plans.map((plan) => plan.uid)).toEqual([
			'q00001',
			'q00002',
		]);
		expect(forward.slices.map((slice) => slice.uid)).toEqual([
			'q00001.S1',
			'q00001.S2',
			'q00002.S1',
			'q00002.S2',
		]);
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
