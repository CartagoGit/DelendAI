import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openReviewRounds } from '@delendai/proposals/lib/services/review-handoff';

describe('openReviewRounds', () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const dir of dirs.splice(0))
			rmSync(dir, { recursive: true, force: true });
	});

	it('leaves every handed-in slice reading review, including one submitted earlier', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'handoff-'));
		dirs.push(dir);
		const doc = join(dir, 'x00001-a.md');
		writeFileSync(
			doc,
			[
				'---',
				'id: x00001',
				'status: in-progress',
				'---',
				'',
				'## slices',
				'',
				'### S1 — submitted earlier',
				'',
				'- **Status**: pending',
				'- review-state: in_review',
				'- review-implementer: someone',
				'',
				'### S2 — not yet',
				'',
				'- **Status**: pending',
				'',
			].join('\n'),
		);
		const opened = await openReviewRounds({
			docPathAbs: doc,
			proposalId: 'x00001',
			implementer: 'someone',
			workspaceRoot: dir,
			identityDeps: {
				appendLine: async () => undefined,
				ensureDir: async () => undefined,
				readText: async () => '',
				now: () => '2026-10-13T00:00:00.000Z',
				hostname: () => 'host',
				pid: () => 1,
			},
		});
		expect(opened).toEqual(['S2']);
		const text = readFileSync(doc, 'utf8');
		expect(text).not.toContain('**Status**: pending');
		expect(text.match(/\*\*Status\*\*: review/gu)).toHaveLength(2);
	});
});
