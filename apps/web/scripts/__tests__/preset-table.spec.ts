import { describe, expect, it } from 'vitest';

import {
	buildPresetMatrix,
	cellStateFor,
	totalUniquePlugins,
} from '../../src/lib/preset-table';

describe('preset-table', () => {
	describe('buildPresetMatrix', () => {
		it('emits one row per preset in catalog order', () => {
			const matrix = buildPresetMatrix();
			expect(matrix.rows.map((r) => r.preset.id)).toEqual([
				'minimal',
				'standard',
				'swarm',
				'full',
			]);
		});

		it('column ids are deduplicated and in catalog order', () => {
			const matrix = buildPresetMatrix();
			const ids = matrix.columnIds;
			// No duplicates
			expect(new Set(ids).size).toBe(ids.length);
			// First ids come from minimal (git, search)
			expect(ids[0]).toBe('git');
			expect(ids[1]).toBe('search');
			// The last ids are host-only (full's deltas)
			expect(ids.at(-4)).toBe('audit');
			expect(ids.at(-3)).toBe('logs');
			expect(ids.at(-2)).toBe('web-fetch');
			expect(ids.at(-1)).toBe('issues');
		});

		it('row effective membership equals the ⊇ chain', () => {
			const matrix = buildPresetMatrix();
			const minimal = matrix.rows.find((r) => r.preset.id === 'minimal');
			const swarm = matrix.rows.find((r) => r.preset.id === 'swarm');
			const full = matrix.rows.find((r) => r.preset.id === 'full');
			expect(minimal?.effective).toEqual(['git', 'search']);
			expect(swarm?.effective).toContain('proposals');
			expect(swarm?.effective).not.toContain('audit');
			expect(full?.effective).toContain('audit');
			expect(full?.effective).toContain('issues');
		});
	});

	describe('cellStateFor', () => {
		const matrix = buildPresetMatrix();

		it('returns "present" for a plugin in the preset effective set', () => {
			expect(cellStateFor(matrix, 'minimal', 'git')).toBe('present');
			expect(cellStateFor(matrix, 'swarm', 'proposals')).toBe('present');
		});

		it('returns "hostOnly" for a host-only plugin inside full', () => {
			expect(cellStateFor(matrix, 'full', 'audit')).toBe('hostOnly');
			expect(cellStateFor(matrix, 'full', 'issues')).toBe('hostOnly');
		});

		it('returns "absent" for a plugin not in the preset', () => {
			expect(cellStateFor(matrix, 'minimal', 'proposals')).toBe('absent');
			expect(cellStateFor(matrix, 'standard', 'audit')).toBe('absent');
		});

		it('returns "absent" for an unknown preset id', () => {
			expect(cellStateFor(matrix, 'foo', 'git')).toBe('absent');
		});

		it('returns "absent" for an unknown plugin id', () => {
			expect(cellStateFor(matrix, 'full', 'doesnotexist')).toBe('absent');
		});
	});

	describe('totalUniquePlugins', () => {
		it('equals the column count', () => {
			const matrix = buildPresetMatrix();
			expect(totalUniquePlugins(matrix)).toBe(matrix.columnIds.length);
		});
	});
});
