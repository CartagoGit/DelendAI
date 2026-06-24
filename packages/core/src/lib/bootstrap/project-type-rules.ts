// project-type-rules: declarative table for the "what kind of
// project is this?" classifier.
//
// SOLID — Open/Closed. The previous `detectProjectType` was a
// 6-branch `if` cascade in `analyze-project.ts`; adding a new
// project type meant editing that body. The table form lets you
// add a rule (or swap priority) by appending one entry. The matcher
// itself is pure pipeline.
//
// SOLID — Single Responsibility. This module owns ONE thing: the
// rule table. The matcher that consumes it lives in
// `analyze-project.ts` and only knows how to apply the rules.

import type { IFileReader, IProjectType } from './analyze-project';

export interface IProjectTypeRule {
	readonly result: IProjectType;
	readonly priority: number;
	/**
	 * Returns `true` when the rule applies. The matcher iterates
	 * the rules in descending `priority` order and returns the
	 * first match.
	 */
	readonly matches: (ctx: IProjectTypeRuleContext) => Promise<boolean> | boolean;
}

export interface IProjectTypeRuleContext {
	readonly reader: IFileReader;
	readonly hasBin: boolean;
	readonly hasExports: boolean;
	readonly hasMain: boolean;
	readonly framework: string | undefined;
	readonly monorepoTool: string | undefined;
	readonly isGame: boolean;
}

/**
 * The default rule table. Order in this array is NOT significant —
 * the matcher sorts by `priority` descending.
 *
 * Why a table and not a chain of `if`? Because the priority of the
 * "monorepo beats framework" rule is *data*, not control flow. A
 * host that wants `webapp` to outrank `monorepo` overrides the
 * table without forking the matcher.
 */
export const DEFAULT_PROJECT_TYPE_RULES: readonly IProjectTypeRule[] = [
	{
		result: 'monorepo',
		priority: 100,
		matches: async (ctx) => ctx.monorepoTool !== undefined,
	},
	{
		result: 'game',
		priority: 90,
		matches: async (ctx) => ctx.isGame,
	},
	{
		result: 'webapp',
		priority: 80,
		matches: async (ctx) => ctx.framework !== undefined,
	},
	{
		result: 'cli',
		priority: 70,
		matches: async (ctx) => ctx.hasBin,
	},
	{
		result: 'library',
		priority: 60,
		matches: async (ctx) => ctx.hasExports || ctx.hasMain,
	},
	// Non-JS stacks — Rust.
	{
		result: 'cli',
		priority: 55,
		matches: async (ctx) =>
			await ctx.reader.exists('Cargo.toml') && await ctx.reader.exists('src/main.rs'),
	},
	{
		result: 'library',
		priority: 54,
		matches: async (ctx) => await ctx.reader.exists('Cargo.toml'),
	},
	// Go.
	{
		result: 'cli',
		priority: 53,
		matches: async (ctx) =>
			await ctx.reader.exists('go.mod') && await ctx.reader.exists('main.go'),
	},
	{
		result: 'library',
		priority: 52,
		matches: async (ctx) => await ctx.reader.exists('go.mod'),
	},
	// Python — always a library at the manifest level; concrete
	// packaging is a separate question.
	{
		result: 'library',
		priority: 50,
		matches: async (ctx) =>
			await ctx.reader.exists('pyproject.toml') ||
			await ctx.reader.exists('setup.py'),
	},
];

/**
 * Pure matcher: sorts the rules by `priority` descending and
 * returns the first match's `result`, or `'generic'` when no rule
 * applies. Allocation-free in the no-match case.
 */
export const matchProjectType = async (
	ctx: IProjectTypeRuleContext,
	rules: readonly IProjectTypeRule[] = DEFAULT_PROJECT_TYPE_RULES,
): Promise<IProjectType> => {
	const sorted = [...rules].sort((a, b) => b.priority - a.priority);
	for (const rule of sorted) {
		if (await rule.matches(ctx)) return rule.result;
	}
	return 'generic';
};
