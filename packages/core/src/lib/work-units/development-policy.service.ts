/**
 * development-policy.service.ts — the project's resolved development
 * policy, read from its own configuration, with no MCP server.
 *
 * WHY it is a service and not a line inside each command: the guard (git
 * hooks) and `delendai work` both have to obey the SAME policy, and a
 * second reader is a second chance to disagree about what the project
 * declared. A workflow only holds if every entry point reads one answer.
 *
 * WHY a parse error throws instead of resolving to the default: a project
 * that declared a policy and then typed a comma wrong must not silently
 * become a project with the default rules. Absence is a valid answer;
 * illegibility is not.
 */
import { resolveEffectivePolicy } from '../development-policy/effective-policy';
import { parseJsonc } from '../config/jsonc-document';
import type { ILegacyDevelopmentInput } from '../development-policy/resolve.interface';
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import { DEFAULT_CORE_PATHS } from '../contracts/interfaces/core-paths.interface';

import { isRecord, readConfigText } from './command-args.helper';

/**
 * The pre-policy fields of a configuration file, for the compatibility
 * layer. Absent fields stay absent: a project that never wrote them must
 * reach the built-in default, not a model they imply.
 */
const legacyFieldsOf = (
	config: Record<string, unknown>,
): ILegacyDevelopmentInput => {
	const plugins = isRecord(config.plugins) ? config.plugins : undefined;
	const commitPolicy = isRecord(plugins?.['commit-policy'])
		? plugins['commit-policy']
		: undefined;
	const options = isRecord(commitPolicy?.options)
		? commitPolicy.options
		: undefined;
	return {
		...(typeof config.agentWorktree === 'boolean'
			? { agentWorktree: config.agentWorktree }
			: {}),
		...(options === undefined ? {} : { commitPolicyOptions: options }),
	};
};

/**
 * The policy this workspace works under: the one it declares, or the one
 * delendai adopts for it when it declares none (`policy.source` says
 * which). Never `undefined`: the guard, `delendai work` and the served
 * instructions all read this, so none of them can disagree about whether
 * a policy exists.
 */
export const readWorkspacePolicy = async (
	root: string,
): Promise<IResolvedDevelopmentPolicy> => {
	const text = await readConfigText(root);
	const parsed = text === undefined ? undefined : parseJsonc(text);
	if (parsed !== undefined && parsed.errors.length > 0) {
		throw new Error(
			`delendai.config.json does not parse (${String(parsed.errors.length)} error(s))`,
		);
	}
	const config = isRecord(parsed?.value) ? parsed.value : {};
	return resolveEffectivePolicy({
		...(isRecord(config.development)
			? { development: config.development }
			: {}),
		legacy: legacyFieldsOf(config),
		workspaceRoot: root,
	});
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
