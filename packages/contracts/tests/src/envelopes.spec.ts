/**
 * envelopes.spec.ts — r00033 S1 acceptance for the shared
 * envelope types in `@delendai/contracts`.
 *
 * Pins the IToolOkEnvelope / IToolErrorEnvelope / IToolEnvelope
 * discriminated union.
 * Migration from local envelope shapes lives in follow-up
 * proposals; this spec only validates the canonical surface.
 */

import { describe, expect, it } from 'vitest';

import type {
	IToolEnvelope,
	IToolErrorEnvelope,
	IToolOkEnvelope,
} from '../../src/envelopes';

describe('envelopes (r00033 S1)', () => {
	it('IToolOkEnvelope narrows correctly on ok:true', () => {
		const ok: IToolOkEnvelope<{ value: number }> = { ok: true, value: 42 };
		expect(ok.ok).toBe(true);
		if (ok.ok) {
			expect(ok.value).toBe(42);
		}
	});

	it('IToolErrorEnvelope narrows correctly on ok:false', () => {
		const err: IToolErrorEnvelope = {
			ok: false,
			error: { code: 'not-found', reason: 'boom', nextAction: 'retry' },
		};
		expect(err.ok).toBe(false);
		if (!err.ok) {
			expect(err.error.reason).toBe('boom');
		}
	});

	it('IToolEnvelope is the discriminated union', () => {
		const ok: IToolEnvelope<{ value: string }> = { ok: true, value: 'a' };
		const err: IToolEnvelope<{ value: string }> = {
			ok: false,
			error: { reason: 'r', code: 'k' },
		};
		expect(ok.ok).toBe(true);
		expect(err.ok).toBe(false);
	});
});
