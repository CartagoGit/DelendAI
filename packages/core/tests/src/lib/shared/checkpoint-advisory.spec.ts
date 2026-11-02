import { describe, expect, it } from 'vitest';

import type { ICheckpointAdvisory } from '@delendai/core/lib/contracts/interfaces/checkpoint-advisory.interface';
import {
	injectCheckpointAdvisory,
	mergeCheckpointAdvisories,
	selectCheckpointAdvisory,
} from '@delendai/core/lib/shared/checkpoint-advisory';

const advisory = (
	partial: Partial<ICheckpointAdvisory> &
		Pick<ICheckpointAdvisory, 'code' | 'severity' | 'dedupeKey'>,
): ICheckpointAdvisory => ({
	triggered: true,
	message: `At this point, I recommend ${partial.code}.`,
	reason: 'spec',
	nextAction: 'checkpoint-and-compact',
	...partial,
});

describe('mergeCheckpointAdvisories', () => {
	it('returns null when nothing is triggered', () => {
		expect(mergeCheckpointAdvisories([null, undefined])).toBeNull();
		expect(
			mergeCheckpointAdvisories([
				advisory({
					triggered: false,
					code: 'SESSION_TOO_LONG',
					severity: 'recommend',
					dedupeKey: 'a',
				}),
			]),
		).toBeNull();
	});

	it('picks the highest severity (block > strong > recommend)', () => {
		const recommend = advisory({
			code: 'SESSION_TOO_LONG',
			severity: 'recommend',
			dedupeKey: 'age',
		});
		const strong = advisory({
			code: 'CONTEXT_DRIFT',
			severity: 'strong',
			dedupeKey: 'drift',
		});
		const block = advisory({
			code: 'STALE_ACCEPTANCE',
			severity: 'block',
			dedupeKey: 'push',
			nextAction: 'validate-before-push',
		});
		expect(mergeCheckpointAdvisories([recommend, strong])).toEqual(strong);
		expect(mergeCheckpointAdvisories([recommend, block, strong])).toEqual(
			block,
		);
	});

	it('keeps registration order on equal severity', () => {
		const first = advisory({
			code: 'A',
			severity: 'recommend',
			dedupeKey: 'a',
		});
		const second = advisory({
			code: 'B',
			severity: 'recommend',
			dedupeKey: 'b',
		});
		expect(mergeCheckpointAdvisories([first, second])).toEqual(first);
	});

	it('never invents severity block from recommend/strong inputs', () => {
		const merged = mergeCheckpointAdvisories([
			advisory({
				code: 'SESSION_TOO_LONG',
				severity: 'recommend',
				dedupeKey: 'age',
			}),
			advisory({
				code: 'CONTEXT_DRIFT',
				severity: 'strong',
				dedupeKey: 'drift',
			}),
		]);
		expect(merged?.severity).toBe('strong');
		expect(merged?.severity).not.toBe('block');
	});
});

describe('selectCheckpointAdvisory', () => {
	it('returns the winner the first time', () => {
		const first = advisory({
			code: 'SESSION_TOO_LONG',
			severity: 'recommend',
			dedupeKey: 'SESSION_TOO_LONG:s1:session-age',
		});
		expect(selectCheckpointAdvisory([first], null)).toEqual(first);
	});

	it('drops a duplicate dedupeKey', () => {
		const first = advisory({
			code: 'SESSION_TOO_LONG',
			severity: 'recommend',
			dedupeKey: 'SESSION_TOO_LONG:s1:session-age',
		});
		expect(selectCheckpointAdvisory([first], first.dedupeKey)).toBeNull();
	});

	it('emits again when the dedupeKey changes', () => {
		const next = advisory({
			code: 'SESSION_TOO_LONG',
			severity: 'strong',
			dedupeKey: 'SESSION_TOO_LONG:s1:idle-gap,session-age',
		});
		expect(
			selectCheckpointAdvisory([next], 'SESSION_TOO_LONG:s1:session-age'),
		).toEqual(next);
	});
});

describe('injectCheckpointAdvisory', () => {
	it('writes checkpointAdvisory onto _meta (not structuredContent)', () => {
		const result: Record<string, unknown> = {
			content: [{ type: 'text', text: '{}' }],
			structuredContent: { ok: true },
		};
		const value = advisory({
			code: 'SESSION_TOO_LONG',
			severity: 'recommend',
			dedupeKey: 'k',
		});
		injectCheckpointAdvisory(result, value);
		expect(
			(result._meta as Record<string, unknown>).checkpointAdvisory,
		).toEqual(value);
		// structuredContent stays untouched so the tool's outputSchema
		// validation still passes.
		expect(result.structuredContent).toEqual({ ok: true });
	});

	it('is a no-op for null advisory or non-object results', () => {
		const result: Record<string, unknown> = { structuredContent: {} };
		injectCheckpointAdvisory(result, null);
		expect(result._meta).toBeUndefined();
		injectCheckpointAdvisory(
			'text',
			advisory({
				code: 'X',
				severity: 'recommend',
				dedupeKey: 'x',
			}),
		);
	});
});
