// body-content: derive the actual TEXT of generated prompts, skills and
// agents from the project analysis — not just their name and a TODO body.
//
// The previous scaffold emitted skeletons whose bodies started with
// "TODO". That's correct for a greenfield agent that will fill the
// content in. But the user goal is: "the LLM must have the perfect
// instructions to reformulate any other project into an mcp-vertex
// project". That means the *first* generated server already has bodies
// derived from the analysis — the agent only writes the deltas.
//
// This module is the seam. Pure functions over `IProjectAnalysis`,
// returns strings the generators can paste. No filesystem, no MCP.

import type { IProjectAnalysis } from './analyze-project';
import type { IBlueprintArtifact } from './build-blueprint';

const fmtList = (items: readonly string[]): string =>
	items.length === 0
		? '_(none detected)_'
		: items.map((s) => `- \`${s}\``).join('\n');

const fmtScripts = (scripts: Readonly<Record<string, string>>): string => {
	const roles = Object.keys(scripts);
	if (roles.length === 0) return '_(no quality scripts detected)_';
	return roles
		.map((role) => `- \`${role}\` → \`${scripts[role]}\``)
		.join('\n');
};

const frameworkHints = (analysis: IProjectAnalysis): readonly string[] => {
	switch (analysis.framework) {
		case 'angular':
			return [
				'Standalone components only; no NgModules for new code.',
				'Use Angular signals for component state.',
				'OnPush change detection for presentational components.',
			];
		case 'next':
			return [
				'App Router + React Server Components by default.',
				'Use server actions for mutations, route handlers for APIs.',
			];
		case 'react':
			return [
				'Function components + hooks; no class components in new code.',
				'Co-locate styles and tests with the component.',
			];
		case 'vue':
			return ['Composition API + `<script setup>` for new components.'];
		case 'svelte':
			return ['Svelte 5 runes for new components; avoid legacy stores.'];
		case 'solid':
			return ['Fine-grained reactivity; avoid destructuring props.'];
		default:
			return [];
	}
};

const languageHints = (analysis: IProjectAnalysis): readonly string[] => {
	switch (analysis.language) {
		case 'typescript':
			return [
				'`strict: true` in tsconfig — no implicit any.',
				'Prefer `readonly` and discriminated unions over enums.',
			];
		case 'javascript':
			return [
				'Use JSDoc for exported APIs; treat JSDoc types as a contract.',
			];
		case 'python':
			return ['Type hints everywhere; mypy strict for new modules.'];
		case 'go':
			return ['Wrap errors; do not discard returned errors.'];
		case 'rust':
			return ['`Result` over `unwrap`/`expect` in non-test code.'];
		default:
			return [];
	}
};

/** The body of the `start` prompt: orient the agent in this specific repo. */
export const startPromptBody = (
	analysis: IProjectAnalysis,
	namespacePrefix: string,
): string =>
	[
		`You are working in **${analysis.name ?? 'this project'}** (\`${analysis.projectType}\`, \`${analysis.language}\`).`,
		'',
		`First call \`${namespacePrefix}_overview\` — it is the canonical map of this server's tools, plugins and a \`recommendedNextAction\`. Follow the recommendation.`,
		'',
		'## Project shape',
		'',
		`- Type: \`${analysis.projectType}\``,
		analysis.framework !== undefined
			? `- Framework: \`${analysis.framework}\``
			: '- Framework: _(none detected)_',
		analysis.monorepoTool !== undefined
			? `- Monorepo tool: \`${analysis.monorepoTool}\``
			: '- Monorepo tool: _(none)_',
		`- Test runner: \`${analysis.testRunner}\``,
		`- Package manager: \`${analysis.packageManager}\``,
		'',
		'## Quality gates',
		'',
		fmtScripts(analysis.scripts),
		'',
		'## When you change the project',
		'',
		`1. Re-run \`${namespacePrefix}_analyze_project\` to refresh the analysis.`,
		`2. If the project grew (new scripts, new framework deps, new monorepo packages), call \`${namespacePrefix}_plan_mcp_project\` to refresh the blueprint and \`${namespacePrefix}_create_project\` to materialise the new tools.`,
		'3. Never invent tool names; only call what `overview` lists.',
	].join('\n');

/** The body of the `fix quality` prompt: concrete commands, not a TODO. */
export const fixQualityPromptBody = (
	analysis: IProjectAnalysis,
	namespacePrefix: string,
): string => {
	const scriptEntries = Object.entries(analysis.scripts);
	if (scriptEntries.length === 0) {
		return [
			'No quality scripts detected in this project.',
			`Call \`${namespacePrefix}_get_validation_matrix\` to see what gates the server can run, and add the missing scripts to \`package.json\` if needed.`,
		].join('\n');
	}
	const lines = [
		'Run the project quality gates in this order and fix what fails:',
	];
	for (const [role, script] of scriptEntries) {
		lines.push(`1. \`${role}\` → \`${script}\``);
	}
	lines.push('');
	lines.push(
		`If a gate is broken because of an external dep (downstream service, network, missing env), record it as \`external-gate-blocker\` with the evidence and continue.`,
	);
	return lines.join('\n');
};

/** The body of the `continue proposal` prompt. */
export const continueProposalPromptBody = (namespacePrefix: string): string =>
	[
		`The \`proposals\` plugin is loaded. Resolve the next proposal slice end-to-end:`,
		'',
		`1. \`${namespacePrefix}_auto_work\` → pick a proposal that is open and unclaimed.`,
		`2. \`${namespacePrefix}_continue_proposal { mode: "plan" }\` to plan the next atomic slice.`,
		`3. \`${namespacePrefix}_agent_lock\` to claim files before editing.`,
		`4. Implement the slice.`,
		`5. \`${namespacePrefix}_close_slice\` with the canonical evidence.`,
		'',
		`On lock conflict: \`lock-conflict\` instead of retrying. On repeated idle: read the proposal cascade with \`${namespacePrefix}_compact_status\`.`,
	].join('\n');

/** The body of the generic `project standards` skill. */
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
			? `- MCP server: PRESENT (evidence: ${fmtList(analysis.mcpEvidence)})`
			: '- MCP server: _not detected_',
		`- CI: ${fmtList(analysis.ci)}`,
		`- Agent configs already in repo: ${fmtList(analysis.agentConfigs)}`,
		'',
		'## Language conventions',
		'',
		...languageHints(analysis).map((h) => `- ${h}`),
		'',
		analysis.framework !== undefined
			? `## ${analysis.framework} conventions\n\n${frameworkHints(
					analysis,
				)
					.map((h) => `- ${h}`)
					.join('\n')}`
			: '',
	].join('\n');

/** The body of a framework-specific skill, when one is scaffolded. */
export const frameworkSkillBody = (analysis: IProjectAnalysis): string => {
	if (analysis.framework === undefined) return '';
	const hints = frameworkHints(analysis);
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
		`- Quality scripts: ${fmtScripts(analysis.scripts)}`,
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

/** The body for the `start` prompt's *description* (not its full body). */
export const blueprintArtifactBody = (
	artifact: IBlueprintArtifact,
	analysis: IProjectAnalysis,
	namespacePrefix: string,
): string => {
	switch (artifact.name) {
		case 'start':
			return startPromptBody(analysis, namespacePrefix);
		case 'fix quality':
			return fixQualityPromptBody(analysis, namespacePrefix);
		case 'continue proposal':
			return continueProposalPromptBody(namespacePrefix);
		default:
			return '';
	}
};
