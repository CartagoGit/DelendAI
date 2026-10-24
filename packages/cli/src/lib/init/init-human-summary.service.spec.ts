/**
 * x00102 S2 — the "What's next" block of the init recap must give
 * runnable, correct steps: link the adoption PROPOSAL (never the
 * `.gitkeep` folder seed also written under `ready/`), phrase the
 * quality-gate hint conditionally (consumers may not have a `validate`
 * script), and suggest a runnable `delendai` invocation (not `bun delendai`).
 */
import { describe, expect, it } from 'vitest';

import { InitAnswers } from './init-answers.schema';
import { renderInitHumanSummary } from './init-human-summary.service';

const writtenFixture = [
	{ path: '/proj/delendai.config.json', kind: 'written' as const },
	{
		path: '/proj/docs/delendai/proposals/ready/.gitkeep',
		kind: 'written' as const,
	},
	{
		path: '/proj/docs/delendai/proposals/ready/f00001-adopt-delendai-proj.md',
		kind: 'written' as const,
	},
];

const render = (migrateFromLegacy: boolean): string =>
	renderInitHumanSummary({
		answers: InitAnswers.parse({ migrateFromLegacy }),
		written: writtenFixture,
		dryRun: false,
		enabled: false,
	});

describe("init human summary — What's next (x00102 S2)", () => {
	it('links the adoption proposal, never the .gitkeep folder seed', () => {
		const out = render(false);
		expect(out).toContain('f00001-adopt-delendai-proj');
		expect(out).not.toContain('open .gitkeep');
	});

	it('phrases the quality-gate hint conditionally', () => {
		const out = render(false);
		expect(out).toContain('run your quality gate if you have one');
	});

	it('suggests a runnable delendai scaffold command for legacy migration', () => {
		const out = render(true);
		expect(out).toContain('delendai scaffold');
		expect(out).not.toContain('bun delendai scaffold');
	});
});

describe('init human summary — the development model and its hooks', () => {
	const renderWith = (
		extra: Partial<Parameters<typeof renderInitHumanSummary>[0]>,
	): string =>
		renderInitHumanSummary({
			answers: InitAnswers.parse({}),
			written: writtenFixture,
			dryRun: false,
			enabled: false,
			...extra,
		});

	it('states the adopted profile, its checks and why', () => {
		const out = renderWith({
			development: {
				profile: 'shared-checkout-pr',
				integration: 'develop',
				requiredChecks: ['validate'],
				reasons: ['chose the pull-request model'],
			},
		});
		expect(out).toContain('shared-checkout-pr (integrates on develop)');
		expect(out).toContain('validate');
		expect(out).toContain('chose the pull-request model');
	});

	it('says the hooks are installed and asks for nothing more', () => {
		const out = renderWith({
			guardHooks: { state: 'installed', directory: '/proj/.git/hooks' },
		});
		expect(out).toContain('installed in /proj/.git/hooks');
		expect(out).not.toContain('delendai guard install');
	});

	it('puts the install command in the next steps when the hooks are missing', () => {
		const out = renderWith({
			guardHooks: { state: 'skipped', reason: 'not a git repository' },
		});
		expect(out).toContain('not installed: not a git repository');
		expect(out).toContain('delendai guard install');
	});
});
