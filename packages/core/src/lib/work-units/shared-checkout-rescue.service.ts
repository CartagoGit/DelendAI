/**
 * shared-checkout-rescue.service.ts — what was written into the shared
 * checkout by mistake is kept under a ref, and the checkout restored.
 *
 * Nothing commits in the shared checkout: it only follows the integration
 * branch, and every unit starts from its tree. A command that lands there
 * by mistake leaves changes nobody will commit and that the next
 * fast-forward refuses to carry. Discarding them is the fix, and
 * discarding is the one thing nobody should have to do blind: the tree
 * as it stood is first committed and kept under `refs/<namespace>/rescued`
 * (and on the forge, when it can be reached), so the restore loses
 * nothing and says where it put it.
 */
import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type {
	IWorkUnitContext,
	IWorkUnitResult,
} from '../contracts/interfaces/work-unit-context.interface';
import { namespacedRef } from './namespaced-ref.helper';
import type { ISharedCheckoutRescue } from './shared-checkout-rescue.interface';
import {
	integrationRemote,
	mainWorktreeOf,
	openWork,
	readGit,
} from './work-unit-shared.service';

/** How much of the commit names the ref the rescued tree is kept under. */
const SHORT_COMMIT_LENGTH = 12;

/**
 * Keep the shared checkout's uncommitted state under a ref, then restore
 * it to its branch tip. Refuses anywhere but the shared checkout on the
 * integration branch, and restores only once the ref exists.
 */
export const rescueSharedCheckout = (input: {
	readonly root: string;
	readonly integration: string;
	readonly namespace: string;
	readonly remote: string;
}): ISharedCheckoutRescue => {
	const { root, integration, namespace, remote } = input;
	const branch = readGit(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
	if (branch !== integration) {
		return {
			outcome: 'refused',
			paths: [],
			reason: `the shared checkout is on \`${branch ?? '(nothing)'}\`, not on \`${integration}\`: return with \`git switch ${integration}\` (your edits stay) and run this again`,
		};
	}
	const paths = (readGit(root, ['status', '--porcelain']) ?? '')
		.split('\n')
		.filter((line) => line.length > 0)
		// `XY path`; the reader trims the output, so the first line may
		// have lost the blank of its status. The path follows the first
		// run of blanks after the status either way.
		.map((line) => {
			const entry = line.trimStart();
			return entry.slice(entry.indexOf(' ') + 1).trim();
		});
	if (paths.length === 0) return { outcome: 'clean', paths: [] };
	// The whole tree as it stands — staged, unstaged and untracked, never
	// what git ignores — as one commit on top of the branch tip.
	if (readGit(root, ['add', '-A']) === undefined) {
		return {
			outcome: 'refused',
			paths,
			reason: 'the changes could not be staged to be kept; nothing was restored',
		};
	}
	const tree = readGit(root, ['write-tree']);
	const tip = readGit(root, ['rev-parse', '-q', '--verify', 'HEAD']);
	const commit =
		tree === undefined || tip === undefined
			? undefined
			: readGit(root, [
					'commit-tree',
					tree,
					'-p',
					tip,
					'-m',
					`rescued from the shared checkout: ${String(paths.length)} path(s) written on ${integration} by mistake`,
				]);
	if (commit === undefined || commit.length === 0) {
		return {
			outcome: 'refused',
			paths,
			reason: 'the changes could not be committed to be kept; nothing was restored',
		};
	}
	const keptAt = namespacedRef(
		namespace,
		'rescued',
		`shared-checkout-${commit.slice(0, SHORT_COMMIT_LENGTH)}`,
	);
	if (readGit(root, ['update-ref', keptAt, commit]) === undefined) {
		return {
			outcome: 'refused',
			paths,
			reason: `the ref ${keptAt} could not be written; nothing was restored`,
		};
	}
	const onForge =
		readGit(root, [
			'push',
			'--quiet',
			'--',
			remote,
			`${commit}:${keptAt}`,
		]) !== undefined;
	// Only now: the tree is in a commit a ref holds.
	readGit(root, ['reset', '--hard', '--quiet', 'HEAD']);
	return {
		outcome: 'rescued',
		paths,
		keptAt,
		onForge,
		restore: `git checkout ${keptAt} -- <path>   (or: git diff HEAD ${keptAt})`,
	};
};

/** `work rescue` — keep what landed in the shared checkout, and restore it. */
export const rescued = async (
	_args: readonly string[],
	ctx: IWorkUnitContext,
): Promise<IWorkUnitResult> => {
	const opened = await openWork(ctx);
	if (!('engine' in opened)) return opened;
	const root = mainWorktreeOf(opened.root);
	const result = rescueSharedCheckout({
		root,
		integration: opened.policy.branches.integration,
		namespace: opened.policy.branches.namespacePrefix,
		remote: ctx.globals.remote ?? integrationRemote(root, opened.policy),
	});
	return {
		code:
			result.outcome === 'refused' ? EXIT_CODE.VALIDATION : EXIT_CODE.OK,
		data: result,
	};
};
