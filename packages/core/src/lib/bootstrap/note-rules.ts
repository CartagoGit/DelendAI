// note-rules: declarative table for the `notes` field the
// `buildServerBlueprint` pipeline appends to `IServerBlueprint.notes`.
//
// SOLID — Open/Closed. The previous `notes` builder was a 3-always
// + 2-`if`-`push` block in `build-blueprint.ts`; adding a new
// note meant editing that body. The table form lets you add a
// note by appending one entry.
//
// SOLID — Single Responsibility. This module owns ONE thing: the
// `condition → note(s)` mapping. The matcher is pure pipeline.
// A rule may emit MULTIPLE notes (a single rule can return a
// list of strings) — that is how the original "knowledge hints
// from the pattern catalog" + "MCP-server note" are modelled.
//
// SOLID — Dependency Inversion. Hosts inject their own note list
// (e.g. a corporate "approved by security review" note that
// only fires when the project has a `SECURITY.md` file).

import type { IProjectAnalysis } from './analyze-project';
import type { IBlueprintDefaults } from './build-blueprint';
import type { IPatternOverrides } from './pattern-catalog-overrides';
import { resolvePatternCatalog } from './pattern-catalog-overrides';

export interface INoteContext {
	readonly analysis: IProjectAnalysis;
	readonly defaults: IBlueprintDefaults;
	readonly tests: boolean;
	readonly patternOverrides?: IPatternOverrides;
}

export interface INoteRule {
	/** Stable id (used in tests). */
	readonly id: string;
	/**
	 * Priority — the matcher iterates the rules in priority order
	 * and concatenates every included rule's `notes(ctx)`. The
	 * original code emitted `pattern.knowledgeHints` first, then
	 * the MCP note, then the tests note, then the agent-config
	 * note (conditional), then the keepLegacy note. The
	 * priorities below reproduce that order.
	 */
	readonly priority: number;
	/**
	 * Pure function. Returns the list of notes the rule emits
	 * (empty when the rule does not apply). A single rule may
	 * emit several strings — that is how the pattern knowledge
	 * hints are emitted as a single rule with many notes.
	 */
	readonly notes: (ctx: INoteContext) => readonly string[];
}

export const DEFAULT_NOTE_RULES: readonly INoteRule[] = [
	{
		// The pattern catalog ships `knowledgeHints` — short
		// guidance lines for the specific project type. They are
		// the first thing the agent reads; emit them first.
		id: 'pattern-knowledge-hints',
		priority: 1000,
		notes: ({ analysis, patternOverrides }) => {
			const pattern =
				resolvePatternCatalog(patternOverrides)[analysis.projectType];
			return pattern.knowledgeHints;
		},
	},
	{
		// The MCP-server note: it has two possible strings
		// depending on whether the project already ships an
		// server. We model it as a single rule with two branches
		// inside the function so the matcher has no per-rule
		// branching to interpret.
		id: 'mcp-server-state',
		priority: 900,
		notes: ({ analysis }) =>
			analysis.hasMcpProject
				? [
						`An MCP server already exists (${analysis.mcpEvidence.join('; ')}): analyze it and integrate it with mcp-vertex instead of replacing it — register it alongside, reuse its tools, and adopt mcp-vertex conventions incrementally.`,
					]
				: [
						'No MCP server found: create one from this blueprint (scaffold the host project, then each tool/prompt/skill/agent).',
					],
	},
	{
		id: 'tests-policy',
		priority: 800,
		notes: ({ tests }) =>
			tests
				? ['Generate a test alongside each tool.']
				: ['Tests omitted (--mcp-project-tests=false).'],
	},
	{
		id: 'agent-configs-align',
		priority: 700,
		notes: ({ analysis }) =>
			analysis.agentConfigs.length > 0
				? [
						`Align with the existing agent config (${analysis.agentConfigs.join(', ')}).`,
					]
				: [],
	},
	{
		id: 'keep-legacy-recommendation',
		priority: 600,
		notes: ({ defaults }) =>
			defaults.keepLegacy
				? [
						`Recommended keepLegacy=true: ${defaults.reasons.join('; ')}.`,
					]
				: ['Recommended keepLegacy=false: greenfield-safe default.'],
	},
	{
		id: 'keep-legacy-warnings',
		priority: 590,
		notes: ({ defaults }) => [...defaults.warnings],
	},
];

export const matchNotes = (
	ctx: INoteContext,
	rules: readonly INoteRule[] = DEFAULT_NOTE_RULES,
): readonly string[] => {
	const sorted = [...rules].sort((a, b) => b.priority - a.priority);
	const out: string[] = [];
	for (const rule of sorted) {
		for (const note of rule.notes(ctx)) {
			out.push(note);
		}
	}
	return out;
};
