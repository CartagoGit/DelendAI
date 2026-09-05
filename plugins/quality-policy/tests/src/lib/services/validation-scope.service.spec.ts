import { describe, expect, it } from 'vitest';

import {
	decideValidationScope,
	fromImpactAnalysis,
	wideningAddsCoverage,
	type IImpactAnalysisLike,
	type IImpactGraph,
	type TChangeBoundary,
} from '../../../../src/lib/services/validation-scope.service';

const graph = (partial: Partial<IImpactGraph> = {}): IImpactGraph => ({
	changedFiles: ['packages/core/src/lib/a.ts'],
	dependentFiles: [],
	affectedPackages: ['@delendai/core'],
	coveringTests: ['packages/core/tests/src/lib/a.spec.ts'],
	totalTests: 400,
	...partial,
});

describe('validation scope (f00506 S3)', () => {
	describe('hard boundaries do not negotiate with the graph', () => {
		const forced: readonly TChangeBoundary[] = [
			'public-contract',
			'security',
			'release',
			'main-branch',
		];

		for (const boundary of forced) {
			it(`forces the full suite for a ${boundary} change, however small the graph`, () => {
				// The graph describes what it can see, and these are the
				// changes whose blast radius escapes it.
				const decision = decideValidationScope(
					graph({
						changedFiles: ['a.ts'],
						dependentFiles: [],
						affectedPackages: ['one'],
					}),
					boundary,
				);

				expect(decision.scope).toBe('full');
				expect(decision.forcedBy).toBe(boundary);
				expect(decision.reason).toContain('does not get a vote');
			});
		}

		it('says why a public contract escapes local analysis', () => {
			expect(
				decideValidationScope(graph(), 'public-contract').reason,
			).toContain('outside this repository');
		});

		it('treats generated output as wider than the change but narrower than everything', () => {
			const decision = decideValidationScope(
				graph({ dependentFiles: ['b.ts'] }),
				'generated-output',
			);

			expect(decision.scope).toBe('affected');
			expect(decision.forcedBy).toBe('generated-output');
		});
	});

	describe('an unresolved graph is not evidence of a small change', () => {
		it('falls back to the full suite rather than to the cheap reading', () => {
			// Absence of evidence, and the safe reading of absence is the
			// expensive one.
			const decision = decideValidationScope(graph({ incomplete: true }));

			expect(decision.scope).toBe('full');
			expect(decision.reason).toContain('not evidence');
		});

		it('does not let an unresolved graph override a hard boundary either', () => {
			expect(
				decideValidationScope(graph({ incomplete: true }), 'security')
					.forcedBy,
			).toBe('security');
		});
	});

	describe('narrowing when the graph proves it is safe', () => {
		it('runs only the covering tests for a self-contained change', () => {
			const decision = decideValidationScope(
				graph({
					dependentFiles: [],
					affectedPackages: ['@delendai/core'],
				}),
			);

			expect(decision.scope).toBe('targeted');
			expect(decision.reason).toContain('whole blast radius');
		});

		it('widens once something depends on the change', () => {
			const decision = decideValidationScope(
				graph({
					dependentFiles: ['plugins/git/src/x.ts'],
					affectedPackages: ['@delendai/core', 'git'],
				}),
			);

			expect(decision.scope).toBe('affected');
			expect(decision.reason).toContain('depend on the change');
		});

		it('has nothing to prove when nothing changed', () => {
			const decision = decideValidationScope(graph({ changedFiles: [] }));

			expect(decision.scope).toBe('targeted');
			expect(decision.reason).toContain('nothing to re-prove');
		});
	});

	describe('not widening is a decision, and it needs the same evidence', () => {
		it('refuses to widen when it would cover nothing new', () => {
			// Running the same tests under a more expensive name is not
			// caution, it is ceremony.
			const decision = decideValidationScope(
				graph({
					dependentFiles: ['b.ts'],
					affectedPackages: ['core', 'git'],
					coveringTests: Array.from(
						{ length: 400 },
						(_u, i) => `t${i.toString()}.spec.ts`,
					),
					totalTests: 400,
				}),
			);

			expect(decision.scope).toBe('affected');
			expect(decision.reason).toContain('already every test there is');
		});

		it('reports whether widening would add coverage at all', () => {
			expect(
				wideningAddsCoverage(
					graph({ coveringTests: ['a'], totalTests: 400 }),
				),
			).toBe(true);
			expect(
				wideningAddsCoverage(
					graph({ coveringTests: ['a', 'b'], totalTests: 2 }),
				),
			).toBe(false);
		});
	});

	describe('every decision can be checked against the tree afterwards', () => {
		it('records what it rested on', () => {
			const decision = decideValidationScope(
				graph({
					changedFiles: ['a.ts', 'b.ts'],
					dependentFiles: ['c.ts'],
					affectedPackages: ['core', 'git'],
					coveringTests: ['x.spec.ts', 'y.spec.ts'],
					totalTests: 400,
				}),
			);

			expect(decision.evidence).toEqual({
				changedFiles: 2,
				dependentFiles: 1,
				affectedPackages: ['core', 'git'],
				coveringTests: 2,
				totalTests: 400,
			});
		});

		it('always gives a reason, in every branch', () => {
			const cases: readonly [IImpactGraph, TChangeBoundary][] = [
				[graph(), 'ordinary'],
				[graph(), 'security'],
				[graph({ incomplete: true }), 'ordinary'],
				[graph({ changedFiles: [] }), 'ordinary'],
				[graph({ dependentFiles: ['b.ts'] }), 'generated-output'],
				[
					graph({
						dependentFiles: ['b.ts'],
						affectedPackages: ['a', 'b'],
					}),
					'ordinary',
				],
			];

			for (const [impact, boundary] of cases) {
				const decision = decideValidationScope(impact, boundary);
				expect(decision.reason.length).toBeGreaterThan(20);
				expect(['targeted', 'affected', 'full']).toContain(
					decision.scope,
				);
			}
		});

		it('names a forcing boundary only when one forced it', () => {
			expect(decideValidationScope(graph()).forcedBy).toBeUndefined();
			expect(decideValidationScope(graph(), 'release').forcedBy).toBe(
				'release',
			);
		});
	});

	describe('reading a real impact analysis', () => {
		const analysis = (
			partial: Partial<IImpactAnalysisLike> = {},
		): IImpactAnalysisLike => ({
			dependents: ['packages/core/src/lib/b.ts'],
			affectedPackages: ['@delendai/core'],
			recommendedTests: ['packages/core/tests/src/lib/a.spec.ts'],
			truncated: false,
			...partial,
		});

		it('maps the analyzer output onto the graph this decision reads', () => {
			expect(
				fromImpactAnalysis(
					analysis(),
					['packages/core/src/lib/a.ts'],
					400,
				),
			).toEqual({
				changedFiles: ['packages/core/src/lib/a.ts'],
				dependentFiles: ['packages/core/src/lib/b.ts'],
				affectedPackages: ['@delendai/core'],
				coveringTests: ['packages/core/tests/src/lib/a.spec.ts'],
				totalTests: 400,
				incomplete: false,
			});
		});

		it('treats a truncated analysis as an unresolved graph', () => {
			// This is the whole reason the adapter exists. `truncated`
			// means the analyzer stopped enumerating dependents, so the
			// output ARRIVES looking like a small graph — read naively it
			// would narrow the scope on exactly the changes whose blast
			// radius was too large to list.
			expect(
				fromImpactAnalysis(
					analysis({ truncated: true, dependents: [] }),
					['packages/core/src/lib/a.ts'],
					400,
				).incomplete,
			).toBe(true);
		});

		it('sends a truncated analysis to the full suite, not to targeted', () => {
			const narrowLooking = analysis({
				truncated: true,
				dependents: [],
				affectedPackages: ['@delendai/core'],
			});

			expect(
				decideValidationScope(
					fromImpactAnalysis(
						narrowLooking,
						['packages/core/src/lib/a.ts'],
						400,
					),
				).scope,
			).toBe('full');
		});

		it('does not invent the two numbers the analysis does not carry', () => {
			// changedFiles is what the caller asked about and totalTests is
			// a property of the repository; deriving either from the
			// analyzer's output would be guessing.
			const graphFromAnalysis = fromImpactAnalysis(
				analysis(),
				['x.ts'],
				7,
			);

			expect(graphFromAnalysis.changedFiles).toEqual(['x.ts']);
			expect(graphFromAnalysis.totalTests).toBe(7);
		});

		it('copies the arrays rather than aliasing the analyzer output', () => {
			const source = analysis();
			const built = fromImpactAnalysis(source, ['x.ts'], 7);

			expect(built.dependentFiles).not.toBe(source.dependents);
			expect(built.coveringTests).not.toBe(source.recommendedTests);
		});
	});
});
