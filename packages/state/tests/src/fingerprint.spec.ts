/**
 * fingerprint.spec.ts — q00018 Phase 0.1 S1, S7.
 *
 * Pins the fingerprint contract:
 *
 *   - input order does NOT change the fingerprint (set semantics)
 *   - the canonical fingerprint has NO salt / no storage identity
 *   - `fingerprintEqual` is reflexive and noise-independent
 */

import { describe, expect, it } from 'vitest';

import {
	fingerprintEqual,
	toCanonicalFingerprintShape,
	STATE_ABI_VERSION,
	type CanonicalProjectFingerprint,
	type IProducerInput,
} from '../../src/lib/fingerprint';

function build(
	overrides: Partial<CanonicalProjectFingerprint> = {},
): CanonicalProjectFingerprint {
	return {
		abiVersion: STATE_ABI_VERSION,
		producers: [
			{
				id: 'proposals',
				producerVersion: 1,
				abiVersion: STATE_ABI_VERSION,
				inputs: [
					{
						kind: 'path-glob',
						locator: 'docs/delendai/proposals/**/*.md',
						digest: 'a'.repeat(64),
					},
				],
			},
		],
		...overrides,
	};
}

const inputA: IProducerInput = {
	kind: 'path-glob',
	locator: 'docs/**/*.md',
	digest: 'b'.repeat(64),
};
const inputB: IProducerInput = {
	kind: 'git-blob',
	locator: 'deadbeef',
	digest: 'c'.repeat(64),
};

describe('CanonicalProjectFingerprint (q00018 S1)', () => {
	it('is reflexive', () => {
		const fp = build();
		expect(fingerprintEqual(fp, fp)).toBe(true);
	});

	it('S1 fix: does NOT contain a salt field', () => {
		const fp = build();
		// @ts-expect-error — defensive: there is no `salt` property.
		expect(fp.salt).toBeUndefined();
	});

	it('S7 fix: two producers with same inputs in different orders are equal', () => {
		const orderedAB = build({
			producers: [
				{
					id: 'p',
					producerVersion: 1,
					abiVersion: STATE_ABI_VERSION,
					inputs: [inputA, inputB],
				},
			],
		});
		const orderedBA = build({
			producers: [
				{
					id: 'p',
					producerVersion: 1,
					abiVersion: STATE_ABI_VERSION,
					inputs: [inputB, inputA],
				},
			],
		});
		expect(fingerprintEqual(orderedAB, orderedBA)).toBe(true);
	});

	it('different producerVersion yields a different fingerprint', () => {
		const a = build();
		const b = build({
			producers: [
				{
					id: 'proposals',
					producerVersion: 2,
					abiVersion: STATE_ABI_VERSION,
					inputs: [
						{
							kind: 'path-glob',
							locator: 'docs/delendai/proposals/**/*.md',
							digest: 'a'.repeat(64),
						},
					],
				},
			],
		});
		expect(fingerprintEqual(a, b)).toBe(false);
	});

	it('different input digest yields a different fingerprint', () => {
		const a = build();
		const b = build({
			producers: [
				{
					id: 'proposals',
					producerVersion: 1,
					abiVersion: STATE_ABI_VERSION,
					inputs: [
						{
							kind: 'path-glob',
							locator: 'docs/delendai/proposals/**/*.md',
							digest: 'd'.repeat(64),
						},
					],
				},
			],
		});
		expect(fingerprintEqual(a, b)).toBe(false);
	});

	it('toCanonicalFingerprintShape sorts producers lexicographically', () => {
		const fp = build({
			producers: [
				{
					id: 'zeta',
					producerVersion: 1,
					abiVersion: STATE_ABI_VERSION,
					inputs: [],
				},
				{
					id: 'alpha',
					producerVersion: 1,
					abiVersion: STATE_ABI_VERSION,
					inputs: [],
				},
			],
		});
		const shape = toCanonicalFingerprintShape(fp);
		expect(shape.producers.map((p) => p.id)).toEqual(['alpha', 'zeta']);
	});

	it('toCanonicalFingerprintShape strips undefined parserVersion', () => {
		const fp = build();
		const shape = toCanonicalFingerprintShape(fp);
		const firstInput = shape.producers[0]?.inputs[0];
		expect(firstInput).toBeDefined();
		expect(
			Object.prototype.hasOwnProperty.call(firstInput, 'parserVersion'),
		).toBe(false);
	});

	it('toCanonicalFingerprintShape keeps parserVersion when set', () => {
		const fp = build({
			producers: [
				{
					id: 'proposals',
					producerVersion: 1,
					abiVersion: STATE_ABI_VERSION,
					inputs: [
						{
							kind: 'path-glob',
							locator: 'docs/**/*.md',
							digest: 'a'.repeat(64),
							parserVersion: 2,
						},
					],
				},
			],
		});
		const shape = toCanonicalFingerprintShape(fp);
		expect(shape.producers[0]?.inputs[0]?.parserVersion).toBe(2);
	});
});
