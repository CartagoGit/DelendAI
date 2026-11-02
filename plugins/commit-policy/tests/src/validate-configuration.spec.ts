/**
 * validate-configuration.spec.ts — the push-target checks the host runs
 * before commit-policy starts.
 */

import { describe, expect, it } from 'vitest';

import { validateCommitPolicyConfiguration } from '@delendai/commit-policy';

const withOptions = (options?: Readonly<Record<string, unknown>>) =>
	validateCommitPolicyConfiguration({
		pluginName: 'commit-policy',
		pluginOptions: new Map(
			options === undefined ? [] : [['commit-policy', options]],
		),
		enabledPlugins: ['commit-policy'],
	});

describe('validateCommitPolicyConfiguration', () => {
	it('has nothing to say when commit-policy is not configured', () => {
		expect(withOptions()).toEqual([]);
	});

	it('ignores a push block that is not an object', () => {
		expect(withOptions({ push: null })).toEqual([]);
		expect(withOptions({ push: 'develop' })).toEqual([]);
	});

	it('accepts a plain branch name', () => {
		expect(withOptions({ push: { branch: 'wip/agent-work' } })).toEqual([]);
	});

	it('flags a refspec in push.branch and suggests the branch it names', () => {
		const [issue] = withOptions({ push: { branch: 'HEAD:wip/example' } });
		expect(issue).toMatchObject({
			code: 'INVALID_PUSH_BRANCH_TARGET',
			keys: ['plugins.commit-policy.options.push.branch'],
			values: { branch: 'HEAD:wip/example' },
			suggestedConfig: {
				plugins: {
					'commit-policy': {
						options: { push: { branch: 'wip/example' } },
					},
				},
			},
		});
	});

	it('does not invent a suggestion for a refspec with no destination', () => {
		expect(withOptions({ push: { branch: 'HEAD:' } })).toEqual([]);
	});

	it('names both lists when the push target is protected by branch and prefix', () => {
		const [issue] = withOptions({
			push: {
				enabled: true,
				branch: 'release/1.0',
				protectedBranches: ['release/1.0'],
				protectedPrefixes: ['release/', 42],
			},
		});
		expect(issue).toMatchObject({
			code: 'PUSH_TARGET_IS_PROTECTED',
			keys: [
				'plugins.commit-policy.options.push.enabled',
				'plugins.commit-policy.options.push.branch',
				'plugins.commit-policy.options.push.protectedBranches',
				'plugins.commit-policy.options.push.protectedPrefixes',
			],
			values: { protectedPrefixes: ['release/'] },
		});
	});

	it('does not flag a protected target while automatic push is off', () => {
		expect(
			withOptions({
				push: {
					enabled: false,
					branch: 'develop',
					protectedBranches: 'develop',
					protectedPrefixes: 'dev',
				},
			}),
		).toEqual([]);
	});
});
