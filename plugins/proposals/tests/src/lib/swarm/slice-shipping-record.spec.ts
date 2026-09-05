import { describe, expect, it } from 'vitest';

import { citedCommitsForSlice } from '../../../../src/lib/swarm/slice-cited-commits';
import {
	isCommitHash,
	readShippingCommit,
	recordShippingCommit,
	renderShippingLine,
} from '../../../../src/lib/swarm/slice-shipping-record';

const block = [
	'- **Status**: done',
	'- **Files**: `plugins/proposals/src/lib/a.ts`',
	'- **Gate**: type',
	'',
].join('\n');

describe('slice shipping record (f00505 S5)', () => {
	describe('the format is the one already in use', () => {
		it('writes a backticked hash the S4 extractor reads without translation', () => {
			const { block: updated } = recordShippingCommit(block, 'abc1234');

			// The whole point: no second format, no migration.
			const doc = ['### S1 — a slice', updated].join('\n');
			expect(citedCommitsForSlice(doc, 'S1')).toContain('abc1234');
		});

		it('lowercases the hash', () => {
			expect(renderShippingLine('ABC1234')).toContain('`abc1234`');
		});

		it('accepts a full-length sha', () => {
			expect(
				isCommitHash('1234567890abcdef1234567890abcdef12345678'),
			).toBe(true);
		});

		it('does not mistake a short string for a hash', () => {
			expect(isCommitHash('abc12')).toBe(false);
			expect(isCommitHash('not-a-hash')).toBe(false);
		});
	});

	describe('closing without a known commit says so', () => {
		it('records the absence as a fact rather than omitting the line', () => {
			// A missing line is indistinguishable from a slice closed
			// before this existed, which loses the signal it was added for.
			const result = recordShippingCommit(block);

			expect(result.written).toBe(true);
			expect(result.block).toContain('not recorded');
			expect(result.reason).toContain('rather than an absence');
		});

		it('says so for an empty string too', () => {
			expect(renderShippingLine('   ')).toContain('not recorded');
		});

		it('says what was passed when it is not a hash', () => {
			expect(renderShippingLine('HEAD~1')).toContain('HEAD~1');
			expect(renderShippingLine('HEAD~1')).toContain('not recorded');
		});

		it('does not let a non-hash be read back as a citation', () => {
			const { block: updated } = recordShippingCommit(block, 'HEAD~1');

			expect(readShippingCommit(updated)).toBeUndefined();
		});
	});

	describe('closing twice does not stack two records', () => {
		it('leaves an existing record alone', () => {
			const once = recordShippingCommit(block, 'abc1234').block;
			const twice = recordShippingCommit(once, 'def5678');

			expect(twice.written).toBe(false);
			expect(twice.block).toBe(once);
		});

		it('explains why it did not write', () => {
			const once = recordShippingCommit(block, 'abc1234').block;

			expect(recordShippingCommit(once, 'def5678').reason).toContain(
				'disagree with the first',
			);
		});

		it('does not stack onto an unrecorded close either', () => {
			const once = recordShippingCommit(block).block;

			expect(recordShippingCommit(once, 'abc1234').written).toBe(false);
		});

		it('appears exactly once in the block', () => {
			const once = recordShippingCommit(block, 'abc1234').block;
			const twice = recordShippingCommit(once, 'abc1234').block;

			expect(twice.split('shipped-in:').length - 1).toBe(1);
		});
	});

	describe('the block still parses the same way afterwards', () => {
		it('keeps the existing lines untouched', () => {
			const { block: updated } = recordShippingCommit(block, 'abc1234');

			expect(updated).toContain('- **Status**: done');
			expect(updated).toContain(
				'- **Files**: `plugins/proposals/src/lib/a.ts`',
			);
			expect(updated).toContain('- **Gate**: type');
		});

		it('does not mistake the declared file path for the shipping hash', () => {
			const { block: updated } = recordShippingCommit(block, 'abc1234');

			expect(readShippingCommit(updated)).toBe('abc1234');
		});

		it('handles a block with no trailing newline', () => {
			const tight = '- **Status**: done';
			const { block: updated } = recordShippingCommit(tight, 'abc1234');

			expect(updated).toContain('- **Status**: done');
			expect(readShippingCommit(updated)).toBe('abc1234');
		});

		it('reads back nothing from a block that has no record', () => {
			expect(readShippingCommit(block)).toBeUndefined();
		});
	});
});
