/**
 * cross-project-guide.ts — render setup steps as a paste-ready markdown
 * guide (f00030 S2). Pure: `ISetupStep[]` in, markdown string out. Used
 * by both the `setup-github` CLI subcommand and the issues MCP tool so
 * the rendered guidance is identical everywhere.
 */
import type {
	GithubAuthTier,
	IGithubSetupContext,
	ISetupStep,
} from './setup-steps';

const TIER_LABEL: Readonly<Record<GithubAuthTier, string>> = {
	gh: '`gh` CLI (5000 req/h)',
	token: '`GITHUB_TOKEN` (5000 req/h)',
	anon: 'anonymous (60 req/h — authenticate to raise this)',
};

const renderStep = (step: ISetupStep, index: number): string => {
	const heading = `${index + 1}. **${step.title}**${
		step.optional === true ? ' _(optional)_' : ''
	}`;
	const lines = [heading, '', `   ${step.detail}`];
	if (step.command !== undefined) {
		lines.push(
			'',
			'   ```',
			...step.command.split('\n').map((l) => `   ${l}`),
			'   ```',
		);
	}
	return lines.join('\n');
};

/**
 * Render the full guide: a one-line status header (repo + auth tier)
 * followed by the numbered steps.
 */
export const renderCrossProjectGuide = (
	ctx: IGithubSetupContext,
	steps: readonly ISetupStep[],
): string => {
	const repoLine =
		ctx.repo !== null
			? `Repository: \`${ctx.repo}\``
			: 'Repository: _not detected_ — set it explicitly in the config step below.';
	return [
		'# GitHub issues — setup guide',
		'',
		repoLine,
		`Auth tier: ${TIER_LABEL[ctx.tier]}`,
		`Config: \`${ctx.configPath}\`${ctx.configured ? ' (issues already declared)' : ''}`,
		'',
		...steps.map(renderStep).flatMap((block) => [block, '']),
	]
		.join('\n')
		.trimEnd()
		.concat('\n');
};
