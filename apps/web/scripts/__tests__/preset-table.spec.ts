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
				'solo',
				'team-pr',
				'swarm',
				'audit',
				'docs-web',
				'everything',
				'dogfood',
			]);
		});

		it('column ids are deduplicated and in catalog order', () => {
			const matrix = buildPresetMatrix();
			const ids = matrix.columnIds;
			expect(new Set(ids).size).toBe(ids.length);
			expect(ids[0]).toBe('git');
			expect(ids[1]).toBe('search');
			// `everything` carries every published plugin, so the columns are
			// exactly its membership.
			expect(new Set(ids)).toEqual(
				new Set(
					matrix.rows.find((r) => r.preset.id === 'everything')
						?.effective,
				),
			);
		});

		it('row effective membership is the pack own list', () => {
			const matrix = buildPresetMatrix();
			const row = (id: string) =>
				matrix.rows.find((r) => r.preset.id === id);
			expect(row('minimal')?.effective).toEqual(['git', 'search']);
			expect(row('swarm')?.effective).toContain('proposals');
			expect(row('swarm')?.effective).not.toContain('audit');
			expect(row('everything')?.effective).toContain('issues');
			const dogfood = row('dogfood');
			expect(dogfood?.effective.length).toBe(38);
			expect(dogfood?.effective).toContain('proposals');
			expect(dogfood?.effective).not.toContain('refactor');
		});
	});

	describe('cellStateFor', () => {
		const matrix = buildPresetMatrix();

		it('returns "present" for a plugin in the preset effective set', () => {
			expect(cellStateFor(matrix, 'minimal', 'git')).toBe('present');
			expect(cellStateFor(matrix, 'swarm', 'proposals')).toBe('present');
		});

		it('returns "hostOnly" for a host-only plugin inside everything', () => {
			expect(cellStateFor(matrix, 'solo', 'audit')).toBe('absent');
			expect(cellStateFor(matrix, 'everything', 'issues')).toBe(
				'hostOnly',
			);
			expect(cellStateFor(matrix, 'everything', 'web-fetch')).toBe(
				'hostOnly',
			);
			expect(cellStateFor(matrix, 'foo', 'git')).toBe('absent');
		});

		it('returns "absent" for an unknown plugin id', () => {
			expect(cellStateFor(matrix, 'everything', 'doesnotexist')).toBe(
				'absent',
			);
		});
	});

	describe('totalUniquePlugins', () => {
		it('equals the column count', () => {
			const matrix = buildPresetMatrix();
			expect(totalUniquePlugins(matrix)).toBe(matrix.columnIds.length);
		});
	});
});
