import type { IBuildProposalDraftInput } from './contracts/interfaces/proposal-draft.interface';
import { kindForCategory } from './analysis.helper';

const yamlQuote = (value: string): string => JSON.stringify(value);

/**
 * Renders a complete, lint-valid proposal document (frontmatter +
 * Goal / why / Slices / acceptance) derived from one issue. The id is
 * allocated by the proposals engine (`allocateNextProposalId`) so the
 * on-disk file stays in lockstep with the shared counter.
 */
export const buildProposalDraft = (input: IBuildProposalDraftInput): string => {
	const kind = kindForCategory(input.analysis.category);
	const lines: string[] = [
		'---',
		`id: ${input.id}`,
		`title: ${yamlQuote(input.title)}`,
		`kind: ${kind}`,
		'status: ready',
		'type: proposal',
		'track: github',
		`date: ${input.date}`,
		'---',
		'',
		`# ${input.id} — ${input.title}`,
		'',
		'## Goal',
		'',
		`Fix the incident reported in ${input.repo}#${input.issueNumber}`,
		`(${input.issueUrl}).`,
		'',
		'## why',
		'',
		`Auto-triaged from a GitHub issue by the internal issues-triage bot.`,
		`Mechanical analysis: ${input.analysis.summary}`,
		'',
		'## Issue body (verbatim)',
		'',
		'```',
		input.body.trim(),
		'```',
		'',
		'## Slices',
		'',
		'- global_gate: type',
		'',
		'### S1 — Reproduce and fix',
		'- **Status**: pending',
		`- **Files**: (to be determined from the issue)`,
		'- **Gate**: type',
		'- acceptance:',
		`  - "The behaviour reported in #${input.issueNumber} is reproduced and fixed."`,
		'  - "A regression spec covers the failure mode."',
		'',
		'### S2 — Validate',
		'- **Status**: pending',
		'- **Files**: (test suite)',
		'- **Gate**: type',
		'- acceptance:',
		'  - "`bun run validate` is green with the fix and the new spec."',
		'',
		'## acceptance',
		'',
		`- Issue #${input.issueNumber} is fixed and validated.`,
		'- A regression spec covers the failure mode.',
		'- `bun run validate` is green.',
	];
	return `${lines.join('\n').trim()}\n`;
};
