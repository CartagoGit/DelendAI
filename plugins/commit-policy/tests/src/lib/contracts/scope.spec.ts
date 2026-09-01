import { describe, expect, it } from 'vitest';

import type { ConventionalHeaderRefusalCode } from '@mcp-vertex/commit-policy/lib/contracts/i18n-types';
import {
	buildScopedMessage,
	parseHeader,
	type IParsedConventionalHeader,
} from '@mcp-vertex/commit-policy/lib/contracts/scope';

import conventionalCases from '../../../fixtures/conventional-cases.json';

const DEFAULT_SCOPE = 'f00181';
const PROPERTY_CASE_COUNT = 1000;
const PROPERTY_SEED = 42;

interface ITruthTableCase {
	readonly input: string;
	readonly expected?: string;
	readonly refusal?: ConventionalHeaderRefusalCode;
}

const TRUTH_TABLE = conventionalCases as ReadonlyArray<ITruthTableCase>;

const recomposeHeader = (parsed: IParsedConventionalHeader): string => {
	const scope = parsed.scope === undefined ? '' : `(${parsed.scope})`;
	const bang = parsed.breaking ? '!' : '';
	return `${parsed.type}${scope}${bang}: ${parsed.subject}${parsed.rest}`;
};

const expectedAfterBuild = (
	parsed: IParsedConventionalHeader,
): IParsedConventionalHeader => ({
	...parsed,
	scope: parsed.scope ?? DEFAULT_SCOPE,
});

const expectParsedHeader = (
	actual: IParsedConventionalHeader,
	expected: IParsedConventionalHeader,
	context: string,
): void => {
	expect(actual.type, `${context} type`).toBe(expected.type);
	expect(actual.scope, `${context} scope`).toBe(expected.scope);
	expect(actual.breaking, `${context} breaking`).toBe(expected.breaking);
	expect(actual.subject, `${context} subject`).toBe(expected.subject);
	expect(actual.rest, `${context} rest`).toBe(expected.rest);
};

const mulberry32 = (seed: number): (() => number) => {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let next = Math.imul(state ^ (state >>> 15), 1 | state);
		next ^= next + Math.imul(next ^ (next >>> 7), 61 | next);
		return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
	};
};

const randomItem = <T>(rng: () => number, values: readonly T[]): T =>
	values[Math.floor(rng() * values.length)] ??
	values[0] ??
	(() => {
		throw new Error('randomItem requires a non-empty values array');
	})();

const randomCase = (rng: () => number, input: string): string => {
	const mode = Math.floor(rng() * 3);
	if (mode === 0) return input.toLowerCase();
	if (mode === 1) return input.toUpperCase();
	return Array.from(input)
		.map((char, index) => {
			if (index % 2 === 0) return char.toUpperCase();
			return char.toLowerCase();
		})
		.join('');
};

const randomWord = (rng: () => number): string =>
	randomItem(rng, [
		'alpha',
		'beta',
		'gamma',
		'delta',
		'omega',
		'commit',
		'parser',
		'scope',
		'rocket',
		'corrección',
		'ñandú',
		'emoji',
		'🎉',
		'build',
		'tabla',
	]);

const randomSubject = (rng: () => number): string => {
	const size = 1 + Math.floor(rng() * 4);
	return Array.from({ length: size }, () => randomWord(rng)).join(' ');
};

const randomScope = (rng: () => number): string => {
	const size = 1 + Math.floor(rng() * 3);
	return Array.from({ length: size }, () =>
		randomItem(rng, [
			'core',
			'deps',
			'api-v2',
			'client',
			'UI',
			'core,client',
		]),
	).join('-');
};

const randomRest = (rng: () => number): string => {
	if (rng() >= 0.35) return '';
	const separator = rng() < 0.5 ? '\n' : '\r\n';
	const detail = randomSubject(rng);
	if (rng() < 0.5) {
		return `${separator}${separator}${detail}`;
	}
	return `${separator}${separator}${detail}${separator}${separator}Refs: t00017`;
};

const generateValidMessage = (rng: () => number): string => {
	const type = randomCase(
		rng,
		randomItem(rng, [
			'feat',
			'fix',
			'chore',
			'docs',
			'refactor',
			'test',
			'build',
			'ci',
			'perf',
			'style',
			'xyz',
			'build.release',
		]),
	);
	const scope = rng() < 0.45 ? `(${randomScope(rng)})` : '';
	const bang = rng() < 0.2 ? '!' : '';
	const subject = randomSubject(rng);
	const rest = randomRest(rng);
	return `${type}${scope}${bang}: ${subject}${rest}`;
};

describe('contracts/scope (t00017 S1)', () => {
	describe('truth table fixture', () => {
		for (const testCase of TRUTH_TABLE) {
			it(`covers ${JSON.stringify(testCase.input)}`, () => {
				const parsed = parseHeader(testCase.input, 'es');
				const built = buildScopedMessage(testCase.input, {
					defaultScope: DEFAULT_SCOPE,
					locale: 'es',
				});

				if (testCase.refusal !== undefined) {
					expect(parsed.ok).toBe(false);
					if (!parsed.ok) {
						expect(parsed.code).toBe(testCase.refusal);
						expect(parsed.tip.length).toBeGreaterThan(0);
					}
					expect(built.ok).toBe(false);
					if (!built.ok) {
						expect(built.code).toBe(testCase.refusal);
						expect(built.tip.length).toBeGreaterThan(0);
					}
					return;
				}

				expect(parsed.ok).toBe(true);
				if (!parsed.ok) {
					return;
				}
				expect(recomposeHeader(parsed.value)).toBe(testCase.input);

				expect(built.ok).toBe(true);
				if (!built.ok) {
					return;
				}
				expect(built.value).toBe(testCase.expected);

				const reparsed = parseHeader(built.value);
				expect(reparsed.ok).toBe(true);
				if (!reparsed.ok) {
					return;
				}
				expect(recomposeHeader(reparsed.value)).toBe(built.value);
				expectParsedHeader(
					reparsed.value,
					expectedAfterBuild(parsed.value),
					`fixture ${JSON.stringify(testCase.input)}`,
				);

				const rebuilt = buildScopedMessage(built.value, {
					defaultScope: DEFAULT_SCOPE,
				});
				expect(rebuilt.ok).toBe(true);
				if (rebuilt.ok) {
					expect(rebuilt.value).toBe(built.value);
				}
			});
		}
	});

	it(`round-trips ${PROPERTY_CASE_COUNT} generated conventional headers with seed ${PROPERTY_SEED}`, () => {
		const rng = mulberry32(PROPERTY_SEED);

		for (let index = 0; index < PROPERTY_CASE_COUNT; index += 1) {
			const input = generateValidMessage(rng);
			const parsed = parseHeader(input);
			expect(
				parsed.ok,
				`generated case ${index}: ${JSON.stringify(input)}`,
			).toBe(true);
			if (!parsed.ok) {
				continue;
			}

			const built = buildScopedMessage(input, {
				defaultScope: DEFAULT_SCOPE,
			});
			expect(
				built.ok,
				`build should accept generated case ${index}: ${JSON.stringify(input)}`,
			).toBe(true);
			if (!built.ok) {
				continue;
			}

			const reparsed = parseHeader(built.value);
			expect(
				reparsed.ok,
				`rebuilt header should parse for case ${index}: ${JSON.stringify(built.value)}`,
			).toBe(true);
			if (!reparsed.ok) {
				continue;
			}

			expect(recomposeHeader(reparsed.value)).toBe(built.value);
			expectParsedHeader(
				reparsed.value,
				expectedAfterBuild(parsed.value),
				`generated case ${index}`,
			);

			const rebuilt = buildScopedMessage(built.value, {
				defaultScope: DEFAULT_SCOPE,
			});
			expect(rebuilt.ok).toBe(true);
			if (rebuilt.ok) {
				expect(rebuilt.value).toBe(built.value);
			}
		}
	});
});
