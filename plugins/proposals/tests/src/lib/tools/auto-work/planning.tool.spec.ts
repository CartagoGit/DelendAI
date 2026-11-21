/**
 * planning.tool.spec.ts — a proposal in review sent back is its
 * implementer's next work, not a reviewer's.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	awaitsPeerReview,
	sentBackAt,
} from '@delendai/proposals/lib/tools/auto-work/planning.tool';

const doc = (reviewState: string): string =>
	`---\nid: x00001\nstatus: review\n---\n\n### S1 — work\n- **Status**: pending\n- review-state: ${reviewState}\n- review-implementer: agent-a\n`;

describe('a proposal in review, for auto_work', () => {
	let root = '';
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'planning-'));
		mkdirSync(join(root, 'review'), { recursive: true });
	});
	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('is a reviewer’s while a slice waits for its verdict', async () => {
		expect(awaitsPeerReview(doc('in_review'))).toBe(true);
		writeFileSync(join(root, 'review', 'x00001-a.md'), doc('in_review'));
		expect(await sentBackAt(root, 'review/x00001-a.md')).toBe(false);
	});

	it('is its implementer’s once sent back', async () => {
		expect(awaitsPeerReview(doc('changes_requested'))).toBe(false);
		writeFileSync(
			join(root, 'review', 'x00001-a.md'),
			doc('changes_requested'),
		);
		expect(await sentBackAt(root, 'review/x00001-a.md')).toBe(true);
	});

	it('reads nothing it cannot find', async () => {
		expect(await sentBackAt(undefined, 'review/x00001-a.md')).toBe(false);
		expect(await sentBackAt(root, 'review/missing.md')).toBe(false);
	});
});
