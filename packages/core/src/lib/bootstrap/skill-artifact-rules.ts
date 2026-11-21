// skill-artifact-rules: declarative table for the skills the
// blueprint pipeline scaffolds.
//
// SOLID — Open/Closed. The previous `skills` builder was an
// inline 1-always + 1-conditional block in `build-blueprint.ts`;
// adding a new skill meant editing that body. The table form
// lets you add a skill by appending one entry.
//
// SOLID — Single Responsibility. This module owns ONE thing: the
// `condition → skill` mapping. The matcher is pure pipeline. Both
// the `body` and the `whenToUse` lines are built lazily.
//
// SOLID — Dependency Inversion. Hosts inject their own skill list
// (e.g. a corporate `security-review` skill that reads the
// `SECURITY.md` policy file).

import type { IProjectAnalysis } from './analyze-project';
import {
	frameworkSkillBody,
	frameworkSkillWhenToUse,
	projectStandardsSkillBody,
} from './body-content';
import type { IBlueprintArtifact } from './build-blueprint';

export interface ISkillArtifactContext {
	readonly analysis: IProjectAnalysis;
	readonly serverName: string;
}

export interface ISkillArtifactRule {
	/** Stable id (used in tests). */
	readonly id: string;
	/**
	 * Priority — the matcher iterates the rules in priority order
	 * and pushes every included rule. The original code emitted
	 * `project standards` first, then optionally the framework
	 * skill; the priorities below reproduce that order.
	 */
	readonly priority: number;
	/**
	 * Lazy `name` builder. The framework-conventions skill names
	 * itself after the framework id (e.g. `react conventions`),
	 * so the name is context-dependent.
	 */
	readonly name: (ctx: ISkillArtifactContext) => string;
	/** Lazy `description` builder (same reason as `name`). */
	readonly description: (ctx: ISkillArtifactContext) => string;
	/** Gate: when this returns false, the rule is skipped. */
	readonly includeWhen: (ctx: ISkillArtifactContext) => boolean;
	/**
	 * Lazy body builder. Called only when the rule is included.
	 */
	readonly body: (ctx: ISkillArtifactContext) => string;
	/**
	 * `whenToUse` lines (skill-specific). Lazily built.
	 */
	readonly whenToUse: (ctx: ISkillArtifactContext) => readonly string[];
}

export const DEFAULT_SKILL_ARTIFACT_RULES: readonly ISkillArtifactRule[] = [
	{
		id: 'project-standards',
		priority: 1000,
		name: () => 'project standards',
		description: () => 'Closed stack and conventions of the project.',
		includeWhen: () => true,
		body: ({ analysis }) => projectStandardsSkillBody(analysis),
		whenToUse: () => [
			'Before writing or reviewing code in this project.',
			'When a code review questions a project-wide convention.',
		],
	},
	{
		id: 'framework-conventions',
		priority: 900,
		// The name and description include the framework id (e.g.
		// `react conventions`, `react idioms and lint/type rules
		// for this project.`).
		name: ({ analysis }) => `${analysis.framework} conventions`,
		description: ({ analysis }) =>
			`${analysis.framework} idioms and lint/type rules for this project.`,
		includeWhen: ({ analysis }) => analysis.framework !== undefined,
		body: ({ analysis }) => frameworkSkillBody(analysis),
		whenToUse: ({ analysis }) => [...frameworkSkillWhenToUse(analysis)],
	},
];

export const matchSkillArtifacts = (
	ctx: ISkillArtifactContext,
	rules: readonly ISkillArtifactRule[] = DEFAULT_SKILL_ARTIFACT_RULES,
): readonly IBlueprintArtifact[] => {
	const sorted = [...rules].sort((a, b) => b.priority - a.priority);
	const out: IBlueprintArtifact[] = [];
	for (const rule of sorted) {
		if (!rule.includeWhen(ctx)) continue;
		out.push({
			name: rule.name(ctx),
			description: rule.description(ctx),
			body: rule.body(ctx),
			whenToUse: [...rule.whenToUse(ctx)],
		});
	}
	return out;
};
