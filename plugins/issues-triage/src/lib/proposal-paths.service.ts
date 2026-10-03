/**
 * proposal-paths.service.ts — where a triage run writes its proposal.
 *
 * The proposal belongs in the checkout the call is bound to, so the
 * directory is read per call. The id counter is the repository's, so it
 * does not move: two worktrees must never hand out the same id.
 */
import { join } from 'node:path';

import {
	callerCheckout,
	type IWorkspacePathProvider,
} from '@delendai/core/public';

export const triageProposalPaths = (
	workspace: IWorkspacePathProvider,
	docsDir: string,
	cacheDir: string,
): { readonly proposalsDirAbs: string; readonly counterPathAbs: string } => {
	const proposalsDirAbs = workspace.resolve(join(docsDir, 'proposals'));
	return {
		get proposalsDirAbs() {
			return callerCheckout.pathForCall(proposalsDirAbs, workspace.root);
		},
		counterPathAbs: workspace.resolve(
			join(cacheDir, 'proposal-id-counters.json'),
		),
	};
};
