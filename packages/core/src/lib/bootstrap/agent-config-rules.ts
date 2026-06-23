// agent-config-rules: declarative table for "which files / dirs
// signal which AI-agent config?".
//
// SOLID — Open/Closed. The previous `detectAgentConfigs` was a
// 6-branch `if` cascade (one with an `||` and one with a `listDir`
// check). Adding a new editor meant editing that body. The table
// form lets you add an editor by appending one entry.
//
// SOLID — Single Responsibility. This module owns ONE thing: the
// `file/dir evidence → editor id` mapping. The matcher that
// consumes the table lives next to it; `analyze-project.ts` only
// calls `matchAgentConfigs(reader)`.
//
// SOLID — Dependency Inversion. Hosts inject their own rule list
// (e.g. an internal editor with a corporate config file).

import type { IFileReader } from './analyze-project';

export type IAgentConfigMatchKind = 'file' | 'dir' | 'file-or-dir';

/**
 * `file`     — match when `path` exists as a file.
 * `dir`      — match when `path` is a non-empty directory.
 * `file-or-dir` — match when EITHER `exists(path)` OR
 *                  `listDir(path).length > 0` returns true.
 */
export interface IAgentConfigRule {
	readonly id: string;
	readonly path: string;
	readonly matchAs: IAgentConfigMatchKind;
	/** Earlier rules win. Reserved for future use. */
	readonly priority: number;
}

export const DEFAULT_AGENT_CONFIG_RULES: readonly IAgentConfigRule[] = [
	{
		id: 'CLAUDE.md',
		path: 'CLAUDE.md',
		matchAs: 'file',
		priority: 100,
	},
	{
		id: 'AGENTS.md',
		path: 'AGENTS.md',
		matchAs: 'file',
		priority: 90,
	},
	{
		id: 'cursor',
		path: '.cursorrules',
		matchAs: 'file-or-dir',
		// The original code checks `.cursorrules` OR `.cursor/*`;
		// `.cursor` is a directory in the standard Cursor setup.
		// We split that into two paths (a file `matchAs: file-or-dir`
		// for `.cursorrules`, a dir-based one for `.cursor`).
		priority: 80,
	},
	{
		id: 'cursor',
		path: '.cursor',
		matchAs: 'dir',
		priority: 79,
	},
	{
		id: 'copilot-instructions',
		path: '.github/copilot-instructions.md',
		matchAs: 'file',
		priority: 70,
	},
	{
		id: 'github-agents',
		path: '.github/agents',
		matchAs: 'dir',
		priority: 60,
	},
	{
		id: 'windsurf',
		path: '.windsurfrules',
		matchAs: 'file',
		priority: 50,
	},
];

/**
 * Pure: returns the list of agent-config ids detected in priority
 * order. The order is meaningful for the output (it shows the order
 * an LLM would read them) but the matcher itself does not depend
 * on it.
 */
const EMPTY_RESULT: readonly string[] = Object.freeze([]);

const matches = (reader: IFileReader, rule: IAgentConfigRule): boolean => {
	if (rule.matchAs === 'file') return reader.exists(rule.path);
	if (rule.matchAs === 'dir') return reader.listDir(rule.path).length > 0;
	// file-or-dir: cursor's `.cursorrules` is a file, but legacy /
	// split setups leave just a `.cursor` dir. The original code
	// accepted either; we keep that behaviour.
	return reader.exists(rule.path) || reader.listDir(rule.path).length > 0;
};

export const matchAgentConfigs = (
	reader: IFileReader,
	rules: readonly IAgentConfigRule[] = DEFAULT_AGENT_CONFIG_RULES,
): readonly string[] => {
	const sorted = [...rules].sort((a, b) => b.priority - a.priority);
	const out: string[] = [];
	for (const rule of sorted) {
		if (matches(reader, rule)) out.push(rule.id);
	}
	return out.length === 0 ? EMPTY_RESULT : out;
};
