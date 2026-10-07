// body-content/prompt-bodies: the bodies of the three scaffolded
// prompts (`start`, `fix quality`, `continue proposal`).
//
// SOLID — Single Responsibility. Each function owns ONE prompt
// body. The dispatcher (in `index.ts`) routes by name. New prompts
// are added by writing a new function and a new entry in the
// dispatcher's switch — no need to edit the existing ones.

import type { IProjectAnalysis } from '../analyze-project';
import { formatScripts } from './format-helpers';

/** Body of the `start` prompt: orient the agent in this specific repo. */
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
		formatScripts(analysis.scripts),
		'',
		'## When you change the project',
		'',
		`1. Re-run \`${namespacePrefix}_analyze_project\` to refresh the analysis.`,
		`2. If the project grew (new scripts, new framework deps, new monorepo packages), call \`${namespacePrefix}_plan_mcp_project\` to refresh the blueprint and \`${namespacePrefix}_create_project\` to materialise the new tools.`,
		'3. Never invent tool names; only call what `overview` lists.',
	].join('\n');

/** Body of the `fix quality` prompt: concrete commands, not a TODO. */
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

/** Body of the `continue proposal` prompt. */
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
