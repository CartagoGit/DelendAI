/**
 * review-restore.spec.ts — `proposal_reconcile_folder` with no id lists
 * by default, and run, returns each proposal to review/ with its verdicts
 * untouched.
 */
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { restoreReviewMoves } from '@delendai/proposals/lib/tools/recovery-tools';

const DOC = `---
id: x00001
status: in-progress
last-transition-from: review
---

# x00001

### S1 — work
- **Status**: pending
- review-state: changes_requested
- review-implementer: agent-a
- review-reviewer: agent-b
- review-log: requested_changes by agent-b — fix it
`;

describe('restoreReviewMoves', () => {
	let root = '';
	const options = () => ({
		namespacePrefix: 'proposals',
		indexPathAbs: join(root, 'index.json'),
		proposalsDirAbs: root,
		lockPathAbs: join(root, 'locks.json'),
		agentRegistryPathAbs: join(root, 'registry.json'),
		workspaceRoot: root,
		// Not a repository: the move falls back to a plain rename.
		gitRunner: async () => ({ ok: false, output: '', reason: 'no git' }),
	});
	const body = (result: { content: readonly { text: string }[] }) =>
		JSON.parse(result.content[0]?.text ?? '{}') as {
			id: string;
			dryRun: boolean;
			changed?: boolean;
			wouldChange: { kind: string; path: string; summary: string }[];
		};

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'review-restore-tool-'));
		mkdirSync(join(root, 'in-progress'), { recursive: true });
		writeFileSync(join(root, 'in-progress', 'x00001-a.md'), DOC);
	});
	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('lists without moving by default', async () => {
		const listed = body(await restoreReviewMoves({}, options()));
		expect(listed).toMatchObject({
			id: 'all',
			dryRun: true,
			wouldChange: [
				{
					kind: 'rename',
					path: 'in-progress/x00001-a.md',
					summary:
						'x00001 -> review (S1 changes_requested); sent back by agent-b',
				},
			],
		});
		expect(existsSync(join(root, 'in-progress', 'x00001-a.md'))).toBe(true);
	});

	it('returns the proposal to review/ and keeps its verdicts', async () => {
		const run = body(
			await restoreReviewMoves({ dryRun: false }, options()),
		);
		expect(run).toMatchObject({ dryRun: false, changed: true });
		const moved = readFileSync(join(root, 'review', 'x00001-a.md'), 'utf8');
		expect(moved).toMatch(/^status: review$/mu);
		expect(moved).toContain('- review-state: changes_requested');
		expect(moved).toContain('requested_changes by agent-b — fix it');
	});
});
