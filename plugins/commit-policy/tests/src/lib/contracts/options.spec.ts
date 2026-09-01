import { describe, expect, it } from 'vitest';

import {
	CommitPolicyOptionsSchema,
	parseCommitPolicyOptions,
} from '@mcp-vertex/commit-policy/lib/contracts/options';

describe('commit-policy options contract', () => {
	it('applies conservative defaults when the host provides no options', () => {
		const options = parseCommitPolicyOptions({});

		expect(options.commit).toEqual({
			enabled: false,
			requireConventional: true,
			autoScopeFromProposal: true,
			refuseWhenDisabled: true,
		});
		expect(options.identity).toEqual({ mode: 'global' });
		expect(options.cadence).toEqual({
			triggers: [],
			sliceScoping: true,
			allowForeignChanges: false,
		});
		expect(options.push).toEqual({
			enabled: false,
			onCommit: false,
			force: 'with-lease',
			protectedBranches: [],
			protectedPrefixes: [],
		});
	});

	it.each([
		[
			'explicit',
			{
				mode: 'explicit',
				owner: { name: 'CI', email: 'ci@example.test' },
			},
		],
		['agent', { mode: 'agent' }],
		['repo', { mode: 'repo' }],
		['global', { mode: 'global' }],
		['env', { mode: 'env' }],
		['auto', { mode: 'auto' }],
	] as const)('accepts the %s identity mode', (_name, identity) => {
		expect(CommitPolicyOptionsSchema.safeParse({ identity }).success).toBe(
			true,
		);
	});

	it.each([
		['slice', { kind: 'slice' }],
		['threshold', { kind: 'threshold', files: 3 }],
		['interval', { kind: 'interval', minutes: 5 }],
		['manual', { kind: 'manual' }],
	] as const)('accepts the %s cadence trigger', (_name, trigger) => {
		expect(
			CommitPolicyOptionsSchema.safeParse({
				cadence: { triggers: [trigger] },
			}).success,
		).toBe(true);
	});

	it.each([
		['disabled', { enabled: false }],
		['on commit', { enabled: true, onCommit: true }],
		['commit count', { enabled: true, everyNCommits: 3 }],
		['periodic minutes', { enabled: true, everyNMinutes: 5 }],
		[
			'authorized force',
			{
				enabled: true,
				force: 'allow',
				forceReason: 'maintenance window',
			},
		],
		[
			'no force',
			{
				enabled: true,
				force: 'never',
				remote: 'origin',
				branch: 'develop',
			},
		],
	] as const)('accepts %s push configuration', (_name, push) => {
		expect(CommitPolicyOptionsSchema.safeParse({ push }).success).toBe(
			true,
		);
	});

	it.each([
		['explicit identity without owner', { identity: { mode: 'explicit' } }],
		[
			'empty explicit name',
			{
				identity: {
					mode: 'explicit',
					owner: { name: '', email: 'ci@example.test' },
				},
			},
		],
		['unknown identity mode', { identity: { mode: 'service' } }],
		[
			'zero threshold',
			{ cadence: { triggers: [{ kind: 'threshold', files: 0 }] } },
		],
		[
			'zero interval',
			{ cadence: { triggers: [{ kind: 'interval', minutes: 0 }] } },
		],
		['unknown trigger', { cadence: { triggers: [{ kind: 'watch' }] } }],
		['force allow without reason', { push: { force: 'allow' } }],
		['empty force reason', { push: { force: 'allow', forceReason: '  ' } }],
		['negative commit cadence', { push: { everyNCommits: -1 } }],
		['negative push cadence', { push: { everyNMinutes: -1 } }],
	] as const)('rejects %s', (_name, input) => {
		expect(CommitPolicyOptionsSchema.safeParse(input).success).toBe(false);
	});

	it('accepts the fully automatic shared-checkout configuration', () => {
		const result = CommitPolicyOptionsSchema.safeParse({
			commit: {
				enabled: true,
				requireConventional: true,
				autoScopeFromProposal: true,
			},
			cadence: {
				triggers: [
					{ kind: 'slice', onStatuses: ['done', 'merged'] },
					{ kind: 'interval', minutes: 5 },
					{ kind: 'threshold', files: 10 },
				],
				sliceScoping: true,
				allowForeignChanges: false,
			},
			push: {
				enabled: true,
				onCommit: true,
				everyNCommits: 3,
				everyNMinutes: 15,
				force: 'with-lease',
				protectedBranches: ['main', 'master'],
				protectedPrefixes: ['release/', 'hotfix/'],
				remote: 'origin',
				branch: 'develop',
			},
		});

		expect(result.success).toBe(true);
	});
});
