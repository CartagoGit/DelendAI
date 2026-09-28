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
import { defaultBranchOf } from '../development-policy/default-branch';
import { parseJsonc } from '../config/jsonc-document';
import { resolveDevelopmentPolicy } from '../development-policy/resolve';
import { sharedCheckout } from '../shared/shared-checkout';
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import { DEFAULT_CORE_PATHS } from '../contracts/interfaces/core-paths.interface';

import { isRecord, readConfigText } from './command-args.helper';

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

/**
 * The project's documents directory, as the assembled server resolves it:
 * the declared `docsDir`, or the default. Read by the guard, which runs
 * with no server, so a review unit's scope is the documents the project
 * actually keeps.
 */
export const readWorkspaceDocsDir = async (root: string): Promise<string> => {
	const text = await readConfigText(root);
	const parsed = text === undefined ? undefined : parseJsonc(text).value;
	return isRecord(parsed) &&
		typeof parsed.docsDir === 'string' &&
		parsed.docsDir.length > 0
		? parsed.docsDir
		: DEFAULT_CORE_PATHS.docsDir;
};
