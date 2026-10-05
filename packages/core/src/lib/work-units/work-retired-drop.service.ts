/**
 * work-retired-drop.service.ts — retired work somebody read and found to
 * be nothing is dropped, not kept for ever.
 *
 * Retiring keeps every tip, because the one retiring cannot know what is
 * worth keeping. Somebody then reads it: it landed under another name,
 * it was replaced, it was never work. Without a way to say so the list of
 * retired work only grows, and the tips worth a second look are lost
 * among those nobody will look at again.
 */
import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type {
	IWorkUnitContext,
	IWorkUnitResult,
} from '../contracts/interfaces/work-unit-context.interface';
import { scalarArg } from './command-args.helper';
import {
	integrationRemote,
	mainWorktreeOf,
	openWork,
	readGit,
	refused,
} from './work-unit-shared.service';

/**
 * `work retired --drop=<unit> --reason=<why>` — remove retired work from
 * the forge. `<unit>` is a name `work retired` lists, or a pattern ending
 * in `*` for every one under it.
 */
export const retiredDropped = async (
	args: readonly string[],
	ctx: IWorkUnitContext,
): Promise<IWorkUnitResult> => {
	const opened = await openWork(ctx);
	if (!('engine' in opened)) return opened;
	const { policy } = opened;
	const root = mainWorktreeOf(opened.root);
	const remote = ctx.globals.remote ?? integrationRemote(root, policy);
	const prefix = `refs/${policy.branches.namespacePrefix}/retired/`;
	const unit = scalarArg(args, 'drop') ?? '';
	const reason = scalarArg(args, 'reason') ?? '';
	if (unit.length === 0 || reason.trim().length === 0) {
		return refused(
			'Dropping retired work takes its name and the reason nobody needs it.',
			'delendai work retired --drop=<unit> --reason=<what you read in it, and why it is not work>',
		);
	}
	const listed = readGit(root, ['ls-remote', remote, `${prefix}${unit}`]);
	if (listed === undefined) {
		return refused(
			`Could not ask \`${remote}\` for the retired work.`,
			'Check the remote (git remote -v) and the network, then ask again.',
		);
	}
	const found = listed
		.split('\n')
		.filter((line) => line.length > 0)
		.map((line) => {
			const [commit = '', ref = ''] = line.split('\t');
			return { unit: ref.slice(prefix.length), ref, commit };
		})
		.filter((each) => each.ref.startsWith(prefix));
	if (found.length === 0) {
		return refused(
			`No retired work is named \`${unit}\` on \`${remote}\`.`,
			'`delendai work retired` lists what there is.',
		);
	}
	const pushed = readGit(root, [
		'push',
		'--quiet',
		remote,
		...found.map((each) => `:${each.ref}`),
	]);
	if (pushed === undefined) {
		return refused(
			`\`${remote}\` did not remove ${found.map((each) => each.unit).join(', ')}.`,
			'Nothing was dropped. Check that the remote accepts the push, then drop it again.',
		);
	}
	return {
		code: EXIT_CODE.OK,
		data: { remote, reason, dropped: found },
	};
};
