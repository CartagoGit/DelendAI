/**
 * shared-checkout-shell-rescue.service.ts — what a host does after every
 * shell command: an agent that holds a unit and left loose edits in the
 * shared checkout (a heredoc or `open().write()` on a relative path after
 * its cwd reset there) has them kept and the checkout restored at once.
 *
 * The decision is small on purpose. A clean checkout, an agent that holds
 * no unit (a person editing is not a stray write) or a policy whose units
 * have no worktrees does nothing. The clean path costs one `git status`
 * with optional locks off, the same read the work commands share, and
 * nothing else (x01052).
 */
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type { IShellRescueVerdict } from './shared-checkout-shell-rescue.interface';
import { sharedCheckoutStaysClean } from '../development-policy/shared-checkout-clean';
import { sharedCheckoutLooseEdits } from './shared-checkout-clean.service';
import { rescueSharedCheckout } from './shared-checkout-rescue.service';
import { unitWorktreesOf } from './unit-edit-fence.service';
import { integrationRemote } from './work-unit-shared.service';

/** Judge the shared checkout after a shell command run by `agent` from `cwd`. */
export const rescueAfterShell = (input: {
	readonly cwd: string;
	readonly agent: string;
	readonly policy: IResolvedDevelopmentPolicy;
}): IShellRescueVerdict => {
	const { cwd, agent, policy } = input;
	if (agent.length === 0 || !sharedCheckoutStaysClean(policy))
		return { outcome: 'none' };
	const loose = sharedCheckoutLooseEdits(cwd);
	if (loose.paths.length === 0) return { outcome: 'none' };
	const units = unitWorktreesOf(loose.root, agent, policy);
	if (units.length === 0) return { outcome: 'none' };
	const shown = loose.paths.slice(0, 3).join(', ');
	const more = loose.paths.length > 3 ? ', …' : '';
	const where = `Write in ${units[0] ?? ''} instead, with the same repository-relative path, and \`cd\` there first: a shell's cwd can reset to the shared checkout.`;
	const rescue = rescueSharedCheckout({
		root: loose.root,
		integration: policy.branches.integration,
		namespace: policy.branches.namespacePrefix,
		remote: integrationRemote(loose.root, policy),
	});
	if (rescue.outcome === 'rescued') {
		return {
			outcome: 'rescued',
			message: `that command wrote ${String(rescue.paths.length)} path(s) into the shared checkout (${shown}${more}); they are kept under ${rescue.keptAt ?? 'a ref'} and the checkout is restored. ${where} Recover them with ${rescue.restore ?? 'git diff'}.`,
		};
	}
	return {
		outcome: 'refused',
		message: `that command wrote ${String(loose.paths.length)} path(s) into the shared checkout (${shown}${more}) and they could not be rescued: ${rescue.reason ?? 'unknown'}. ${where} Then run \`delendai work rescue\`.`,
	};
};
