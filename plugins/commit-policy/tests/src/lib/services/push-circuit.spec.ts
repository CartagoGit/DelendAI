import { describe, expect, it } from 'vitest';

import {
	buildPushCircuitNotice,
	createPushCircuit,
} from '../../../../src/lib/services/push-circuit';

describe('createPushCircuit', () => {
	it('opens after three identical failures', () => {
		// The observed bug: a config asking commit-policy to push to
		// `develop` while the repo's own pre-push discipline blocks
		// exactly that. Retried once a minute for twelve hours, with
		// the same message every time.
		const circuit = createPushCircuit();
		const refusal = 'push failed: push-to-develop-discipline';
		expect(circuit.record({ ok: false, refusal }).open).toBe(false);
		expect(circuit.record({ ok: false, refusal }).open).toBe(false);
		const third = circuit.record({ ok: false, refusal });
		expect(third.open).toBe(true);
		expect(circuit.shouldAttempt()).toBe(false);
	});

	it('announces exactly once, not on every subsequent attempt', () => {
		// A stop that logs every minute is the same noise as the loop.
		const circuit = createPushCircuit();
		const refusal = 'same';
		circuit.record({ ok: false, refusal });
		circuit.record({ ok: false, refusal });
		expect(circuit.record({ ok: false, refusal }).announce).toBe(true);
		expect(circuit.record({ ok: false, refusal }).announce).toBe(false);
	});

	it('does not open on failures that differ', () => {
		// Varying messages are the signature of a race — a lost ref
		// lock, an index.lock, a network blip — and those DO resolve by
		// retrying. Only an unchanging refusal is a policy.
		const circuit = createPushCircuit();
		circuit.record({ ok: false, refusal: 'cannot lock ref (a)' });
		circuit.record({ ok: false, refusal: 'cannot lock ref (b)' });
		circuit.record({ ok: false, refusal: 'cannot lock ref (c)' });
		expect(circuit.shouldAttempt()).toBe(true);
	});

	it('gives a newly-appearing refusal its own budget', () => {
		const circuit = createPushCircuit();
		circuit.record({ ok: false, refusal: 'old' });
		circuit.record({ ok: false, refusal: 'old' });
		circuit.record({ ok: false, refusal: 'new' });
		expect(circuit.shouldAttempt()).toBe(true);
	});

	it('closes on a success', () => {
		const circuit = createPushCircuit();
		for (let i = 0; i < 5; i += 1) {
			circuit.record({ ok: false, refusal: 'same' });
		}
		expect(circuit.shouldAttempt()).toBe(false);
		circuit.record({ ok: true });
		expect(circuit.shouldAttempt()).toBe(true);
	});

	it('re-announces after it has closed and opened again', () => {
		// A second outage is news again; suppressing it would hide a
		// recurrence behind the first report.
		const circuit = createPushCircuit();
		for (let i = 0; i < 3; i += 1) {
			circuit.record({ ok: false, refusal: 'same' });
		}
		circuit.record({ ok: true });
		circuit.record({ ok: false, refusal: 'same' });
		circuit.record({ ok: false, refusal: 'same' });
		expect(circuit.record({ ok: false, refusal: 'same' }).announce).toBe(
			true,
		);
	});
});

describe('buildPushCircuitNotice', () => {
	it('says what stopped, that nothing is lost, and what to change', () => {
		// A silent stop would be worse than the loop it replaces.
		const notice = buildPushCircuitNotice({
			refusal: 'push-to-develop-discipline',
			attempts: 3,
		});
		expect(notice).toContain('stopped pushing automatically');
		expect(notice).toContain('push-to-develop-discipline');
		expect(notice).toContain('Nothing is lost');
		expect(notice).toContain('explicit push still works');
		expect(notice).toContain('push.branch');
	});
});
