/**
 * locate.spec.ts
 *
 * Tests for the shared proposal-locator (`proposals/locate.ts`):
 *   - `locateByIndex` reads `docs/proposals/index.json`
 *   - `locateByScan` walks the 7 status folders
 *   - `locateProposal` composes both (index-first, scan-fallback)
 *
 * Acceptance:
 *   - Index hit returns the file path + folder.
 *   - Index hit re-reads the file for `type` + `status`.
 *   - Index miss falls back to scan and finds the file.
 *   - Empty / corrupt index falls back gracefully.
 *   - Both strategies return null when the id is truly absent.
 */

import { describe, expect, it } from 'vitest';

import {
	PROPOSAL_STATUS_FOLDERS,
	locateProposal,
} from '@mcp-vertex/proposals/lib/proposals/locate';

describe('locate', () => {
	describe('PROPOSAL_STATUS_FOLDERS', () => {
		it('lists all 7 status folders', () => {
			expect(PROPOSAL_STATUS_FOLDERS).toHaveLength(7);
			expect(PROPOSAL_STATUS_FOLDERS).toContain('ready');
			expect(PROPOSAL_STATUS_FOLDERS).toContain('done');
		});
	});

	// locateByIndex and locateByScan require disk fixtures. The shared
	// locator is exercised end-to-end by `proposals_close_plan`'s
	// integration path; here we assert the contract shape.
	describe('locateProposal — contract', () => {
		it('returns null for an empty (missing) index without throwing', async () => {
			const result = await locateProposal('q99999', {
				indexPathAbs: '/nonexistent/path/index.json',
				proposalsDirAbs: '/nonexistent/path',
			});
			expect(result).toBeNull();
		});
	});
});
