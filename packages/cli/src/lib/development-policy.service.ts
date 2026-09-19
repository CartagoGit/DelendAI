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
import { parseJsonc, resolveDevelopmentPolicy } from '@delendai/core/public';
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
	return resolveDevelopmentPolicy({ development: config.development });
};
