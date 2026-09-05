/**
 * fingerprint.spec.ts — q00018 S2 acceptance.
 *
 * Pins the fingerprint contract: same producers + same inputs ⇒
 * same fingerprint; different inputs (different digest) ⇒
 * different fingerprint.
 */

import { describe, expect, it } from 'vitest';

import {
	fingerprintEqual,
	toCanonicalFingerprintShape,
	STATE_ABI_VERSION,
	type ProjectFingerprint,
} from '../../src/lib/fingerprint';

function buildFingerprint(
	overrides: Partial<ProjectFingerprint> = {},
): ProjectFingerprint {
	return {
		abiVersion: STATE_ABI_VERSION,
		salt: 'salt',
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

describe('ProjectFingerprint (q00018 S2)', () => {
	it('fingerprintEqual is reflexive', () => {
		const fp = buildFingerprint();
		expect(fingerprintEqual(fp, fp)).toBe(true);
	});

	it('different salt yields a different fingerprint', () => {
		const a = buildFingerprint({ salt: 'one' });
		const b = buildFingerprint({ salt: 'two' });
		expect(fingerprintEqual(a, b)).toBe(false);
	});

	it('different producerVersion yields a different fingerprint', () => {
		const a = buildFingerprint();
		const b = buildFingerprint({
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
		const a = buildFingerprint();
		const b = buildFingerprint({
			producers: [
				{
					id: 'proposals',
					producerVersion: 1,
					abiVersion: STATE_ABI_VERSION,
					inputs: [
						{
							kind: 'path-glob',
							locator: 'docs/delendai/proposals/**/*.md',
							digest: 'b'.repeat(64),
						},
					],
				},
			],
		});
		expect(fingerprintEqual(a, b)).toBe(false);
	});

	it('toCanonicalFingerprintShape preserves the array order', () => {
		const fp = buildFingerprint();
		const shape = toCanonicalFingerprintShape(fp);
		expect(shape.producers[0]?.id).toBe('proposals');
		expect(shape.producers[0]?.inputs[0]?.digest).toBe('a'.repeat(64));
	});

	it('toCanonicalFingerprintShape strips undefined parserVersion', () => {
		const fp = buildFingerprint();
		const shape = toCanonicalFingerprintShape(fp);
		const firstInput = shape.producers[0]?.inputs[0];
		expect(firstInput).toBeDefined();
		expect(
			Object.prototype.hasOwnProperty.call(firstInput, 'parserVersion'),
		).toBe(false);
	});

	it('toCanonicalFingerprintShape keeps parserVersion when set', () => {
		const fp = buildFingerprint({
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
