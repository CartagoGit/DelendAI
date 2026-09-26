/**
 * scope-to-caller.service.ts — a proposals tool acts in the caller's tree.
 *
 * Every proposals tool is handed absolute paths resolved once, at
 * registration, against the server's root. When a call is bound to
 * another working tree (`writeRoot: 'caller-checkout'`), the content a
 * tool reads and writes moves with it: the proposals directory, the
 * index derived from it, and the root the SQLite projection is built
 * under. What describes the repository as a whole — the id counter, the
 * agent lock and registry, the logs, the peer-review journal — does not
 * move, or two worktrees would hand out the same id.
 *
 * `create_proposal` and `proposal_transition` made the same split by
 * hand; this is that split, once, for the tools that did not.
 */
import { callerCheckout } from '@delendai/core/public';

// The peer-review journal is NOT here. It is a log of verdicts, and like
// the other logs it belongs to the repository: scoped to a reviewer's
// worktree, an approval landed in a `.cache` that is deleted with the
// worktree, and the agent closing the proposal read a different journal
// (or an older round in the shared one) and was refused.
const TREE_PATHS = ['proposalsDirAbs', 'indexPathAbs'] as const;

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
