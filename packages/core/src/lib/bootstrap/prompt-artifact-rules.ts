// prompt-artifact-rules: declarative table for the prompts the
// blueprint pipeline scaffolds.
//
// SOLID — Open/Closed. The previous `prompts` builder was an
// inline 3-prompt + 2-`if` block in `build-blueprint.ts`; adding a
// new prompt meant editing that body. The table form lets you add
// a prompt by appending one entry.
//
// SOLID — Single Responsibility. This module owns ONE thing: the
// `condition → prompt` mapping. The matcher is pure pipeline. The
// `IBlueprintArtifact.body` is built lazily (a function of the
// blueprint context) so the matcher never has to interpret the
// analysis.
//
// SOLID — Dependency Inversion. Hosts inject their own prompt list
// (e.g. a corporate `onboarding` prompt that asks the agent to
// read the security policy first).

import type { IProjectAnalysis } from './analyze-project';
import {
	continueProposalPromptBody,
	fixQualityPromptBody,
	startPromptBody,
} from './body-content';
import type { IBlueprintArtifact } from './build-blueprint';

export interface IPromptArtifactContext {
	readonly analysis: IProjectAnalysis;
	readonly namespacePrefix: string;
	readonly plugins: readonly string[];
}

export interface IPromptArtifactRule {
	/** Stable id (used in tests). */
	readonly id: string;
	/**
	 * Priority — the matcher iterates the rules in priority order
	 * and pushes every rule whose `includeWhen(ctx)` returns true.
	 * The original code emitted `start` first, then optionally
	 * `fix quality`, then optionally `continue proposal`; the
	 * priorities below reproduce that order and leave headroom
	 * (100s) for host insertions.
	 */
	readonly priority: number;
	/** Final id of the prompt (the `name` field on `IBlueprintArtifact`). */
	readonly name: string;
	readonly description: string;
	/** Gate: when this returns false, the rule is skipped. */
	readonly includeWhen: (ctx: IPromptArtifactContext) => boolean;
	/**
	 * Lazy body builder. The matcher calls this only when the rule
	 * is included; a host that wants a heavier body (e.g. one that
	 * reads the filesystem) pays the cost only for the included
	 * prompts.
	 */
	readonly body: (ctx: IPromptArtifactContext) => string;
	/**
	 * The `whenToUse` lines for skills; the matcher ignores this
	 * for prompts (it's a `IBlueprintArtifact` field only relevant
	 * to skills). Kept here as `undefined` so the table shape is
	 * uniform with the skill-artifact-rules.
	 */
	readonly whenToUse?: undefined;
}

export const DEFAULT_PROMPT_ARTIFACT_RULES: readonly IPromptArtifactRule[] = [
	{
		id: 'start',
		priority: 1000,
		name: 'start',
		description: 'Orient and start working in this project.',
		includeWhen: () => true,
		body: ({ analysis, namespacePrefix }) =>
			startPromptBody(analysis, namespacePrefix),
	},
	{
		id: 'fix-quality',
		priority: 900,
		name: 'fix quality',
		description: 'Run the gates and fix what fails.',
		includeWhen: ({ analysis }) => Object.keys(analysis.scripts).length > 0,
		body: ({ analysis, namespacePrefix }) =>
			fixQualityPromptBody(analysis, namespacePrefix),
	},
];

export const matchPromptArtifacts = (
	ctx: IPromptArtifactContext,
	rules: readonly IPromptArtifactRule[] = DEFAULT_PROMPT_ARTIFACT_RULES,
): readonly IBlueprintArtifact[] => {
	const sorted = [...rules].sort((a, b) => b.priority - a.priority);
	const out: IBlueprintArtifact[] = [];
	for (const rule of sorted) {
		if (!rule.includeWhen(ctx)) continue;
		out.push({
			name: rule.name,
			description: rule.description,
			body: rule.body(ctx),
		});
	}
	return out;
};
