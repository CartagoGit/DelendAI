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
	/** The publication ref, for a template's `{ref}`. */
	readonly ref?: string | undefined;
}): string => {
	const path = relative(input.workspaceRoot, input.absPath);
	const base = path.slice(path.lastIndexOf('/') + 1);
	const id = PROPOSAL_ID.exec(base)?.[1] ?? base.replace(/\.md$/u, '');
	if (input.template !== undefined) {
		return input.template
			.replaceAll('{id}', id)
			.replaceAll('{path}', path)
			.replaceAll('{ref}', input.ref ?? '');
	}
	const leftUntracked = `${path} is not delivered yet: do not leave it untracked, where no other agent can see it and its id can be handed out again.`;
	if (input.policy === undefined) {
		return `${leftUntracked} Land it the way this project integrates work.`;
	}
	const steps = declareWorkflow(input.policy).steps;
	// A project with work refs that lands without a pull request has no
	// ref for a fresh file to be published on: it reaches the integration
	// branch as a unit of work. The generic sentences ("finish the unit")
	// name a unit that does not exist yet for a file just written, so the
	// two commands that create it are spelled out, with this proposal's
	// own id, path and the create unit every proposal is authored in.
	if (
		input.policy.branches.workRefTemplate.length > 0 &&
		!input.policy.integration.requiresPullRequest
	) {
		const integration = input.policy.branches.integration;
		return [
			leftUntracked,
			`Put it on a unit of work from the checkout that holds it: \`delendai work checkpoint --proposal=${id} --slice=all --kind=create --paths=${path} --message="docs(proposals): add ${id}"\`. Then land the unit on ${integration}: \`delendai work publish --proposal=${id} --slice=all --kind=create\`.`,
			...steps
				.filter((step) => step.derivedFrom === 'integration.strategy')
				.map((step) => step.instruction),
		].join(' ');
	}
	const landing = steps
		.filter((step) => LANDING_AXES.has(step.derivedFrom))
		.map((step) => step.instruction);
	return [leftUntracked, ...landing].join(' ');
};
