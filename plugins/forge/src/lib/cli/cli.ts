import type { IForgeProvider } from '../detect';

export interface IListCommandOptions {
	readonly limit?: number | undefined;
	readonly state?: 'open' | 'closed' | 'all' | undefined;
	readonly headSha?: string | undefined;
}

export const buildPrListCommand = (
	provider: IForgeProvider,
	options: IListCommandOptions = {},
): readonly string[] => {
	if (provider === 'gitlab') {
		return [
			'glab',
			'mr',
			'list',
			'--output',
			'json',
			...(options.limit !== undefined
				? ['--per-page', String(options.limit)]
				: []),
			...(options.state !== undefined && options.state !== 'all'
				? ['--state', options.state]
				: []),
		] as const;
	}
	return [
		'gh',
		'pr',
		'list',
		'--json',
		'number,title,author,headRefName,baseRefName,url,state,isDraft,createdAt,updatedAt,labels',
		...(options.limit !== undefined
			? ['--limit', String(options.limit)]
			: []),
		...(options.state !== undefined && options.state !== 'all'
			? ['--state', options.state]
			: []),
	] as const;
};

export const buildPrShowCommand = (
	provider: IForgeProvider,
	number: number,
): readonly string[] => {
	if (provider === 'gitlab') {
		return [
			'glab',
			'mr',
			'view',
			String(number),
			'--output',
			'json',
		] as const;
	}
	return [
		'gh',
		'pr',
		'view',
		String(number),
		'--json',
		'number,title,body,author,headRefName,baseRefName,state,url,additions,deletions,changedFiles,reviewDecision,commits,comments,labels,statusCheckRollup',
	] as const;
};

export const buildCiRunsCommand = (
	provider: IForgeProvider,
	options: IListCommandOptions = {},
): readonly string[] => {
	if (provider === 'gitlab') {
		return [
			'glab',
			'ci',
			'list',
			'--output',
			'json',
			...(options.limit !== undefined
				? ['--per-page', String(options.limit)]
				: []),
		] as const;
	}
	return [
		'gh',
		'run',
		'list',
		'--json',
		'databaseId,headSha,name,status,conclusion,url,workflowName,createdAt,updatedAt',
		...(options.limit !== undefined
			? ['--limit', String(options.limit)]
			: []),
		...(options.headSha !== undefined ? ['--commit', options.headSha] : []),
	] as const;
};

export const buildCiJobsCommand = (
	provider: IForgeProvider,
	runId: string | number,
): readonly string[] => {
	if (provider === 'gitlab') {
		return [
			'glab',
			'ci',
			'view',
			String(runId),
			'--output',
			'json',
		] as const;
	}
	return ['gh', 'run', 'view', String(runId), '--json', 'jobs,url'] as const;
};

export const buildIssueListCommand = (
	provider: IForgeProvider,
	options: IListCommandOptions = {},
): readonly string[] => {
	if (provider === 'gitlab') {
		return [
			'glab',
			'issue',
			'list',
			'--output',
			'json',
			...(options.limit !== undefined
				? ['--per-page', String(options.limit)]
				: []),
			...(options.state !== undefined && options.state !== 'all'
				? ['--state', options.state]
				: []),
		] as const;
	}
	return [
		'gh',
		'issue',
		'list',
		'--json',
		'number,title,state,author,labels,url,createdAt,updatedAt',
		...(options.limit !== undefined
			? ['--limit', String(options.limit)]
			: []),
		...(options.state !== undefined && options.state !== 'all'
			? ['--state', options.state]
			: []),
	] as const;
};

export const buildIssueShowCommand = (
	provider: IForgeProvider,
	number: number,
): readonly string[] => {
	if (provider === 'gitlab') {
		return [
			'glab',
			'issue',
			'view',
			String(number),
			'--output',
			'json',
		] as const;
	}
	return [
		'gh',
		'issue',
		'view',
		String(number),
		'--json',
		'number,title,body,state,author,labels,comments,url,createdAt,updatedAt',
	] as const;
};
