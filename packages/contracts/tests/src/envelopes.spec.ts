/**
 * envelopes.spec.ts — r00033 S1 acceptance for the shared
 * envelope types in `@delendai/contracts`.
 *
 * Pins the IToolOkEnvelope / IToolErrorEnvelope / IToolEnvelope
 * discriminated union and the ICheckpointAdvisory* companions.
 * Migration from local envelope shapes lives in follow-up
 * proposals; this spec only validates the canonical surface.
 */

import { describe, expect, it } from 'vitest';

import type {
	ICheckpointAdvisory,
	ICheckpointAdvisoryEnvelope,
	IToolEnvelope,
	IToolErrorEnvelope,
	IToolOkEnvelope,
} from '../../src/envelopes';

describe('envelopes (r00033 S1)', () => {
	it('IToolOkEnvelope narrows correctly on ok:true', () => {
		const ok: IToolOkEnvelope<number> = { ok: true, value: 42 };
		expect(ok.ok).toBe(true);
		if (ok.ok) {
			expect(ok.value).toBe(42);
		}
	});

	it('IToolErrorEnvelope narrows correctly on ok:false', () => {
		const err: IToolErrorEnvelope = {
			ok: false,
			error: { reason: 'boom' },
		};
		expect(err.ok).toBe(false);
		if (!err.ok) {
			expect(err.error.reason).toBe('boom');
		}
	});

	it('IToolEnvelope is the discriminated union', () => {
		const ok: IToolEnvelope<string> = { ok: true, value: 'a' };
		const err: IToolEnvelope<string> = {
			ok: false,
			error: { reason: 'r', kind: 'k' },
		};
		expect(ok.ok).toBe(true);
		expect(err.ok).toBe(false);
	});

	it('ICheckpointAdvisory preserves severity enum', () => {
		const info: ICheckpointAdvisory = {
			id: 'a1',
			severity: 'info',
			message: 'note',
		};
		const blocker: ICheckpointAdvisory = {
			id: 'a2',
			severity: 'blocker',
			message: 'stop',
			nextAction: 'fix',
		};
		expect(info.severity).toBe('info');
		expect(blocker.severity).toBe('blocker');
		expect(blocker.nextAction).toBe('fix');
	});

	it('ICheckpointAdvisoryEnvelope wraps a tool envelope + advisories', () => {
		const env: ICheckpointAdvisoryEnvelope<string> = {
			result: { ok: true, value: 'ok' },
			advisories: [{ id: 'x', severity: 'warning', message: 'm' }],
		};
		expect(env.result.ok).toBe(true);
		expect(env.advisories).toHaveLength(1);
	});
});
