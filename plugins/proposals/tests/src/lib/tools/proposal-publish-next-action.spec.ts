/**
 * proposal-publish-next-action.spec.ts — a created proposal comes back
 * with the step that publishes it, never with nothing.
 */
import { describe, expect, it } from 'vitest';

import { proposalPublishNextAction } from '@delendai/proposals/lib/tools/proposal-publish-next-action';

const ABS =
	'/ws/docs/delendai/proposals/ready/feats/f00547-publish-new-proposals.md';

describe('proposalPublishNextAction', () => {
	it('fills the project command with the proposal id and repository path', () => {
		expect(
			proposalPublishNextAction({
				template:
					'bun run forge:publish -- --ref=delendai/pr/proposal-{id} --message="docs(proposals): add {id}" --path={path} --open-pr',
				workspaceRoot: '/ws',
				absPath: ABS,
			}),
		).toBe(
			'bun run forge:publish -- --ref=delendai/pr/proposal-f00547 --message="docs(proposals): add f00547" --path=docs/delendai/proposals/ready/feats/f00547-publish-new-proposals.md --open-pr',
		);
	});

	it('still says to publish by pull request when the project declares no command', () => {
		const action = proposalPublishNextAction({
			template: undefined,
			workspaceRoot: '/ws',
			absPath: ABS,
		});

		expect(action).toContain(
			'docs/delendai/proposals/ready/feats/f00547-publish-new-proposals.md',
		);
		expect(action).toContain('pull request');
	});
});
