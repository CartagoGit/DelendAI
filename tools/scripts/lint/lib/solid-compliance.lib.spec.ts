import { describe, expect, it } from 'vitest';

import type {
	ISolidFinding,
	ISolidScanResult,
} from '../solid-compliance.script';
import {
	buildSolidBaseline,
	EMPTY_SOLID_BASELINE,
	formatSolidBaseline,
	parseSolidBaseline,
	partitionSolidFindings,
	solidFindingBaselineKey,
} from './solid-compliance.lib';

const finding = (over: Partial<ISolidFinding> = {}): ISolidFinding => ({
	id: over.id ?? 'catch-swallow',
	priority: over.priority ?? 30,
	relPath: over.relPath ?? 'plugins/example/src/lib/a.ts',
	line: over.line ?? 4,
	message: over.message ?? 'empty catch block',
	snippet: over.snippet ?? '',
});

describe('solidFindingBaselineKey', () => {
	it('is stable for identical (id, relPath, line)', () => {
		const a = finding();
		const b = finding({ message: 'different message, same identity' });
		expect(solidFindingBaselineKey(a)).toBe(solidFindingBaselineKey(b));
	});

	it('differs when the rule id differs on the same path:line', () => {
		const a = finding({ id: 'catch-swallow' });
		const b = finding({ id: 'magic-number-in-plugin' });
		expect(solidFindingBaselineKey(a)).not.toBe(solidFindingBaselineKey(b));
	});
});

describe('partitionSolidFindings', () => {
	it('with an empty baseline, every finding is new', () => {
		const findings = [finding(), finding({ line: 10 })];
		const { newFindings, baselinedCount } = partitionSolidFindings(
			findings,
			EMPTY_SOLID_BASELINE,
		);
		expect(newFindings).toHaveLength(2);
		expect(baselinedCount).toBe(0);
	});

	it('suppresses findings whose exact (id, relPath, line) is baselined', () => {
		const known = finding();
		const fresh = finding({ line: 99 });
		const baseline = { entries: [solidFindingBaselineKey(known)] };
		const { newFindings, baselinedCount } = partitionSolidFindings(
			[known, fresh],
			baseline,
		);
		expect(newFindings).toEqual([fresh]);
		expect(baselinedCount).toBe(1);
	});

	it('does NOT suppress a different rule finding on the same path:line (this is the whole reason the key includes id)', () => {
		const baselinedCatch = finding({ id: 'catch-swallow' });
		const newMagicNumber = finding({ id: 'magic-number-in-plugin' });
		const baseline = {
			entries: [solidFindingBaselineKey(baselinedCatch)],
		};
		const { newFindings } = partitionSolidFindings(
			[baselinedCatch, newMagicNumber],
			baseline,
		);
		expect(newFindings).toEqual([newMagicNumber]);
	});
});

describe('buildSolidBaseline / parseSolidBaseline / formatSolidBaseline round-trip', () => {
	it('produces a sorted, deduplicated-by-content snapshot that round-trips through JSON', () => {
		const result: ISolidScanResult = {
			rootDir: '/tmp',
			findings: [finding({ line: 20 }), finding({ line: 1 })],
			scannedFiles: 1,
			elapsedMs: 1,
		};
		const baseline = buildSolidBaseline(result);
		expect(baseline.entries).toEqual([...baseline.entries].sort());
		const formatted = formatSolidBaseline(baseline);
		const parsed = parseSolidBaseline(formatted);
		expect(parsed).toEqual(baseline);
	});

	it('parseSolidBaseline rejects a malformed shape', () => {
		expect(() =>
			parseSolidBaseline('{"entries": "not-an-array"}'),
		).toThrow();
		expect(() => parseSolidBaseline('{}')).toThrow();
	});

	it('parseSolidBaseline drops non-string entries defensively', () => {
		const parsed = parseSolidBaseline(
			JSON.stringify({ entries: ['ok:a.ts:1', 42, null] }),
		);
		expect(parsed.entries).toEqual(['ok:a.ts:1']);
	});
});

describe('acceptance: re-introducing a known catch-swallow surfaces as exactly one new finding', () => {
	it('a baseline built from one scan reports 0 new findings on the identical scan, then 1 new finding after a fresh violation is added', () => {
		const before: ISolidScanResult = {
			rootDir: '/tmp',
			findings: [finding({ relPath: 'plugins/x/src/lib/a.ts', line: 5 })],
			scannedFiles: 1,
			elapsedMs: 1,
		};
		const baseline = buildSolidBaseline(before);
		const { newFindings: none } = partitionSolidFindings(
			before.findings,
			baseline,
		);
		expect(none).toHaveLength(0);

		const reintroduced = finding({
			relPath: 'plugins/x/src/lib/b.ts',
			line: 12,
		});
		const { newFindings: one } = partitionSolidFindings(
			[...before.findings, reintroduced],
			baseline,
		);
		expect(one).toEqual([reintroduced]);
	});
});

describe('line-insensitive budget matching', () => {
	it('still baselines a finding whose line number drifted', () => {
		// One baselined finding, now reported 40 lines lower because an
		// unrelated import was added above it. Under exact-line matching
		// this looked like a brand-new violation and failed the gate.
		const { newFindings, baselinedCount } = partitionSolidFindings(
			[
				finding({
					id: 'magic-number-in-plugin',
					relPath: 'plugins/a/src/x.ts',
					line: 140,
				}),
			],
			{ entries: ['magic-number-in-plugin:plugins/a/src/x.ts:100'] },
		);
		expect(newFindings).toEqual([]);
		expect(baselinedCount).toBe(1);
	});

	it('still fails when a file gains an extra finding of the same rule', () => {
		const { newFindings } = partitionSolidFindings(
			[
				finding({
					id: 'magic-number-in-plugin',
					relPath: 'plugins/a/src/x.ts',
					line: 10,
				}),
				finding({
					id: 'magic-number-in-plugin',
					relPath: 'plugins/a/src/x.ts',
					line: 20,
				}),
			],
			{ entries: ['magic-number-in-plugin:plugins/a/src/x.ts:100'] },
		);
		expect(newFindings).toHaveLength(1);
	});

	it('does not let one rule budget another rule in the same file', () => {
		const { newFindings } = partitionSolidFindings(
			[
				finding({
					id: 'catch-swallow',
					relPath: 'plugins/a/src/x.ts',
					line: 10,
				}),
			],
			{ entries: ['magic-number-in-plugin:plugins/a/src/x.ts:10'] },
		);
		expect(newFindings).toHaveLength(1);
	});

	it('does not let one file budget another file', () => {
		const { newFindings } = partitionSolidFindings(
			[
				finding({
					id: 'catch-swallow',
					relPath: 'plugins/b/src/y.ts',
					line: 10,
				}),
			],
			{ entries: ['catch-swallow:plugins/a/src/x.ts:10'] },
		);
		expect(newFindings).toHaveLength(1);
	});
});
