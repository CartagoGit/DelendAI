/**
 * development-policy.service.ts — the project's resolved development
 * policy, read from its own configuration, with no MCP server.
 *
 * WHY it is a service and not a line inside each command: the guard (git
 * hooks) and `delendai work` both have to obey the SAME policy, and a
 * second reader is a second chance to disagree about what the project
 * declared. A workflow only holds if every entry point reads one answer.
 *
 * WHY a parse error throws instead of resolving to "no policy": a project
 * that declared a policy and then typed a comma wrong must not silently
 * become a project with no rules. Absence is a valid answer; illegibility
 * is not.
 */
import {
	defaultBranchOf,
	parseJsonc,
	resolveDevelopmentPolicy,
	sharedCheckout,
} from '@delendai/core/public';
import type { IResolvedDevelopmentPolicy } from '@delendai/core/public';

import { readConfigText } from './config-file.service';
import { isRecord } from './helpers/cli-command.helper';

export const readWorkspacePolicy = async (
	root: string,
): Promise<IResolvedDevelopmentPolicy | undefined> => {
	const text = await readConfigText(root);
	if (text === undefined) return undefined;
	const parsed = parseJsonc(text);
	if (parsed.errors.length > 0) {
		throw new Error(
			`delendai.config.json does not parse (${String(parsed.errors.length)} error(s))`,
		);
	}
	const config = parsed.value;
	if (!isRecord(config) || !isRecord(config.development)) return undefined;
	const policy = resolveDevelopmentPolicy({
		development: config.development,
	});
	// `develop` is this repository's habit, and a habit is not a default.
	//
	// `resolveDevelopmentPolicy` is pure — it cannot look at a checkout —
	// so when a project declares no `branches.integration` it answers
	// `develop`. Every consumer of this policy then believed it: the
	// guard refused every commit in a project whose trunk is `main`, and
	// told its owner to `git switch develop`, a branch that does not
	// exist in their repository. Adoption was impossible for anyone not
	// already shaped like us.
	//
	// Declared wins. Otherwise the branch is DISCOVERED from what is
	// stable — the forge's published default, git's configured one, or a
	// single conventional trunk — never read off HEAD: defining the
	// integration branch as wherever the checkout currently is makes
	// every check that depends on it vacuous, and the post-checkout
	// warning that exists to say "you have wandered" goes silent exactly
	// when somebody wanders.
	//
	// The SHARED checkout is asked, never the worktree the caller is
	// standing in: which branch integrates is a fact about the project,
	// and an agent would otherwise be told its own wip ref is it.
	const declared = (
		config.development.branches as { integration?: unknown } | undefined
	)?.integration;
	if (typeof declared === 'string' && declared.length > 0) return policy;
	const discovered = defaultBranchOf(sharedCheckout(root) ?? root);
	return discovered === undefined ||
		discovered === policy.branches.integration
		? policy
		: {
				...policy,
				branches: { ...policy.branches, integration: discovered },
			};
};
