/**
 * Drive proposal_transition with the CURRENT source, because the running
 * MCP host still has the pre-fix code in memory.
 */
import { resolve } from 'node:path';
import { runProposalTransition } from './plugins/proposals/src/lib/tools/proposal-transition.tool';
import { defaultPathLayout } from './plugins/proposals/src/lib/contracts/constants/default-path-layout.constant';

const root = process.cwd();
const layout = defaultPathLayout('.cache/mcp-vertex', 'docs/mcp-vertex');
const abs = (p: string) => resolve(root, p);

const options = {
	namespacePrefix: 'mcp-vertex',
	workspaceRoot: root,
	proposalsDirAbs: abs(layout.proposalsDir),
	indexPathAbs: abs(layout.proposalIndexFile),
	lockPathAbs: abs(layout.lockFile),
	peerReviewLogPathAbs: abs(layout.peerReviewLogFile),
	requirePeerReview: true,
	requireValidateEvidence: true,
} as never;

const [, , id, to, ...reasonParts] = process.argv;
const res = await runProposalTransition(
	{ id, to, reason: reasonParts.join(' ') || 'closing' } as never,
	options,
);
console.log(res.content?.[0]?.text ?? JSON.stringify(res));
