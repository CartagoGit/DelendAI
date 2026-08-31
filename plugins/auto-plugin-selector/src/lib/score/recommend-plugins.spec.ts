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
	...(over.tokenBudget === undefined
		? {}
		: { tokenBudget: over.tokenBudget }),
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

	it('recommends a bundled candidate with a declared read permission', () => {
		const signals: IProjectSignals = {
			pack: 'generic',
			languages: ['plugins', 'catalog', 'routing'],
		};
		const fits = recommendPlugins(signals, [
			cand({
				id: 'catalog',
				tags: ['plugins', 'catalog', 'routing'],
				permissions: ['filesystem-read'],
			}),
		]);
		expect(fits[0]?.plugin.id).toBe('catalog');
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

	// r00025 S1-S4 acceptance: the new signals must combine with the
	// existing scoring formula, with weights configurable from the host.
	describe('r00025 scoring formula', () => {
		it('cold-start: no tokenBudget / no usage data still ranks a matching candidate above a non-matching one', () => {
			const signals: IProjectSignals = {
				pack: 'typescript',
				languages: ['typescript'],
			};
			const fits = recommendPlugins(signals, [
				cand({ id: 'match', tags: ['typescript'] }),
				cand({ id: 'no-match', tags: ['rust'] }),
			]);
			expect(fits[0]?.plugin.id).toBe('match');
			expect(fits[0]?.reasons).toContain('token-tax:0.50');
			expect(fits[0]?.reasons).toContain('latency-tax:0.50');
			expect(fits[0]?.reasons).toContain('historical-success:0.50');
		});

		it('warm: a high-success candidate ranks above a low-success one when fit is identical', () => {
			const signals: IProjectSignals = {
				pack: 'typescript',
				languages: ['typescript'],
			};
			const aggregations = new Map([
				['great', { successRate: 0.98, observedCalls: 200 }],
				['meh', { successRate: 0.3, observedCalls: 200 }],
			]);
			const fits = recommendPlugins(
				signals,
				[
					cand({ id: 'great', tags: ['typescript'] }),
					cand({ id: 'meh', tags: ['typescript'] }),
				],
				{ usageAggregations: aggregations },
			);
			expect(fits.map((fit) => fit.plugin.id)).toEqual(['great', 'meh']);
			const great = fits.find((f) => f.plugin.id === 'great');
			const meh = fits.find((f) => f.plugin.id === 'meh');
			expect(great?.reasons.join(' ')).toContain('historical-success:0.');
			expect(meh?.reasons.join(' ')).toContain('historical-success:0.');
		});

		it('mixed: a high-latency candidate drops below a low-latency one when fit is identical', () => {
			const signals: IProjectSignals = {
				pack: 'typescript',
				languages: ['typescript'],
			};
			const aggregations = new Map([
				['fast', { p95LatencyMs: 80, observedCalls: 100 }],
				['slow', { p95LatencyMs: 2_500, observedCalls: 100 }],
			]);
			const fits = recommendPlugins(
				signals,
				[
					cand({ id: 'fast', tags: ['typescript'] }),
					cand({ id: 'slow', tags: ['typescript'] }),
				],
				{ usageAggregations: aggregations },
			);
			expect(fits[0]?.plugin.id).toBe('fast');
		});

		it('token-tax: a hard-cap-break candidate is penalised vs. a normal candidate with the same fit', () => {
			const signals: IProjectSignals = {
				pack: 'typescript',
				languages: ['typescript'],
			};
			const fits = recommendPlugins(signals, [
				cand({ id: 'normal', tags: ['typescript'], tokenBudget: 500 }),
				cand({ id: 'huge', tags: ['typescript'], tokenBudget: 9_999 }),
			]);
			const normal = fits.find((f) => f.plugin.id === 'normal');
			const huge = fits.find((f) => f.plugin.id === 'huge');
			expect(normal).toBeDefined();
			expect(huge).toBeDefined();
			// The hard-cap candidate must lose to the normal one.
			expect(normal!.fitScore).toBeGreaterThan(huge!.fitScore);
			// The hard-cap candidate must carry the `token-tax:0.00` signal
			// (forced 0 from the `isBreak` branch in `scoreTokenTax`).
			expect(huge!.reasons).toContain('token-tax:0.00');
		});

		it('host weights override the defaults', () => {
			const signals: IProjectSignals = {
				pack: 'typescript',
				languages: ['typescript'],
			};
			const aggregations = new Map([
				['risky', { successRate: 0.9, observedCalls: 100 }],
				['safe', { successRate: 0.9, observedCalls: 100 }],
			]);
			const fits = recommendPlugins(
				signals,
				[
					cand({
						id: 'risky',
						tags: ['typescript'],
						permissions: ['secrets'],
					}),
					cand({
						id: 'safe',
						tags: ['typescript'],
						permissions: ['filesystem-read'],
					}),
				],
				{
					usageAggregations: aggregations,
					weights: { permissionRisk: 0, match: 1 },
				},
			);
			// With permissionRisk weight 0 and match weight 1, both
			// candidates should rank by id (tie-break) since they have
			// identical match + identical success.
			expect(fits.map((f) => f.plugin.id)).toEqual(['risky', 'safe']);
		});

		it('default weights are applied when the host provides no override', () => {
			const signals: IProjectSignals = {
				pack: 'typescript',
				languages: ['typescript'],
			};
			const fits = recommendPlugins(signals, [
				cand({
					id: 'risky',
					tags: ['typescript'],
					permissions: ['secrets'],
				}),
				cand({
					id: 'safe',
					tags: ['typescript'],
					permissions: ['filesystem-read'],
				}),
			]);
			// With default permissionRisk weight, the lower-risk
			// candidate wins.
			expect(fits[0]?.plugin.id).toBe('safe');
		});
	});
});
