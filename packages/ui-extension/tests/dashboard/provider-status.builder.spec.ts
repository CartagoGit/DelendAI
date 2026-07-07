import { describe, expect, it } from 'vitest';
import type {
	IGetQuotaPayload,
	IHealthcheckProvidersPayload,
} from '../../src/contracts/interfaces/provider-status.interface';
import { ORCHESTRATOR_RUNNER_OPT_IN_SNIPPET } from '../../src/contracts/constants/opt-in-snippets.constant';
import { buildProviderStatusModel } from '../../src/dashboard/builders/provider-status.builder';

const healthyRoster: IHealthcheckProvidersPayload = {
	checkedAt: '2026-07-07T10:00:00.000Z',
	providers: [
		{
			id: 'claude-code',
			cli: { installed: true, path: '/usr/bin/claude', version: '2.1.0' },
			auth: { authenticated: true, tier: 'max' },
			model: { requested: 'claude-sonnet-4-5', available: true },
			overall: 'available',
		},
		{
			id: 'codex',
			cli: { installed: true, path: '/usr/bin/codex', version: '0.9.0' },
			auth: { authenticated: true, tier: null },
			model: { requested: 'gpt-5-codex', available: true },
			overall: 'available',
		},
	],
	summary: { total: 2, available: 2, unavailable: 0 },
};

const quotaSnapshot: IGetQuotaPayload = {
	present: true,
	updatedAt: '2026-07-07T09:55:00.000Z',
	providers: {
		'claude-code': [
			{
				window: 'weekly',
				limit: 100,
				used: 40,
				resetAt: '2026-07-13T00:00:00.000Z',
			},
		],
	},
};

describe('buildProviderStatusModel', () => {
	it('maps a healthy roster + quota snapshot to a ready model', () => {
		const model = buildProviderStatusModel(healthyRoster, quotaSnapshot);
		if (model.kind !== 'ready') throw new Error('expected ready model');
		expect(model.summary).toEqual({
			total: 2,
			available: 2,
			unavailable: 0,
		});
		expect(model.emptyRoster).toBe(false);
		expect(model.rows).toHaveLength(2);

		const claude = model.rows[0];
		expect(claude?.id).toBe('claude-code');
		expect(claude?.state).toBe('available');
		expect(claude?.reachable).toBe(true);
		expect(claude?.modelId).toBe('claude-sonnet-4-5');
		expect(claude?.cliVersion).toBe('2.1.0');
		expect(claude?.authTier).toBe('max');
		expect(claude?.installHint).toBeNull();
		expect(claude?.quota).toEqual([
			{
				window: 'weekly',
				limit: 100,
				used: 40,
				resetAt: '2026-07-13T00:00:00.000Z',
				usedPct: 40,
			},
		]);

		// Provider without a quota entry gets an empty meter list, not a throw.
		expect(model.rows[1]?.quota).toEqual([]);
		expect(model.quota).toEqual({
			present: true,
			updatedAt: '2026-07-07T09:55:00.000Z',
			note: null,
		});
	});

	it('marks a quota-exceeded provider unreachable and meters past 100%', () => {
		const payload: IHealthcheckProvidersPayload = {
			checkedAt: '2026-07-07T10:00:00.000Z',
			providers: [
				{
					id: 'codex',
					cli: {
						installed: true,
						path: '/usr/bin/codex',
						version: '0.9.0',
					},
					auth: { authenticated: true, tier: null },
					model: { requested: 'gpt-5-codex', available: true },
					overall: 'quota-exceeded',
				},
				{
					id: 'aider',
					cli: { installed: false, path: null, version: null },
					auth: { authenticated: null, tier: null },
					model: { requested: 'deepseek-v3', available: null },
					overall: 'not-installed',
					installHint: {
						tool: 'curl',
						args: ['-fsSL', 'https://aider.chat/install.sh'],
						pipeTo: 'sh',
						dangerous: true,
						caveat: 'Pipes a remote script into your shell.',
					},
				},
			],
			summary: { total: 2, available: 0, unavailable: 2 },
		};
		const quota: IGetQuotaPayload = {
			present: true,
			updatedAt: '2026-07-07T09:55:00.000Z',
			providers: {
				codex: [
					{
						window: 'hourly',
						limit: 50,
						used: 60,
						resetAt: '2026-07-07T11:00:00.000Z',
					},
					{ window: 'monthly', limit: null, used: 60, resetAt: null },
				],
			},
		};

		const model = buildProviderStatusModel(payload, quota);
		if (model.kind !== 'ready') throw new Error('expected ready model');

		const codex = model.rows[0];
		expect(codex?.state).toBe('quota-exceeded');
		expect(codex?.reachable).toBe(false);
		expect(codex?.quota[0]?.usedPct).toBe(120);
		// Unknown limit → no meter percentage (never invented).
		expect(codex?.quota[1]?.usedPct).toBeNull();

		const aider = model.rows[1];
		expect(aider?.state).toBe('not-installed');
		expect(aider?.cliInstalled).toBe(false);
		expect(aider?.installHint).toEqual({
			command: 'curl -fsSL https://aider.chat/install.sh | sh',
			dangerous: true,
			caveat: 'Pipes a remote script into your shell.',
		});
	});

	it('flags an empty roster explicitly (plugin loaded, nothing configured)', () => {
		const model = buildProviderStatusModel(
			{
				checkedAt: '2026-07-07T10:00:00.000Z',
				providers: [],
				summary: { total: 0, available: 0, unavailable: 0 },
			},
			{
				present: false,
				updatedAt: null,
				providers: {},
				note: 'No quota snapshot yet.',
			},
		);
		if (model.kind !== 'ready') throw new Error('expected ready model');
		expect(model.emptyRoster).toBe(true);
		expect(model.rows).toEqual([]);
		expect(model.quota.present).toBe(false);
		expect(model.quota.note).toBe('No quota snapshot yet.');
	});

	it('returns the opt-in model when orchestrator-runner is absent — never throws', () => {
		expect(() => buildProviderStatusModel(undefined)).not.toThrow();
		expect(() => buildProviderStatusModel(null, null)).not.toThrow();

		const model = buildProviderStatusModel(undefined);
		expect(model.kind).toBe('plugin-absent');
		if (model.kind !== 'plugin-absent')
			throw new Error('expected plugin-absent model');
		expect(model.plugin).toBe('orchestrator-runner');
		expect(model.hint).toContain('opt-in');
		expect(model.configSnippet).toBe(ORCHESTRATOR_RUNNER_OPT_IN_SNIPPET);
		expect(model.configSnippet).toContain(
			'--plugins=usage-tracking,orchestrator-runner',
		);
	});

	it('degrades to quota-less rows when only the quota payload is missing', () => {
		const model = buildProviderStatusModel(healthyRoster, undefined);
		if (model.kind !== 'ready') throw new Error('expected ready model');
		expect(model.quota).toEqual({
			present: false,
			updatedAt: null,
			note: null,
		});
		expect(model.rows.every((row) => row.quota.length === 0)).toBe(true);
	});
});
