import { describe, expect, it } from 'vitest';

import type { IRoadmapGateEvidence } from '../../../../src/lib/contracts/interfaces/gate.interface';
import type { IRoadmapEntry } from '../../../../src/lib/contracts/interfaces/roadmap.interface';
import {
	evaluateEntryGates,
	evaluateGate,
} from '../../../../src/lib/gates/gate-evaluator.service';

const noEvidence: IRoadmapGateEvidence = {};

const entryWith = (gates: IRoadmapEntry['gates']): IRoadmapEntry => ({
	id: 'e1',
	title: 'An entry',
	kind: 'feature',
	state: 'committed',
	gates,
});

describe('evaluateGate', () => {
	it('answers unknown, not fail, when there is no evidence at all', () => {
		for (const gate of [
			{ kind: 'proposal-done', target: 'f1' },
			{ kind: 'path-exists', target: 'a/b.ts' },
			{ kind: 'check-green', target: 'build' },
			{ kind: 'attestation', description: 'reviewed' },
		] as const) {
			const verdict = evaluateGate(gate, noEvidence);
			expect(verdict.status).toBe('unknown');
			expect(verdict.reason.length).toBeGreaterThan(0);
		}
	});

	it('answers unknown for a gate that names nothing to look up', () => {
		expect(evaluateGate({ kind: 'path-exists' }, noEvidence).status).toBe(
			'unknown',
		);
		expect(evaluateGate({ kind: 'attestation' }, noEvidence).status).toBe(
			'unknown',
		);
	});

	it('passes and fails a proposal gate on its status', () => {
		const gate = { kind: 'proposal-done', target: 'f1' } as const;
		expect(
			evaluateGate(gate, { proposalStatus: () => 'done' }).status,
		).toBe('pass');
		const failed = evaluateGate(gate, { proposalStatus: () => 'ready' });
		expect(failed.status).toBe('fail');
		expect(failed.reason).toContain('ready');
	});

	it('judges a path, a check and an attestation from their evidence', () => {
		expect(
			evaluateGate(
				{ kind: 'path-exists', target: 'x' },
				{ pathExists: () => true },
			).status,
		).toBe('pass');
		expect(
			evaluateGate(
				{ kind: 'path-exists', target: 'x' },
				{ pathExists: () => false },
			).status,
		).toBe('fail');
		expect(
			evaluateGate(
				{ kind: 'check-green', target: 'build' },
				{ checkConclusion: () => 'success' },
			).status,
		).toBe('pass');
		expect(
			evaluateGate(
				{ kind: 'check-green', target: 'build' },
				{ checkConclusion: () => 'failure' },
			).status,
		).toBe('fail');
		expect(
			evaluateGate(
				{ kind: 'attestation', description: 'reviewed' },
				{ attested: () => true },
			).status,
		).toBe('pass');
	});

	it('treats an absent lookup answer as no evidence', () => {
		expect(
			evaluateGate(
				{ kind: 'proposal-done', target: 'f1' },
				{ proposalStatus: () => undefined },
			).status,
		).toBe('unknown');
	});
});

describe('evaluateEntryGates', () => {
	it('is unknown for an entry with no gates', () => {
		expect(evaluateEntryGates(entryWith([]), noEvidence).status).toBe(
			'unknown',
		);
	});

	it('passes only when every gate passes', () => {
		const entry = entryWith([
			{ kind: 'path-exists', target: 'a' },
			{ kind: 'path-exists', target: 'b' },
		]);
		expect(
			evaluateEntryGates(entry, { pathExists: () => true }).status,
		).toBe('pass');
	});

	it('fails as soon as one gate fails, even beside unknown ones', () => {
		const entry = entryWith([
			{ kind: 'path-exists', target: 'a' },
			{ kind: 'check-green', target: 'build' },
		]);
		expect(
			evaluateEntryGates(entry, { pathExists: () => false }).status,
		).toBe('fail');
	});

	it('stays unknown when some gates pass and the rest have no evidence', () => {
		const entry = entryWith([
			{ kind: 'path-exists', target: 'a' },
			{ kind: 'check-green', target: 'build' },
		]);
		const verdict = evaluateEntryGates(entry, { pathExists: () => true });
		expect(verdict.status).toBe('unknown');
		expect(verdict.reason).toContain('1 of 2');
	});
});
