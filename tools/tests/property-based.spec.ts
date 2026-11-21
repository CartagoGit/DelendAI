import { Buffer } from 'node:buffer';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	redactSecrets,
	resolveWorkspaceContained,
	truncateIfTooLarge,
} from '@delendai/core/public';
import {
	validateSafeReport,
	validateSerializedSafeReport,
	type ISafeDelendaiReport,
} from '@delendai/error-reporting/public';

const mulberry32 = (seed: number) => {
	let value = seed;
	return (): number => {
		value |= 0;
		value = (value + 0x6d2b79f5) | 0;
		let next = Math.imul(value ^ (value >>> 15), 1 | value);
		next = (next + Math.imul(next ^ (next >>> 7), 61 | next)) ^ next;
		return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
	};
};

const WORDS = [
	'agent',
	'proposal',
	'slice',
	'queue',
	'validate',
	'catalog',
	'workspace',
	'router',
	'plugin',
	'status',
	'memory',
	'review',
] as const;

const ALPHANUM =
	'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const ROOT = resolve('/workspace/root');
const TRIALS = 40;

const pick = <T>(rng: () => number, values: readonly T[]): T => {
	if (values.length === 0) throw new Error('pick requires a non-empty list');
	const index = Math.floor(rng() * values.length);
	return values[index] ?? values[0]!;
};

const randomInt = (rng: () => number, maxExclusive: number): number =>
	Math.floor(rng() * maxExclusive);

const randomString = (rng: () => number, length: number): string => {
	let out = '';
	for (let index = 0; index < length; index += 1) {
		out += ALPHANUM[randomInt(rng, ALPHANUM.length)] ?? 'x';
	}
	return out;
};

const randomWord = (rng: () => number): string =>
	`${pick(rng, WORDS)}-${randomInt(rng, 10_000)}`;

const randomSentence = (rng: () => number, count: number): string =>
	Array.from({ length: count }, () => randomWord(rng)).join(' ');

const buildInsideChild = (rng: () => number): string => {
	const parts: string[] = [];
	let depth = 0;
	const steps = 1 + randomInt(rng, 6);
	for (let index = 0; index < steps; index += 1) {
		const mode = randomInt(rng, 4);
		if (mode === 0) {
			parts.push('.');
			continue;
		}
		const segment = randomWord(rng);
		parts.push(segment);
		depth += 1;
		if (mode === 1 && depth > 0) {
			parts.push('..');
			depth -= 1;
		}
	}
	return parts.join('/');
};

const buildEscapeChild = (rng: () => number): string => {
	const upLevels = 1 + randomInt(rng, 4);
	const suffix = Array.from({ length: 1 + randomInt(rng, 3) }, () =>
		randomWord(rng),
	).join('/');
	return `${'../'.repeat(upLevels)}${suffix}`;
};

const randomHex = (rng: () => number, length: number): string => {
	const HEX = '0123456789abcdef';
	let out = '';
	for (let index = 0; index < length; index += 1) {
		out += HEX[randomInt(rng, HEX.length)] ?? '0';
	}
	return out;
};

const randomUuid = (rng: () => number): string =>
	`${randomHex(rng, 8)}-${randomHex(rng, 4)}-4${randomHex(rng, 3)}-a${randomHex(rng, 3)}-${randomHex(rng, 12)}`;

const SECRET_GENERATORS: ReadonlyArray<{
	readonly name: string;
	readonly build: (rng: () => number) => string;
}> = [
	{
		name: 'aws-access-key',
		build: (rng) => `AKIA${randomString(rng, 16).toUpperCase()}`,
	},
	{
		name: 'github-token',
		build: (rng) => `ghp_${randomString(rng, 36)}`,
	},
	{
		name: 'openrouter-key',
		build: (rng) => `sk-or-v1-${randomString(rng, 24)}`,
	},
	{
		name: 'jwt',
		build: (rng) =>
			`eyJ${randomString(rng, 12)}.${randomString(rng, 12)}.${randomString(rng, 12)}`,
	},
	{
		name: 'assignment',
		build: (rng) => `API_KEY=${randomString(rng, 18)}`,
	},
];

const baseReport: ISafeDelendaiReport = {
	reporterVersion: '0.1.0',
	delendaiVersion: '0.1.0',
	packageId: '@delendai/error-reporting',
	toolOwner: 'delendai',
	toolCategory: 'reporting',
	errorCode: 'PLUGIN_REGISTER_TIMEOUT',
	failureClass: 'INTERNAL_TIMEOUT',
	classification: 'PERFORMANCE',
	fingerprint: 'property-based-fingerprint',
	mcpFrames: [
		{ file: '@delendai/error-reporting/src/index.ts', line: 1, col: 1 },
	],
	environmentClass: { runtime: 'bun', platformFamily: 'linux' },
};

const buildRandomJson = (rng: () => number, depth: number): unknown => {
	if (depth <= 0) {
		switch (randomInt(rng, 4)) {
			case 0:
				return randomSentence(rng, 1 + randomInt(rng, 5));
			case 1:
				return randomInt(rng, 1_000_000);
			case 2:
				return rng() > 0.5;
			default:
				return null;
		}
	}
	if (rng() > 0.5) {
		return Array.from({ length: 1 + randomInt(rng, 4) }, () =>
			buildRandomJson(rng, depth - 1),
		);
	}
	return Object.fromEntries(
		Array.from({ length: 1 + randomInt(rng, 4) }, () => [
			randomWord(rng),
			buildRandomJson(rng, depth - 1),
		]),
	);
};

describe('property-based containment', () => {
	it('keeps generated inside paths contained and normalized', () => {
		const rng = mulberry32(0x51ce);
		for (let trial = 0; trial < TRIALS; trial += 1) {
			const child = buildInsideChild(rng);
			const result = resolveWorkspaceContained(ROOT, child);
			expect(result.ok).toBe(true);
			expect(
				result.abs === ROOT || result.abs.startsWith(`${ROOT}/`),
			).toBe(true);
			expect(result.rel.includes('\\')).toBe(false);
			expect(result.rel === '..' || result.rel.startsWith('../')).toBe(
				false,
			);
		}
	});

	it('rejects generated escape attempts and absolute children', () => {
		const rng = mulberry32(0xe5ca9e);
		for (let trial = 0; trial < TRIALS; trial += 1) {
			const escaped = resolveWorkspaceContained(
				ROOT,
				buildEscapeChild(rng),
			);
			expect(escaped.ok).toBe(false);
			const absolute = resolveWorkspaceContained(
				ROOT,
				resolve(ROOT, buildInsideChild(rng)),
			);
			expect(absolute.ok).toBe(false);
		}
	});
});

describe('property-based redaction', () => {
	it('is idempotent and removes generated secrets embedded in JSON-ish payloads', () => {
		const rng = mulberry32(0x7e2ac7);
		for (const generator of SECRET_GENERATORS) {
			for (let trial = 0; trial < TRIALS; trial += 1) {
				const secret = generator.build(rng);
				const input = JSON.stringify({
					kind: generator.name,
					note: randomSentence(rng, 4),
					secret,
				});
				const once = redactSecrets(input);
				const twice = redactSecrets(once.text);
				expect(once.redactions).toBeGreaterThan(0);
				expect(once.text).not.toContain(secret);
				expect(twice.text).toBe(once.text);
				expect(twice.redactions).toBe(0);
			}
		}
	});

	it('leaves plain generated prose unchanged', () => {
		const rng = mulberry32(0x91a11);
		for (let trial = 0; trial < TRIALS; trial += 1) {
			const input = randomSentence(rng, 8);
			const result = redactSecrets(input);
			expect(result.redactions).toBe(0);
			expect(result.text).toBe(input);
		}
	});
});

describe('property-based privacy validation', () => {
	const privateMarkers: ReadonlyArray<{
		readonly reason: string;
		readonly serialized: boolean;
		readonly build: (rng: () => number) => string;
	}> = [
		{
			reason: 'absolute-path',
			serialized: true,
			build: (rng) => `/home/${randomWord(rng)}/${randomWord(rng)}`,
		},
		{
			reason: 'windows-path',
			serialized: false,
			build: (rng) => `C:\\Users\\${randomWord(rng)}\\${randomWord(rng)}`,
		},
		{
			reason: 'url-not-allowlisted',
			serialized: true,
			build: (rng) =>
				`https://${randomWord(rng)}.corp.example.org/${randomWord(rng)}`,
		},
		{
			reason: 'email',
			serialized: true,
			build: (rng) => `${randomWord(rng)}@example.net`,
		},
		{
			reason: 'ip-address',
			serialized: true,
			build: (rng) =>
				`${randomInt(rng, 255)}.${randomInt(rng, 255)}.${randomInt(rng, 255)}.${randomInt(rng, 255)}`,
		},
		{
			reason: 'uuid',
			serialized: true,
			build: (rng) => randomUuid(rng),
		},
		{
			reason: 'token',
			serialized: true,
			build: (rng) => `Authorization: Bearer ${randomString(rng, 24)}`,
		},
		{
			reason: 'branch-name',
			serialized: true,
			build: (rng) =>
				`origin/feature/${randomWord(rng)}-${randomWord(rng)}`,
		},
	];

	it('fails closed for generated private markers in both DTO and serialized forms', () => {
		const rng = mulberry32(0xa11ce7);
		for (const marker of privateMarkers) {
			for (let trial = 0; trial < 8; trial += 1) {
				const value = ` ${marker.build(rng)}`;
				const report: ISafeDelendaiReport = {
					...baseReport,
					syntheticExample: {
						summary: value,
						source: 'fixture-fallback',
						fixtureId: 'property-based',
						fixtureDomain: 'property-based',
						argumentType: 'object',
					},
				};
				expect(validateSafeReport(report)).toEqual({
					ok: false,
					reasonCode: marker.reason,
				});
				if (marker.serialized) {
					expect(
						validateSerializedSafeReport(JSON.stringify(report)),
					).toEqual({
						ok: false,
						reasonCode: marker.reason,
					});
				}
			}
		}
	});
});

describe('property-based truncation', () => {
	it('never lies about the byte budget: finalBytes fits or the envelope is clamped', () => {
		const rng = mulberry32(0x7a1ca7e);
		for (let trial = 0; trial < TRIALS; trial += 1) {
			const value = buildRandomJson(rng, 3);
			const maxBytes = 24 + randomInt(rng, 256);
			const result = truncateIfTooLarge(value, maxBytes);
			const serialized = JSON.stringify(result.value);
			expect(Buffer.byteLength(serialized, 'utf8')).toBe(
				result.finalBytes,
			);
			if (result.truncated === false) {
				expect(result.originalBytes).toBe(result.finalBytes);
				expect(result.finalBytes).toBeLessThanOrEqual(maxBytes);
				continue;
			}
			if (result.clamped === true) {
				expect(result.finalBytes).toBeGreaterThan(maxBytes);
				expect((result.value as { clamped?: true }).clamped).toBe(true);
				continue;
			}
			expect(result.finalBytes).toBeLessThanOrEqual(maxBytes);
		}
	});
});
