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
			// x00166: vertex now mirrors delendai.config.json exactly —
			// its tail now also carries the manifest-driven plugins that only
			// appear there. Adding prompt-eval to full raises the total unique
			// plugin columns to 43.
			// (adaptive-optimizer, context-for-change, impact-analysis,
			// project-health, quality-policy) alongside the existing audit /
			// link-check / orchestrator-runner / perf / security /
			// tech-debt / usage-tracking tail.
			// f00177 / MAN-001: `changelog` removed from `full`/`cli-tool`
			// (private, never published to npm) drops the total to 42 — it
			// was the only preset-visible use of that column. The three
			// remote-provider plugins (remote-provider-core, github,
			// gitlab) added to `full` bring it to 49. The five plugins that
			// were loadable but reachable from no preset at all
			// (audit-orchestrator, browser, cache, external-mcps,
			// observability) were added to `full` and bring it to 54; they
			// cost a managed-lazy catalog entry, not an import, until one
			// of their tools is called.
			expect(ids.length).toBe(54);
			const tail = ids.slice(-12);
			expect(new Set(tail)).toEqual(
				new Set([
					'commit-policy',
					'context-for-change',
					'impact-analysis',
					'project-health',
					'project-kpis',
					'quality-policy',
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
			// but it IS in `vertex` (which mirrors the delendai project
			// config that loads it directly).
			expect(swarm?.effective).not.toContain('audit');
			expect(full?.effective).not.toContain('audit');
			// `logs` moved from full to swarm in a00032 S7.
			expect(swarm?.effective).toContain('logs');
			// `issues` stays in `full` (host-only).
			expect(full?.effective).toContain('issues');
			// x00166: `vertex` is independent — its effective membership
			// equals its 34 declared members, exactly mirroring
			// delendai.config.json
			// (including `proposals`, the orchestration plugin —
			// previously excluded, a stale drift).
			expect(vertex?.effective.length).toBe(38);
			expect(vertex?.effective).toContain('perf');
			expect(vertex?.effective).toContain('audit');
			expect(vertex?.effective).toContain('auto-agent-selector');
			expect(vertex?.effective).toContain('context-for-change');
			expect(vertex?.effective).toContain('project-health');
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
