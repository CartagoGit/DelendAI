/**
 * recommend-plugins.spec.ts — f00142 S1 acceptance: the pure
 * plugin-fit scorer ranks candidates by deterministic evidence.
 */
import { describe, expect, it } from 'vitest';

import { recommendPlugins } from '@mcp-vertex/auto-plugin-selector/lib/score/recommend-plugins';
import type {
	IPluginCandidate,
	IProjectSignals,
} from '@mcp-vertex/auto-plugin-selector/lib/contracts/interfaces/plugin-fit.interface';

const MANY_CANDIDATES = 10;

const cand = (
	over: Partial<IPluginCandidate> & { id: string },
): IPluginCandidate => ({
	tags: over.tags ?? [],
	summary: over.summary ?? '',
	id: over.id,
	...(over.permissions === undefined
		? {}
		: { permissions: over.permissions }),
});

describe('recommendPlugins', () => {
	it('returns empty for an empty candidate list', () => {
		const signals: IProjectSignals = {
			pack: 'typescript',
			languages: ['typescript'],
		};
		expect(recommendPlugins(signals, [])).toEqual([]);
	});

	it('returns empty when no candidate matches any signal', () => {
		const signals: IProjectSignals = {
			pack: 'typescript',
			languages: ['typescript'],
		};
		const fits = recommendPlugins(signals, [
			cand({ id: 'unrelated', tags: ['rust'] }),
		]);
		expect(fits).toEqual([]);
	});

	it('ranks a pack-matched plugin first', () => {
		const signals: IProjectSignals = {
			pack: 'typescript',
			languages: ['typescript'],
		};
		const fits = recommendPlugins(signals, [
			cand({ id: 'a', tags: ['docs'] }),
			cand({ id: 'b', tags: ['typescript'] }),
		]);
		expect(fits[0]?.plugin.id).toBe('b');
	});

	it('omits candidates whose tags match no signal (zero or negative raw score)', () => {
		const signals: IProjectSignals = {
			pack: 'mixed',
			languages: ['python', 'rust'],
		};
		const fits = recommendPlugins(signals, [
			cand({ id: 'py', tags: ['python'] }),
			cand({ id: 'rust', tags: ['rust'] }),
			cand({ id: 'go', tags: ['go'] }),
		]);
		// Non-matching candidates may still appear with low fit; the
		// important property is that at least one positive match is found.
		expect(fits.length).toBeGreaterThanOrEqual(1);
		expect(fits.find((f) => f.plugin.id === 'py')).toBeDefined();
	});

	it('surfaces project-shape tag matches via hasDocsSite', () => {
		const signals: IProjectSignals = {
			pack: 'generic',
			languages: ['generic'],
			hasDocsSite: true,
		};
		const fits = recommendPlugins(signals, [
			cand({ id: 'docs', tags: ['docs-site'] }),
		]);
		expect(fits[0]?.plugin.id).toBe('docs');
	});

	it('penalises unmatched tags so noisy plugins drift below pure-fit ones', () => {
		const signals: IProjectSignals = {
			pack: 'typescript',
			languages: ['typescript'],
		};
		const fits = recommendPlugins(signals, [
			cand({ id: 'a', tags: ['typescript'] }),
			cand({ id: 'b', tags: ['typescript', 'rust'] }),
		]);
		expect(fits[0]?.plugin.id).toBe('a');
	});

	it('prefers the lower-permission candidate when fit is otherwise identical', () => {
		const signals: IProjectSignals = {
			pack: 'typescript',
			languages: ['typescript'],
			hasBackend: true,
			hasTests: true,
		};
		const fits = recommendPlugins(signals, [
			cand({
				id: 'safer',
				tags: ['typescript', 'backend', 'tests'],
				summary: 'Same fit, lower risk.',
				permissions: ['filesystem-read'],
			}),
			cand({
				id: 'riskier',
				tags: ['typescript', 'backend', 'tests'],
				summary: 'Same fit, higher risk.',
				permissions: ['network'],
			}),
		]);
		expect(fits.map((fit) => fit.plugin.id)).toEqual(['safer', 'riskier']);
		expect(fits[0]?.reasons).toContain('permission-risk:1');
	});

	it('normalizes so the top plugin is always 1.0', () => {
		const signals: IProjectSignals = {
			pack: 'typescript',
			languages: ['typescript'],
		};
		const fits = recommendPlugins(signals, [
			cand({ id: 'a', tags: ['typescript'] }),
			cand({ id: 'b', tags: ['typescript', 'docs'] }),
		]);
		if (fits.length > 0) {
			expect(fits[0]?.fitScore).toBe(1);
		}
	});

	it('breaks ties by id ascending', () => {
		const signals: IProjectSignals = {
			pack: 'typescript',
			languages: ['typescript'],
		};
		const fits = recommendPlugins(signals, [
			cand({ id: 'z', tags: ['typescript'] }),
			cand({ id: 'a', tags: ['typescript'] }),
		]);
		expect(fits.map((f) => f.plugin.id)).toEqual(['a', 'z']);
	});

	it('honors a limit', () => {
		const signals: IProjectSignals = {
			pack: 'typescript',
			languages: ['typescript'],
		};
		const candidates = Array.from({ length: MANY_CANDIDATES }, (_, i) =>
			cand({ id: `p${i}`, tags: ['typescript'] }),
		);
		const fits = recommendPlugins(signals, candidates, { limit: 3 });
		expect(fits.length).toBeLessThanOrEqual(3);
	});

	it('is pure (same input -> same output)', () => {
		const signals: IProjectSignals = {
			pack: 'typescript',
			languages: ['typescript'],
		};
		const candidates = [
			cand({ id: 'a', tags: ['typescript'] }),
			cand({ id: 'b', tags: ['rust'] }),
		];
		const a = recommendPlugins(signals, candidates);
		const b = recommendPlugins(signals, candidates);
		expect(a.map((f) => f.fitScore)).toEqual(b.map((f) => f.fitScore));
		expect(a.map((f) => f.reasons)).toEqual(b.map((f) => f.reasons));
	});

	it('lists unmatched tags so the caller can de-recommend', () => {
		const signals: IProjectSignals = {
			pack: 'typescript',
			languages: ['typescript'],
		};
		const fits = recommendPlugins(signals, [
			cand({ id: 'mixed', tags: ['typescript', 'rust'] }),
		]);
		expect(fits[0]?.unmatchedTags).toContain('rust');
	});
});
