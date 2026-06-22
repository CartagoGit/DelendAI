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
			// The last ids are host-only (full's deltas). `audit` is opt-in
			// as of the a00032 S7 preset recalibration (logs moved to swarm,
			// audit moved to opt-in), so the host-only tail is now just
			// web-fetch + issues.
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
			// `audit` is opt-in as of a00032 S7 — not in any preset.
			expect(swarm?.effective).not.toContain('audit');
			expect(full?.effective).not.toContain('audit');
			// `logs` moved from full to swarm in a00032 S7.
			expect(swarm?.effective).toContain('logs');
			// `issues` stays in `full` (host-only).
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
			// a00032 S7: `audit` is opt-in (no longer in any preset), so
			// `cellStateFor(matrix, 'full', 'audit')` is now "absent".
			expect(cellStateFor(matrix, 'full', 'audit')).toBe('absent');
			expect(cellStateFor(matrix, 'full', 'issues')).toBe('hostOnly');
			expect(cellStateFor(matrix, 'full', 'web-fetch')).toBe('hostOnly');
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
