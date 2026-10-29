// agent-config-rules: declarative table for "which files / dirs
// signal which AI-agent config?".
//
// SOLID — Open/Closed. The previous `detectAgentConfigs` was a
// 6-branch `if` cascade (one with an `||` and one with a `listDir`
// check). Adding a new editor meant editing that body. The table
// is now read from `AGENT_HOSTS`, so an editor is added there.
//
// SOLID — Single Responsibility. This module owns ONE thing: the
// `file/dir evidence → editor id` mapping. The matcher that
// consumes the table lives next to it; `analyze-project.ts` only
// calls `matchAgentConfigs(reader)`.
//
// SOLID — Dependency Inversion. Hosts inject their own rule list
// (e.g. an internal editor with a corporate config file).

import {
	AGENT_HOST_INSTRUCTION_FILES,
	AGENT_HOSTS,
} from '../contracts/constants/agent-hosts.constant';
import type { IFileReader } from './analyze-project';

export type IAgentConfigMatchKind = 'file' | 'dir' | 'file-or-dir';

/**
 * `file`     — match when the path exists as a file.
 * `dir`      — match when the path is a non-empty directory.
 * `file-or-dir` — match when EITHER `exists(path)` OR
 *                  `listDir(path).length > 0` returns true.
 *
 * SOLID — I. A single rule carries EITHER a `path` (single
 * evidence point) OR a `paths` array (multiple equivalent
 * evidence points for the same id). The Cursor rule, e.g.,
 * matches either `.cursorrules` (legacy file) OR `.cursor`
 * (modern dir) under the SAME id `cursor` — restoring the
 * unique-id contract.
 */

export interface IAgentConfigRule {
	readonly id: string;
	/** Single evidence path. Mutually exclusive with `paths`. */
	readonly path?: string;
	/** Multiple equivalent evidence paths. Mutually exclusive with `path`. */
	readonly paths?: readonly string[];
	readonly matchAs: IAgentConfigMatchKind;
	/** Earlier rules win. Reserved for future use. */
	readonly priority: number;
}

/**
 * One rule per file or folder a host reads its instructions or agents
 * from, named by its path, read from `AGENT_HOSTS`: a host added there is
 * recognised here with no edit. Earlier hosts rank first.
 */
export const DEFAULT_AGENT_CONFIG_RULES: readonly IAgentConfigRule[] = [
	...AGENT_HOST_INSTRUCTION_FILES.map(({ path }) => ({
		path,
		matchAs: 'file' as const,
	})),
	...AGENT_HOSTS.flatMap((host) =>
		host.agents === undefined
			? []
			: [{ path: host.agents.dir, matchAs: 'dir' as const }],
	),
].map((rule, index, all) => ({
	id: rule.path,
	...rule,
	priority: all.length - index,
}));

/**
 * Pure: returns the list of agent-config ids detected in priority
 * order. The order is meaningful for the output (it shows the order
 * an LLM would read them) but the matcher itself does not depend
 * on it.
 */
const EMPTY_RESULT: readonly string[] = Object.freeze([]);

const pathMatches = async (
	reader: IFileReader,
	matchAs: IAgentConfigMatchKind,
	path: string,
): Promise<boolean> => {
	if (matchAs === 'file') return await reader.exists(path);
	if (matchAs === 'dir') return (await reader.listDir(path)).length > 0;
	// file-or-dir: legacy file setups OR modern dir setups. Both
	// indicate the same editor.
	return (
		(await reader.exists(path)) || (await reader.listDir(path)).length > 0
	);
};

const matches = async (
	reader: IFileReader,
	rule: IAgentConfigRule,
): Promise<boolean> => {
	const targets =
		rule.paths !== undefined
			? rule.paths
			: rule.path !== undefined
				? [rule.path]
				: [];
	for (const path of targets) {
		if (await pathMatches(reader, rule.matchAs, path)) return true;
	}
	return false;
};

export const matchAgentConfigs = async (
	reader: IFileReader,
	rules: readonly IAgentConfigRule[] = DEFAULT_AGENT_CONFIG_RULES,
): Promise<readonly string[]> => {
	const sorted = [...rules].sort((a, b) => b.priority - a.priority);
	const out: string[] = [];
	for (const rule of sorted) {
		if (await matches(reader, rule)) out.push(rule.id);
	}
	return out.length === 0 ? EMPTY_RESULT : out;
};
