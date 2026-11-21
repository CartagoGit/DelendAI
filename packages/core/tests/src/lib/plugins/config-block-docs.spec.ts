/**
 * config-block-docs.spec.ts — the comment init writes above each top-level
 * block of the config: derived from the schema, wrapped for an editor, and
 * computed once per process.
 */
import { describe, expect, it } from 'vitest';

import { renderConfigBlockComments } from '@delendai/core/lib/plugins/config-block-docs';

describe('renderConfigBlockComments', () => {
	it('[<150ms] says what each block does, in rows an editor shows whole', () => {
		const comments = renderConfigBlockComments();
		// The one block whose file prose is written for the reader, not
		// taken from the schema.
		expect(comments.plugins?.[0]).toMatch(
			/^The plugins this project can use/u,
		);
		const keys = Object.keys(comments);
		expect(keys.length).toBeGreaterThan(1);
		for (const key of keys) {
			const rows = comments[key] ?? [];
			expect(rows.length).toBeGreaterThan(0);
			for (const row of rows) {
				// A word is never cut: only a single word may pass the width.
				if (row.length > 72) expect(row).not.toContain(' ');
				expect(row.trim()).toBe(row);
				expect(row).not.toBe('');
			}
		}
	});

	it('[<20ms] derives the comments once and hands the same answer back', () => {
		const first = renderConfigBlockComments();
		expect(renderConfigBlockComments()).toBe(first);
		expect(Object.isFrozen(first)).toBe(true);
	});
});
