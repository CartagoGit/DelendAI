/**
 * proposal-publish-next-action.spec.ts — a created proposal comes back
 * with the step that lands it, in THIS project's workflow, never with
 * nothing.
 */
import { describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';
import { proposalPublishNextAction } from '@delendai/proposals/lib/tools/proposal-publish-next-action';

const ABS =
	'/ws/docs/delendai/proposals/ready/feats/f00547-publish-new-proposals.md';
const PATH =
	'docs/delendai/proposals/ready/feats/f00547-publish-new-proposals.md';

const policyFor = (profile: string) =>
	resolveDevelopmentPolicy({ development: { profile } });

describe('proposalPublishNextAction', () => {
	it('uses the project command when one is declared, whatever the workflow', () => {
		expect(
			proposalPublishNextAction({
				template:
					'bun run forge:publish -- --ref=delendai/pr/proposal-{id} --path={path} --open-pr',
				policy: policyFor('shared-checkout-merge'),
				workspaceRoot: '/ws',
				absPath: ABS,
			}),
		).toBe(
			`bun run forge:publish -- --ref=delendai/pr/proposal-f00547 --path=${PATH} --open-pr`,
		);
	});

	it('says to open a pull request only where the project integrates by pull request', () => {
		const action = proposalPublishNextAction({
			template: undefined,
			policy: policyFor('shared-checkout-pr'),
			workspaceRoot: '/ws',
			absPath: ABS,
		});

		expect(action).toContain(PATH);
		expect(action).toContain('pull request');
	});

	it('does not tell a project that merges through its integration engine to open a pull request', () => {
		const action = proposalPublishNextAction({
			template: undefined,
			policy: policyFor('shared-checkout-merge'),
			workspaceRoot: '/ws',
			absPath: ABS,
		});

		expect(action).toContain(PATH);
		expect(action).not.toContain('pull request');
		expect(action).toContain('Merge');
	});

	it('names no mechanism without a policy, only that the file must not stay untracked', () => {
		const action = proposalPublishNextAction({
			template: undefined,
			workspaceRoot: '/ws',
			absPath: ABS,
		});

		expect(action).toContain('untracked');
		expect(action).not.toContain('pull request');
	});
});
