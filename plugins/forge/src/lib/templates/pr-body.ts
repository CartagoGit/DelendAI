export interface IPrBodyCommit {
	readonly sha: string;
	readonly subject: string;
}

export interface IRenderPrBodyInput {
	readonly title: string;
	readonly body?: string | undefined;
	readonly proposalId?: string | undefined;
	readonly branch?: string | undefined;
	readonly base?: string | undefined;
	readonly commits: readonly IPrBodyCommit[];
}

const GENERIC_BRANCH_TOKENS = new Set([
	'agent',
	'copilot',
	'claude',
	'codex',
	'cursor',
	'aider',
	'continue',
	'openai',
	'anthropic',
	'minimax',
	'gemini',
	'gpt',
	'sonnet',
	'opus',
	'flash',
	'pro',
	'thinking',
	'm1',
	'm2',
	'm3',
	'm4',
	's1',
	's2',
	's3',
	'feat',
	'feature',
	'fix',
	'bugfix',
	'hotfix',
	'chore',
	'docs',
	'doc',
	'refactor',
	'task',
]);

const inferConventionalKind = (
	proposalId: string | undefined,
	branch: string | undefined,
): 'feat' | 'fix' | 'chore' => {
	const proposalPrefix = proposalId?.trim().toLowerCase().charAt(0);
	if (proposalPrefix === 'x') return 'fix';
	if (
		proposalPrefix === 'c' ||
		proposalPrefix === 'd' ||
		proposalPrefix === 'r'
	) {
		return 'chore';
	}
	if (proposalPrefix === 'f') return 'feat';
	const lowerBranch = branch?.trim().toLowerCase() ?? '';
	if (/^(fix|bugfix|hotfix)(\/|-|$)/u.test(lowerBranch)) return 'fix';
	if (/^(chore|docs|refactor)(\/|-|$)/u.test(lowerBranch)) return 'chore';
	return 'feat';
};

const inferScope = (
	proposalId: string | undefined,
	branch: string | undefined,
): string | undefined => {
	const branchTokens = (branch ?? '')
		.toLowerCase()
		.split(/[/_\-.]+/u)
		.map((token) => token.trim())
		.filter((token) => token.length > 0)
		.filter((token) => !GENERIC_BRANCH_TOKENS.has(token))
		.filter((token) => token !== proposalId?.toLowerCase())
		.filter((token) => !/^[a-z]\d{5}$/u.test(token));
	const scope = branchTokens[0];
	return scope?.replace(/[^a-z0-9-]/gu, '');
};

export const renderPrSubject = (
	title: string,
	proposalId?: string,
	branch?: string,
): string => {
	const kind = inferConventionalKind(proposalId, branch);
	const scope = inferScope(proposalId, branch);
	const trimmedTitle = title.trim();
	return scope
		? `${kind}(${scope}): ${trimmedTitle}`
		: `${kind}: ${trimmedTitle}`;
};

export const renderPrBody = (input: IRenderPrBodyInput): string => {
	const sections: string[] = [
		renderPrSubject(input.title, input.proposalId, input.branch),
		'',
		'## Summary',
		input.body?.trim() || 'No additional context provided.',
		'',
		'## Context',
		`- Branch: ${input.branch?.trim() || 'unknown'}`,
		`- Base: ${input.base?.trim() || 'unknown'}`,
		`- Proposal: ${input.proposalId?.trim() || 'none linked'}`,
	];
	if (input.commits.length > 0) {
		sections.push('', '## Commits');
		for (const commit of input.commits) {
			sections.push(
				`- ${commit.sha.slice(0, 7)} ${commit.subject.trim()}`,
			);
		}
	}
	return `${sections.join('\n').trim()}\n`;
};
