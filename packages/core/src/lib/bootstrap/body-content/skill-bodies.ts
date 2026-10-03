// body-content/skill-bodies: the bodies of the two scaffolded
// skills (`project standards`, `<framework> conventions`).
//
// SOLID — Single Responsibility. Each function owns ONE skill
// body. The dispatcher (in `index.ts`) routes by name. New skills
// are added by writing a new function and a new entry in the
// dispatcher's switch — no need to edit the existing ones.

import type { IProjectAnalysis } from '../analyze-project';
import { formatList, formatScripts } from './format-helpers';
import { frameworkHintsFor } from './framework-hints';
import { languageHintsFor } from './language-hints';

/** Body of the generic `project standards` skill. */
export const projectStandardsSkillBody = (analysis: IProjectAnalysis): string =>
	[
		`## Project facts`,
		'',
		`- Name: \`${analysis.name ?? '(unset)'}\``,
		`- Type: \`${analysis.projectType}\``,
		`- Language: \`${analysis.language}\``,
		`- Framework: \`${analysis.framework ?? '(none)'}\``,
		`- Monorepo: \`${analysis.monorepoTool ?? '(none)'}\``,
		`- Package manager: \`${analysis.packageManager}\``,
		`- Test runner: \`${analysis.testRunner}\``,
		analysis.hasMcpProject
			? `- MCP server: PRESENT (evidence: ${formatList(analysis.mcpEvidence)})`
			: '- MCP server: _not detected_',
		`- CI: ${formatList(analysis.ci)}`,
		`- Agent configs already in repo: ${formatList(analysis.agentConfigs)}`,
		'',
		'## Language conventions',
		'',
		...languageHintsFor(analysis).map((h) => `- ${h}`),
		'',
		analysis.framework !== undefined
			? `## ${analysis.framework} conventions\n\n${frameworkHintsFor(
					analysis,
				)
					.map((h) => `- ${h}`)
					.join('\n')}`
			: '',
	].join('\n');

/** Body of a framework-specific skill, when one is scaffolded. */
export const frameworkSkillBody = (analysis: IProjectAnalysis): string => {
	if (analysis.framework === undefined) return '';
	const hints = frameworkHintsFor(analysis);
	return [
		`## When to use this skill`,
		'',
		`- Before adding or reviewing ${analysis.framework} code in this project.`,
		`- When a code review flags a non-idiomatic ${analysis.framework} pattern.`,
		'',
		`## ${analysis.framework} idioms this repo follows`,
		'',
		hints.length > 0
			? hints.map((h) => `- ${h}`).join('\n')
			: '_no extra hints_',
		'',
		`## Reference`,
		`- Quality scripts: ${formatScripts(analysis.scripts)}`,
	].join('\n');
};

/** Concrete `whenToUse` lines for the framework skill. */
export const frameworkSkillWhenToUse = (
	analysis: IProjectAnalysis,
): readonly string[] => {
	if (analysis.framework === undefined) return [];
	return [
		`Before writing or reviewing ${analysis.framework} code.`,
		`When validating a pull request touches ${analysis.framework} files.`,
	];
};
