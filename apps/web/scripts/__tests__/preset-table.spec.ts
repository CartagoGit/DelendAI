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
				'lean',
				'standard',
				'swarm',
				'full',
				'vertex',
				'web-app',
				'backend-api',
				'cli-tool',
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
			// x00166: vertex now mirrors mcp-vertex.config.json exactly —
			// the last 8 unique columns are the ones only vertex
			// introduces (not already seen from minimal/lean/standard/
			// swarm/full): audit, auto-agent-selector, link-check,
			// orchestrator-runner, perf, security, tech-debt,
			// usage-tracking. 37 total columns (f00158 added
			// error-reporting, completion added its own plugin).
			expect(ids.length).toBe(37);
			const tail = ids.slice(-8);
			expect(new Set(tail)).toEqual(
				new Set([
					'audit',
					'auto-agent-selector',
					'link-check',
					'orchestrator-runner',
					'perf',
					'security',
					'tech-debt',
					'usage-tracking',
				]),
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
			// x00166: `vertex` is independent — its effective membership
			// equals its 29 declared members (f00158 added
			// error-reporting), exactly mirroring mcp-vertex.config.json
			// (including `proposals`, the orchestration plugin —
			// previously excluded, a stale drift).
			expect(vertex?.effective.length).toBe(30);
			expect(vertex?.effective).toContain('perf');
			expect(vertex?.effective).toContain('audit');
			expect(vertex?.effective).toContain('auto-agent-selector');
			expect(vertex?.effective).toContain('proposals');
			expect(vertex?.effective).toContain('memory');
			expect(vertex?.effective).not.toContain('refactor');
			expect(vertex?.effective).not.toContain('issues');
			expect(vertex?.effective).not.toContain('web-fetch');
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
