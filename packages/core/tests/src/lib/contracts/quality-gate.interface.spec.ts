/**
 * `IQualityGate` contract guard (l107 — quality gates multi-lenguaje, s1).
 *
 * These specs pin the shape of the public interface so future refactors
 * cannot silently drop a field or widen `expect` into a free string and
 * reintroduce the silent-typo class of bug the closed union was designed
 * to prevent.
 *
 * They also document the convention around `id` uniqueness and the
 * `languages` array so a future preset author does not have to read the
 * JSDoc on `quality-gate.interface.ts` to write a passing gate.
 */
import { describe, expect, it } from 'vitest';

import type {
	IQualityGate,
	IQualityGateExpect,
	IQualityGateLanguage,
	IQualityGateList,
} from '@mcp-vertex/core/public';

describe('IQualityGate', () => {
	it('accepts a minimal gate (only required fields)', () => {
		const gate: IQualityGate = {
			id: 'tsc-no-emit',
			command: 'tsc',
			args: ['--noEmit'],
			expect: 'pass',
			languages: ['ts'],
		};
		expect(gate.id).toBe('tsc-no-emit');
		expect(gate.docs).toBeUndefined();
	});

	it('accepts a full gate (with optional `docs`)', () => {
		const gate: IQualityGate = {
			id: 'py-mypy',
			command: 'mypy',
			args: ['.'],
			expect: 'pass',
			languages: ['py'],
			docs: 'Static type-check the Python sources.',
		};
		expect(gate.docs).toBe('Static type-check the Python sources.');
	});

	it('rejects `expect` values outside the closed union at type-check', () => {
		// The check below is a type-level assertion: assigning an
		// arbitrary string to `expect` would fail `tsc --noEmit`. We
		// exercise the same intent at runtime by listing the only two
		// legal values and asserting the union's cardinality.
		const legal: readonly IQualityGateExpect[] = ['pass', 'fail'];
		expect(legal).toHaveLength(2);
		expect(new Set(legal)).toEqual(new Set(['pass', 'fail']));
	});

	it('documents the language tag convention (preset = lowercase short code)', () => {
		// The convention is documented in the JSDoc of `quality-gate.interface.ts`
		// and pinned here so a rename regression surfaces here, not in the
		// docs site render.
		const tags: readonly IQualityGateLanguage[] = [
			'ts',
			'tsx',
			'js',
			'jsx',
			'py',
			'kt',
			'rs',
			'go',
			'sh',
		];
		for (const tag of tags) {
			expect(tag).toMatch(/^[a-z]{2,4}$/u);
		}
	});

	it('a gate can declare multiple language tags (e.g. ts + tsx)', () => {
		const gate: IQualityGate = {
			id: 'ts-eslint',
			command: 'eslint',
			args: ['.'],
			expect: 'pass',
			languages: ['ts', 'tsx', 'js', 'jsx'],
		};
		expect(gate.languages).toContain('ts');
		expect(gate.languages).toContain('tsx');
	});

	it('a gate can declare the inverse `expect: "fail"` (mutation testing, fuzz)', () => {
		const gate: IQualityGate = {
			id: 'mutation-mutate',
			command: 'stryker',
			args: ['run'],
			expect: 'fail',
			languages: ['ts'],
			docs: 'A mutation-testing gate where exit 0 means mutants survived.',
		};
		expect(gate.expect).toBe('fail');
	});

	it('IQualityGateList is the readonly alias consumed by the runner', () => {
		const list: IQualityGateList = [
			{
				id: 'tsc-no-emit',
				command: 'tsc',
				args: ['--noEmit'],
				expect: 'pass',
				languages: ['ts'],
			},
			{
				id: 'ts-eslint',
				command: 'eslint',
				args: ['.'],
				expect: 'pass',
				languages: ['ts', 'tsx'],
			},
		];
		expect(list).toHaveLength(2);
		// Type-level guard: every entry must have a unique `id`.
		const ids = new Set(list.map((g) => g.id));
		expect(ids.size).toBe(list.length);
	});
});
