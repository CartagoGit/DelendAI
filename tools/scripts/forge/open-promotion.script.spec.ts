/**
 * open-promotion.script.spec.ts — a promotion is opened when it is ready
 * and only then; a project with no cadence or one branch is told nothing.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	type IForge,
	openPromotion,
	promotionPlanOf,
} from './open-promotion.script';

const projects: string[] = [];

afterEach(() => {
	for (const dir of projects.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

const configOf = (
	promotion: Record<string, unknown> | undefined,
	branches: Record<string, unknown> = {
		integration: 'trunk',
		release: 'release/2.x',
	},
): string =>
	JSON.stringify({
		docsDir: 'handbook',
		development: {
			branches,
			integration: { requiredChecks: ['validate'] },
		},
		plugins: {
			roadmap: {
				options: {
					file: 'plan/ROADMAP.yaml',
					versionFile: 'version.json',
					...(promotion === undefined ? {} : { promotion }),
				},
			},
		},
	});

const ROADMAP = (state: string): string =>
	JSON.stringify({
		schemaVersion: 1,
		horizons: [
			{
				version: '2.4.0',
				entries: [
					{
						id: 'export',
						title: 'CSV export',
						kind: 'feature',
						state,
						gates: [{ kind: 'proposal-done', target: 'f1' }],
					},
				],
			},
		],
	});

const project = (state: string, proposalFolder = 'done'): string => {
	const root = mkdtempSync(join(tmpdir(), 'open-promotion-'));
	projects.push(root);
	const write = (path: string, content: string): void => {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), content);
	};
	write('plan/ROADMAP.yaml', ROADMAP(state));
	write('version.json', '{"version":"2.3.0"}');
	write(`handbook/proposals/${proposalFolder}/f1-csv-export.md`, '# x\n');
	return root;
};

/** A forge that answers from a table and remembers what it was asked. */
const forgeWith = (answers: {
	readonly checks?: string;
	readonly alerts?: string | { readonly error: string };
	readonly openPullRequest?: string;
	readonly create?: string | { readonly error: string };
}) => {
	const asked: string[][] = [];
	const forge: IForge = (args) => {
		asked.push([...args]);
		const call = args.join(' ');
		if (call.includes('/check-runs')) {
			return {
				ok: true,
				out:
					answers.checks ??
					JSON.stringify([
						{
							name: 'validate',
							conclusion: 'failure',
							completed_at: '2026-10-10T00:00:00Z',
						},
						{
							name: 'validate',
							conclusion: 'success',
							completed_at: '2026-10-11T00:00:00Z',
						},
					]),
			};
		}
		if (call.includes('/code-scanning/alerts')) {
			const alerts = answers.alerts ?? '0';
			return typeof alerts === 'string'
				? { ok: true, out: alerts }
				: { ok: false, error: alerts.error };
		}
		if (call.startsWith('pr list')) {
			return { ok: true, out: answers.openPullRequest ?? '' };
		}
		const create = answers.create ?? 'https://forge.example/pull/7\n';
		return typeof create === 'string'
			? { ok: true, out: create }
			: { ok: false, error: create.error };
	};
	return { forge, asked };
};

const created = (asked: readonly string[][]): readonly string[] | undefined =>
	asked.find((args) => args[0] === 'pr' && args[1] === 'create');

describe('promotionPlanOf', () => {
	it('is the branches, the cadence and the checks the project declares', () => {
		expect(promotionPlanOf(configOf({ schedule: '0 6 * * 1' }))).toEqual({
			integration: 'trunk',
			release: 'release/2.x',
			schedule: '0 6 * * 1',
			requiredChecks: ['validate'],
		});
	});

	it('is nothing without a cadence, a release branch or a configuration', () => {
		expect(promotionPlanOf(configOf(undefined))).toBeUndefined();
		expect(
			promotionPlanOf(configOf({ deferralPolicy: 'report' })),
		).toBeUndefined();
		expect(
			promotionPlanOf(
				configOf({ schedule: 'on-ready' }, { integration: 'main' }),
			),
		).toBeUndefined();
		expect(promotionPlanOf(undefined)).toBeUndefined();
	});
});

describe('openPromotion', () => {
	it('opens the pull request between the project branches when everything is ready', async () => {
		const { forge, asked } = forgeWith({});
		const result = await openPromotion({
			root: project('delivered'),
			configText: configOf({ schedule: 'on-ready' }),
			forge,
			apply: true,
		});
		expect(result.outcome).toBe('opened');
		const call = created(asked) ?? [];
		expect(call.slice(2, 6)).toEqual([
			'--base',
			'release/2.x',
			'--head',
			'trunk',
		]);
		expect(call[7]).toBe('release: promote trunk into release/2.x (2.4.0)');
		expect(call[9]).toContain('validate concluded success');
		expect(call[9]).toContain('Nothing was merged, bumped or tagged');
		// It asks, lists and creates — and nothing else: no merge, no tag.
		expect(asked.map((args) => args.slice(0, 2).join(' '))).toEqual([
			`api repos/{owner}/{repo}/commits/trunk/check-runs?per_page=100`,
			'api --paginate',
			'pr list',
			'pr create',
		]);
	});

	it('only says what it would open without --apply', async () => {
		const { forge, asked } = forgeWith({});
		const result = await openPromotion({
			root: project('delivered'),
			configText: configOf({ schedule: 'on-ready' }),
			forge,
			apply: false,
		});
		expect(result.outcome).toBe('would-open');
		expect(created(asked)).toBeUndefined();
	});

	it('opens nothing and names each condition when it is not ready', async () => {
		const { forge, asked } = forgeWith({
			checks: JSON.stringify([
				{ name: 'validate', conclusion: 'failure', completed_at: 'z' },
			]),
			alerts: '2\n1',
		});
		const result = await openPromotion({
			root: project('in-progress', 'ready'),
			configText: configOf({ schedule: 'on-ready' }),
			forge,
			apply: true,
		});
		expect(result.outcome).toBe('held-back');
		expect(created(asked)).toBeUndefined();
		const said = result.lines.join('\n');
		expect(said).toContain('validate concluded failure');
		expect(said).toContain('3 code scanning alert(s) are open');
		expect(said).toContain('roadmap 2.4.0');
	});

	it('is held back by a check that never reported and by a forge that cannot be asked', async () => {
		const { forge } = forgeWith({
			checks: '[]',
			alerts: { error: 'HTTP 502: Bad Gateway' },
		});
		const result = await openPromotion({
			root: project('delivered'),
			configText: configOf({ schedule: 'on-ready' }),
			forge,
			apply: true,
		});
		expect(result.outcome).toBe('held-back');
		expect(result.lines.join('\n')).toContain('has not reported');
		expect(result.lines.join('\n')).toContain('could not be asked');
	});

	it('is not held back by a project that has no code scanning', async () => {
		const { forge } = forgeWith({
			alerts: { error: 'HTTP 404: no analysis found' },
		});
		const result = await openPromotion({
			root: project('delivered'),
			configText: configOf({ schedule: 'on-ready' }),
			forge,
			apply: false,
		});
		expect(result.outcome).toBe('would-open');
	});

	it('opens no second pull request for the same promotion', async () => {
		const { forge, asked } = forgeWith({ openPullRequest: '41\n' });
		const result = await openPromotion({
			root: project('delivered'),
			configText: configOf({ schedule: 'on-ready' }),
			forge,
			apply: true,
		});
		expect(result.outcome).toBe('already-open');
		expect(result.lines[0]).toContain('#41');
		expect(created(asked)).toBeUndefined();
	});

	it('says so when the pull request could not be opened', async () => {
		const { forge } = forgeWith({ create: { error: 'no permission' } });
		const result = await openPromotion({
			root: project('delivered'),
			configText: configOf({ schedule: 'on-ready' }),
			forge,
			apply: true,
		});
		expect(result.outcome).toBe('could-not-open');
		expect(result.lines[0]).toContain('no permission');
	});

	it('asks the forge nothing and says nothing when no cadence is declared', async () => {
		const { forge, asked } = forgeWith({});
		const result = await openPromotion({
			root: project('delivered'),
			configText: configOf(undefined),
			forge,
			apply: true,
		});
		expect(result).toEqual({ outcome: 'nothing-declared', lines: [] });
		expect(asked).toEqual([]);
	});
});
