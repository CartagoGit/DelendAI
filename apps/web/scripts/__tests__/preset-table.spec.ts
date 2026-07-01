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
				'vertex',
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
			// The last ids are vertex's declared members (host-only tail):
			// vertex adds `audit` (opt-in) plus the 2 host-only (issues,
			// web-fetch) that vertex also carries. The exact tail order
			// depends on vertex's member order, so we assert the set is
			// exactly { issues, web-fetch, audit }.
			const tail = ids.slice(-3);
			expect(new Set(tail)).toEqual(
				new Set(['issues', 'web-fetch', 'audit']),
			);
		});

		it('row effective membership equals the ⊇ chain', () => {
			const matrix = buildPresetMatrix();
			const minimal = matrix.rows.find((r) => r.preset.id === 'minimal');
			const swarm = matrix.rows.find((r) => r.preset.id === 'swarm');
			const full = matrix.rows.find((r) => r.preset.id === 'full');
			const vertex = matrix.rows.find((r) => r.preset.id === 'vertex');
			expect(minimal?.effective).toEqual(['git', 'search']);
			expect(swarm?.effective).toContain('proposals');
			// `audit` is opt-in as of a00032 S7 — not in any chain preset,
			// but it IS in `vertex` (which mirrors the mcp-vertex project
			// config that loads it directly).
			expect(swarm?.effective).not.toContain('audit');
			expect(full?.effective).not.toContain('audit');
			// `logs` moved from full to swarm in a00032 S7.
			expect(swarm?.effective).toContain('logs');
			// `issues` stays in `full` (host-only).
			expect(full?.effective).toContain('issues');
			// `vertex` is independent — its effective membership equals
			// its 10 declared members, NOT swarm + a delta.
			expect(vertex?.effective.length).toBe(10);
			expect(vertex?.effective).toContain('audit');
			expect(vertex?.effective).toContain('issues');
			expect(vertex?.effective).toContain('web-fetch');
			expect(vertex?.effective).not.toContain('memory');
			expect(vertex?.effective).not.toContain('proposals');
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
