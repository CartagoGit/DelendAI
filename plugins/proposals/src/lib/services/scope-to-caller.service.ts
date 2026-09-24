/**
 * scope-to-caller.service.ts — a proposals tool acts in the caller's tree.
 *
 * Every proposals tool is handed absolute paths resolved once, at
 * registration, against the server's root. When a call is bound to
 * another working tree (`writeRoot: 'caller-checkout'`), the content a
 * tool reads and writes moves with it: the proposals directory, the
 * index derived from it, the peer-review journal kept beside them, and
 * the root the SQLite projection is built under. What describes the
 * repository as a whole — the id counter, the agent lock and registry,
 * the logs — does not move, or two worktrees would hand out the same id.
 *
 * `create_proposal` and `proposal_transition` made the same split by
 * hand; this is that split, once, for the tools that did not.
 */
import { callerCheckout } from '@delendai/core/public';

const TREE_PATHS = [
	'proposalsDirAbs',
	'indexPathAbs',
	'peerReviewLogPathAbs',
] as const;

/** `options` for the checkout the current call is bound to. */
export const scopeToCaller = <T extends { readonly workspaceRoot: string }>(
	options: T,
): T =>
	callerCheckout.scopeToCall(
		options,
		TREE_PATHS.filter((key) => key in options) as Extract<
			keyof T,
			string
		>[],
	);
