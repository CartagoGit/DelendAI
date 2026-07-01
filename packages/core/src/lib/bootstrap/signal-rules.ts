// signal-rules: declarative table for the "free-form notes" the
// `analyzeProject` pipeline appends to `IProjectAnalysis.signals`.
//
// SOLID — Open/Closed. The previous signal builder was a 9-branch
// `if`-`push` chain in `analyze-project.ts`; adding a new signal
// meant editing that body. The table form lets you add a signal by
// appending one entry.
//
// SOLID — Single Responsibility. This module owns ONE thing: the
// `condition → summary string` mapping. The matcher is pure
// pipeline. The signal context (`IProjectAnalysis`) is passed in
// read-only; the rules never mutate.
//
// SOLID — Dependency Inversion. Hosts inject their own rule list
// (e.g. a corporate stack that wants its own compliance signal).
// The default rules are the ones mcp-vertex ships out of the box.
//
// SOLID — Interface Segregation. `summary` is a function of
// `ISignalContext`, not a string template with embedded
// placeholders. A rule that needs a `{}` writes the substitution
// itself (one-line). The matcher has nothing to interpret.

import type { IProjectAnalysis } from './analyze-project';

export interface ISignalContext {
	readonly analysis: IProjectAnalysis;
	readonly hasCustomExtraTools: boolean;
	readonly hasCustomVertexConfig: boolean;
}

export interface ISignalRule {
	/** Stable id (used in tests, not user-facing). */
	readonly id: string;
	/**
	 * Priority — the matcher iterates the rules in descending
	 * priority order and appends every match's `summary(ctx)` to
	 * the `signals` list. The original code emitted signals in a
	 * specific order (manifest → mcp-server → framework → …);
	 * priorities in this table reproduce that order and leave
	 * headroom (10s) for host insertions.
	 */
	readonly priority: number;
	/**
	 * Pure function. Receives the context (the analysis +
	 * the two `detectX` booleans) and returns the signal string.
	 * Returning the empty string means "no signal" (rare; the
	 * `condition` field is the primary gate).
	 */
	readonly summary: (ctx: ISignalContext) => string;
	/** Primary gate: the rule is skipped when this returns `false`. */
	readonly condition: (ctx: ISignalContext) => boolean;
}

export const DEFAULT_SIGNAL_RULES: readonly ISignalRule[] = [
	{
		id: 'no-manifest',
		priority: 200,
		condition: ({ analysis }) =>
			!analysis.hasPackageJson && analysis.language === 'unknown',
		summary: () => 'no recognised manifest — limited analysis',
	},
	// The MCP-server note has two possible summaries depending on
	// whether the project already ships an MCP server. We model it
	// as TWO rules with the SAME priority and mutually exclusive
	// conditions; exactly one fires per project.
	{
		id: 'mcp-server-exists',
		priority: 195,
		condition: ({ analysis }) => analysis.hasMcpProject,
		summary: () =>
			'an MCP server already exists; recommend augmenting, not replacing',
	},
	{
		id: 'mcp-server-missing',
		priority: 195,
		condition: ({ analysis }) => !analysis.hasMcpProject,
		summary: () => 'no MCP server detected; a fresh one can be scaffolded',
	},
	{
		id: 'web-framework',
		priority: 100,
		condition: ({ analysis }) => analysis.framework !== undefined,
		summary: ({ analysis }) => `web framework: ${analysis.framework}`,
	},
	{
		id: 'monorepo-tool',
		priority: 90,
		condition: ({ analysis }) => analysis.monorepoTool !== undefined,
		summary: ({ analysis }) => `monorepo tool: ${analysis.monorepoTool}`,
	},
	{
		id: 'non-js-stack',
		priority: 80,
		condition: ({ analysis }) =>
			analysis.language !== 'typescript' &&
			analysis.language !== 'javascript',
		summary: ({ analysis }) => `non-JS stack: ${analysis.language}`,
	},
	{
		id: 'agent-configs',
		priority: 70,
		condition: ({ analysis }) => analysis.agentConfigs.length > 0,
		summary: ({ analysis }) =>
			`existing agent config (${analysis.agentConfigs.join(', ')}); align with it`,
	},
	{
		id: 'custom-extra-tools',
		priority: 60,
		condition: ({ hasCustomExtraTools }) => hasCustomExtraTools,
		summary: () => 'host-config has custom extraTools',
	},
	{
		id: 'custom-vertex-config',
		priority: 50,
		condition: ({ hasCustomVertexConfig }) => hasCustomVertexConfig,
		summary: () => 'mcp-vertex.config.json has plugin or validation config',
	},
	{
		id: 'ci',
		priority: 40,
		condition: ({ analysis }) => analysis.ci.length > 0,
		summary: ({ analysis }) => `CI: ${analysis.ci.join(', ')}`,
	},
];

export const matchSignals = (
	ctx: ISignalContext,
	rules: readonly ISignalRule[] = DEFAULT_SIGNAL_RULES,
): readonly string[] => {
	const sorted = [...rules].sort((a, b) => b.priority - a.priority);
	const out: string[] = [];
	for (const rule of sorted) {
		if (!rule.condition(ctx)) continue;
		const summary = rule.summary(ctx);
		if (summary === '') continue;
		out.push(summary);
	}
	return out;
};
