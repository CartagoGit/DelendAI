/**
 * proposal-publish-next-action.ts — what an agent must do after writing a
 * proposal, returned by `create_proposal` itself.
 *
 * Writing the file was never the end of it. Observed on 2026-09-15: an
 * agent followed the tool, stopped where the tool stopped, and left eight
 * proposals untracked in a shared checkout, where nothing indexed them
 * and no other agent could see them or their ids.
 *
 * WHAT "PUBLISH" MEANS IS THE PROJECT'S DECISION, not this plugin's. A
 * project that integrates by pull request, one that merges through the
 * integration engine, and one that commits straight to its integration
 * branch each land a proposal differently. So the step comes, in order,
 * from:
 *
 *   1. the project's own `publishCommand`, when it declares one;
 *   2. the resolved development policy, through the same `declareWorkflow`
 *      sentences core prints at startup, so the tool and the startup
 *      declaration can never disagree;
 *   3. with no policy at all, the one thing true of every workflow: the
 *      file must not stay untracked.
 *
 * The tool is the one thing every host reads, whatever instruction files
 * it does or does not load, so the next step travels in its answer.
 */
import { relative } from 'node:path';

import {
	declareWorkflow,
	type IResolvedDevelopmentPolicy,
} from '@delendai/core/public';

const PROPOSAL_ID = /^([a-z]\d+)-/;

/** The declaration steps that say how work is persisted and how it lands. */
const LANDING_AXES: ReadonlySet<string> = new Set([
	'persistence.strategy',
	'integration.strategy',
]);

export const proposalPublishNextAction = (input: {
	readonly template: string | undefined;
	readonly policy?: IResolvedDevelopmentPolicy | undefined;
	readonly workspaceRoot: string;
	readonly absPath: string;
}): string => {
	const path = relative(input.workspaceRoot, input.absPath);
	const base = path.slice(path.lastIndexOf('/') + 1);
	const id = PROPOSAL_ID.exec(base)?.[1] ?? base.replace(/\.md$/u, '');
	if (input.template !== undefined) {
		return input.template.replaceAll('{id}', id).replaceAll('{path}', path);
	}
	const leftUntracked = `${path} is not delivered yet: do not leave it untracked, where no other agent can see it and its id can be handed out again.`;
	if (input.policy === undefined) {
		return `${leftUntracked} Land it the way this project integrates work.`;
	}
	const landing = declareWorkflow(input.policy)
		.steps.filter((step) => LANDING_AXES.has(step.derivedFrom))
		.map((step) => step.instruction);
	return [leftUntracked, ...landing].join(' ');
};
