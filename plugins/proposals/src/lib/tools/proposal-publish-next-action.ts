/**
 * proposal-publish-next-action.ts — what an agent must do after writing a
 * proposal, returned by `create_proposal` itself.
 *
 * Writing the file was never the end of it. Under a shared checkout the
 * file is untracked on one machine: nothing indexes it into the shared
 * projection, no other checkout can see it or its id, and the next agent
 * to allocate an id may take the same one. Observed on 2026-09-15: eight
 * proposals written by an agent that followed the tool, stopped when the
 * tool stopped, and left them untracked in `develop`'s checkout.
 *
 * The tool is the one thing every host reads, whatever instruction files
 * it does or does not load, so the next step travels in its answer.
 */
import { relative } from 'node:path';

const PROPOSAL_ID = /^([a-z]\d+)-/;

/**
 * The publish step for one proposal: the project's command when it
 * declares one, generic pull-request guidance otherwise.
 */
export const proposalPublishNextAction = (input: {
	readonly template: string | undefined;
	readonly workspaceRoot: string;
	readonly absPath: string;
}): string => {
	const path = relative(input.workspaceRoot, input.absPath);
	const base = path.slice(path.lastIndexOf('/') + 1);
	const id = PROPOSAL_ID.exec(base)?.[1] ?? base.replace(/\.md$/u, '');
	if (input.template === undefined) {
		return `Publish ${path} as its own pull request against the integration branch. Do not leave it untracked in a shared checkout: no other agent can see it, and its id can be allocated again.`;
	}
	return input.template.replaceAll('{id}', id).replaceAll('{path}', path);
};
