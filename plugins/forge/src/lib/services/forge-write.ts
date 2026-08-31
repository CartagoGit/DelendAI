import { readFile as fsReadFile } from 'node:fs/promises';
import { join } from 'node:path';

import { runExternalTool, type IExternalTool } from '@mcp-vertex/core/public';

import type {
	IForgeFailure,
	IForgeProvider,
	IForgeProviderResult,
} from '../contracts/interfaces/forge-read.interface';
import type {
	ICommentPrOptions,
	ICreateIssueOptions,
	ICreateMcpVertexIssueOptions,
	ICreatePrOptions,
	IIssueCreateResult,
	IPrCommentResult,
	IPrCreateResult,
	IForgeWriteExec,
	IPrCommentResultData,
	IPrCreateResultData,
	IIssueCreateResultData,
} from '../contracts/interfaces/forge-write.interface';
import { detectForgeProvider } from './forge';

const GIT_TOOL: IExternalTool = {
	id: 'git',
	bin: 'git',
	installHints: [
		{ manager: 'brew', command: 'brew install git' },
		{ manager: 'apt', command: 'sudo apt install git' },
	],
};

const PROPOSAL_FOLDERS: readonly string[] = [
	'ready',
	'in-progress',
	'review',
	'paused',
	'done/feats',
	'done/audits',
	'done/fixes',
	'done/refactors',
	'done/chores',
	'done/docs',
	'done/plans',
	'done/resumes',
	'retired',
	'blocked',
];

export type IProposalReadFile = (
	path: string,
	encoding: BufferEncoding,
) => Promise<string>;

export interface IBuildPrBodyInput {
	readonly title: string;
	readonly description?: string | undefined;
	readonly proposalId?: string | undefined;
	readonly proposalMarkdown?: string | undefined;
	readonly commits?: readonly string[] | undefined;
}

const trimOrEmpty = (value: unknown): string =>
	typeof value === 'string' ? value.trim() : '';

const toRecord = (value: unknown): Record<string, unknown> | undefined =>
	typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;

const toNumber = (value: unknown): number => {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim() !== '') {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : 0;
	}
	return 0;
};

const parseJsonRecord = (raw: string): Record<string, unknown> | undefined => {
	const trimmed = raw.trim();
	if (trimmed === '') return undefined;
	try {
		return toRecord(JSON.parse(trimmed));
	} catch {
		return undefined;
	}
};

const failure = (reason: string, provider?: IForgeProvider): IForgeFailure => ({
	ok: false,
	...(provider !== undefined ? { provider } : {}),
	error: { reason },
});

const normaliseProposalId = (proposalId: string): string =>
	proposalId.endsWith('.md') ? proposalId.slice(0, -3) : proposalId;

/**
 * x00168 (S5): a proposal id is always a flat filename stem
 * (`x00165` or `x00165-some-slug`) — never a path. Rejecting anything
 * outside that shape (path separators, `.`/`..` segments) closes a
 * real exfiltration channel: `proposalId` used to reach a bare
 * `path.join` with no containment check, and the resulting file
 * content is embedded verbatim into a PR body posted to the real,
 * public origin forge by `createPr`.
 */
const isSafeProposalIdStem = (stem: string): boolean =>
	/^[a-z][a-z0-9-]*$/i.test(stem);

const proposalPathsFor = (
	workspaceRootAbs: string,
	proposalId: string,
): readonly string[] => {
	const stem = normaliseProposalId(proposalId);
	if (!isSafeProposalIdStem(stem)) return [];
	return PROPOSAL_FOLDERS.map((folder) =>
		join(
			workspaceRootAbs,
			'docs',
			'mcp-vertex',
			'proposals',
			folder,
			`${stem}.md`,
		),
	);
};

export const readProposalMarkdown = async (
	workspaceRootAbs: string,
	proposalId: string,
	readFile: IProposalReadFile = fsReadFile,
): Promise<string | undefined> => {
	for (const path of proposalPathsFor(workspaceRootAbs, proposalId)) {
		try {
			return await readFile(path, 'utf8');
		} catch {
			// Try the next lifecycle folder.
		}
	}
	return undefined;
};

const conventionalCommitLines = (commits: readonly string[]): string[] =>
	commits.map((commit) => commit.trim()).filter((commit) => commit !== '');

export const buildPrBody = ({
	title,
	description,
	proposalId,
	proposalMarkdown,
	commits,
}: IBuildPrBodyInput): string => {
	const lines: string[] = [`# ${title.trim()}`];
	const trimmedDescription = trimOrEmpty(description);
	if (trimmedDescription !== '') {
		lines.push('', trimmedDescription);
	}
	if (proposalId !== undefined && trimOrEmpty(proposalMarkdown) !== '') {
		lines.push(
			'',
			`## Linked Proposal`,
			'',
			`Source: ${normaliseProposalId(proposalId)}`,
			'',
			trimOrEmpty(proposalMarkdown),
		);
	}
	const commitLines = conventionalCommitLines(commits ?? []);
	if (commitLines.length > 0) {
		lines.push('', '## Commits', '');
		for (const commit of commitLines) lines.push(`- ${commit}`);
	}
	return `${lines.join('\n').trim()}\n`;
};

const buildCommitRange = (base?: string, head?: string): string | undefined =>
	trimOrEmpty(base) === ''
		? undefined
		: `${trimOrEmpty(base)}..${trimOrEmpty(head) || 'HEAD'}`;

export const listCommitSubjects = async (
	workspaceRootAbs: string,
	base: string | undefined,
	head: string | undefined,
	exec: IForgeWriteExec = runExternalTool,
): Promise<readonly string[]> => {
	const range = buildCommitRange(base, head);
	if (range === undefined) return [];
	const run = await exec({
		tool: GIT_TOOL,
		args: ['log', range, '--no-merges', '--pretty=format:%s'],
		cwd: workspaceRootAbs,
	});
	if (!run.ok) return [];
	return run.stdout
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line !== '');
};

const parseRemotePath = (remoteUrl: string): string | undefined => {
	const sshMatch = /^git@[^:]+:(.+)$/.exec(remoteUrl);
	if (sshMatch?.[1] !== undefined) {
		return sshMatch[1].replace(/\.git$/u, '');
	}
	try {
		return new URL(remoteUrl).pathname
			.replace(/^\//u, '')
			.replace(/\.git$/u, '');
	} catch {
		return undefined;
	}
};

const githubApiArgs = (
	path: string,
	fields: readonly string[],
): readonly string[] => ['api', path, '--method', 'POST', ...fields];

const gitlabApiArgs = (
	path: string,
	fields: readonly string[],
): readonly string[] => ['api', path, '-X', 'POST', ...fields];

const postFailure = (reason: string, provider: IForgeProvider): IForgeFailure =>
	failure(reason, provider);

const runProviderPost = async (
	providerResult: Extract<IForgeProviderResult, { ok: true }>,
	cwd: string,
	githubPath: string,
	githubFields: readonly string[],
	gitlabPath: string,
	gitlabFields: readonly string[],
	exec: IForgeWriteExec,
): Promise<
	| { ok: true; provider: IForgeProvider; payload: Record<string, unknown> }
	| IForgeFailure
> => {
	const run = await exec({
		tool: providerResult.tool,
		args:
			providerResult.provider === 'github'
				? githubApiArgs(githubPath, githubFields)
				: gitlabApiArgs(gitlabPath, gitlabFields),
		cwd,
		maxOutputBytes: 128 * 1024,
	});
	if (!run.ok) {
		return postFailure(
			trimOrEmpty(run.stderr) ||
				`${providerResult.tool.bin} request failed`,
			providerResult.provider,
		);
	}
	const payload = parseJsonRecord(run.stdout || run.stderr);
	return payload === undefined
		? postFailure(
				'Could not parse the forge write response payload.',
				providerResult.provider,
			)
		: { ok: true, provider: providerResult.provider, payload };
};

const repoPathFor = (
	providerResult: Extract<IForgeProviderResult, { ok: true }>,
): string | undefined => parseRemotePath(providerResult.remoteUrl);

const gitlabProjectId = (repoPath: string): string =>
	encodeURIComponent(repoPath);

const MCP_VERTEX_REPOSITORY = 'CartagoGit/mcp-vertex';

const parsePrCreateResult = (
	payload: Record<string, unknown>,
	body: string,
	base?: string,
	head?: string,
): IPrCreateResultData | undefined => {
	const url = trimOrEmpty(payload.url ?? payload.html_url ?? payload.web_url);
	const title = trimOrEmpty(payload.title);
	const number = toNumber(payload.number ?? payload.iid);
	if (url === '' || title === '' || number <= 0) return undefined;
	return {
		number,
		title,
		url,
		body,
		draft:
			payload.draft === true ||
			payload.isDraft === true ||
			payload.work_in_progress === true,
		...(trimOrEmpty(base) !== '' ? { base: trimOrEmpty(base) } : {}),
		...(trimOrEmpty(head) !== '' ? { head: trimOrEmpty(head) } : {}),
	};
};

const parseCommentResult = (
	number: string | number,
	payload: Record<string, unknown>,
	body: string,
): IPrCommentResultData => ({
	number: typeof number === 'number' ? number : toNumber(number),
	body,
	...(trimOrEmpty(payload.url ?? payload.html_url ?? payload.web_url) !== ''
		? {
				url: trimOrEmpty(
					payload.url ?? payload.html_url ?? payload.web_url,
				),
			}
		: {}),
});

const labelNames = (value: unknown): readonly string[] =>
	Array.isArray(value)
		? value
				.map((entry) => {
					if (typeof entry === 'string') return entry.trim();
					const record = toRecord(entry);
					return trimOrEmpty(record?.name ?? record?.title);
				})
				.filter((entry) => entry !== '')
		: [];

const parseIssueCreateResult = (
	payload: Record<string, unknown>,
	body: string,
	labels: readonly string[],
): IIssueCreateResultData | undefined => {
	const url = trimOrEmpty(payload.url ?? payload.html_url ?? payload.web_url);
	const title = trimOrEmpty(payload.title);
	const number = toNumber(payload.number ?? payload.iid);
	if (url === '' || title === '' || number <= 0) return undefined;
	const responseLabels = labelNames(payload.labels);
	return {
		number,
		title,
		url,
		body,
		labels: responseLabels.length > 0 ? responseLabels : labels,
	};
};

export const createPr = async (
	workspaceRootAbs: string,
	options: ICreatePrOptions,
	exec: IForgeWriteExec = runExternalTool,
	readFile: IProposalReadFile = fsReadFile,
): Promise<IPrCreateResult> => {
	if (options.confirm !== true) return failure('confirm: true required');
	const provider = await detectForgeProvider(workspaceRootAbs, exec);
	if (!provider.ok) return provider;
	const repoPath = repoPathFor(provider);
	if (repoPath === undefined) {
		return failure(
			'Could not parse the origin remote repository path.',
			provider.provider,
		);
	}
	const proposalMarkdown =
		options.proposalId !== undefined
			? await readProposalMarkdown(
					workspaceRootAbs,
					options.proposalId,
					readFile,
				)
			: undefined;
	const commits =
		options.commits ??
		(await listCommitSubjects(
			workspaceRootAbs,
			options.base,
			options.head,
			exec,
		));
	const body = buildPrBody({
		title: options.title,
		description: options.body,
		proposalId: options.proposalId,
		proposalMarkdown,
		commits,
	});
	const title = trimOrEmpty(options.title);
	const githubFields = [
		'-f',
		`title=${title}`,
		'-f',
		`body=${body}`,
		...(trimOrEmpty(options.base) !== ''
			? ['-f', `base=${trimOrEmpty(options.base)}`]
			: []),
		...(trimOrEmpty(options.head) !== ''
			? ['-f', `head=${trimOrEmpty(options.head)}`]
			: []),
		...(options.draft === true ? ['-F', 'draft=true'] : []),
	];
	const gitlabTitle =
		options.draft === true && !title.startsWith('Draft: ')
			? `Draft: ${title}`
			: title;
	const gitlabFields = [
		'-F',
		`title=${gitlabTitle}`,
		'-F',
		`description=${body}`,
		...(trimOrEmpty(options.head) !== ''
			? ['-F', `source_branch=${trimOrEmpty(options.head)}`]
			: []),
		...(trimOrEmpty(options.base) !== ''
			? ['-F', `target_branch=${trimOrEmpty(options.base)}`]
			: []),
	];
	const response = await runProviderPost(
		provider,
		workspaceRootAbs,
		`repos/${repoPath}/pulls`,
		githubFields,
		`projects/${gitlabProjectId(repoPath)}/merge_requests`,
		gitlabFields,
		exec,
	);
	if (!response.ok) return response;
	const pr = parsePrCreateResult(
		response.payload,
		body,
		options.base,
		options.head,
	);
	return pr === undefined
		? failure('Could not parse the created PR payload.', response.provider)
		: { ok: true, provider: response.provider, data: { pr } };
};

export const commentOnPr = async (
	workspaceRootAbs: string,
	options: ICommentPrOptions,
	exec: IForgeWriteExec = runExternalTool,
): Promise<IPrCommentResult> => {
	if (options.confirm !== true) return failure('confirm: true required');
	const provider = await detectForgeProvider(workspaceRootAbs, exec);
	if (!provider.ok) return provider;
	const repoPath = repoPathFor(provider);
	if (repoPath === undefined) {
		return failure(
			'Could not parse the origin remote repository path.',
			provider.provider,
		);
	}
	const body = trimOrEmpty(options.body);
	const number = String(options.number);
	const response = await runProviderPost(
		provider,
		workspaceRootAbs,
		`repos/${repoPath}/issues/${number}/comments`,
		['-f', `body=${body}`],
		`projects/${gitlabProjectId(repoPath)}/merge_requests/${number}/notes`,
		['-F', `body=${body}`],
		exec,
	);
	if (!response.ok) return response;
	return {
		ok: true,
		provider: response.provider,
		data: {
			comment: parseCommentResult(options.number, response.payload, body),
		},
	};
};

export const createIssue = async (
	workspaceRootAbs: string,
	options: ICreateIssueOptions,
	exec: IForgeWriteExec = runExternalTool,
): Promise<IIssueCreateResult> => {
	if (options.confirm !== true) return failure('confirm: true required');
	const provider = await detectForgeProvider(workspaceRootAbs, exec);
	if (!provider.ok) return provider;
	const repoPath = repoPathFor(provider);
	if (repoPath === undefined) {
		return failure(
			'Could not parse the origin remote repository path.',
			provider.provider,
		);
	}
	const labels = (options.labels ?? [])
		.map((label) => label.trim())
		.filter((label) => label !== '');
	const body = trimOrEmpty(options.body);
	const response = await runProviderPost(
		provider,
		workspaceRootAbs,
		`repos/${repoPath}/issues`,
		[
			'-f',
			`title=${trimOrEmpty(options.title)}`,
			'-f',
			`body=${body}`,
			...labels.flatMap((label) => ['-f', `labels[]=${label}`]),
		],
		`projects/${gitlabProjectId(repoPath)}/issues`,
		[
			'-F',
			`title=${trimOrEmpty(options.title)}`,
			'-F',
			`description=${body}`,
			...(labels.length > 0 ? ['-F', `labels=${labels.join(',')}`] : []),
		],
		exec,
	);
	if (!response.ok) return response;
	const issue = parseIssueCreateResult(response.payload, body, labels);
	return issue === undefined
		? failure(
				'Could not parse the created issue payload.',
				response.provider,
			)
		: { ok: true, provider: response.provider, data: { issue } };
};

export const createMcpVertexIssue = async (
	_workspaceRootAbs: string,
	options: ICreateMcpVertexIssueOptions,
	exec: IForgeWriteExec = runExternalTool,
): Promise<IIssueCreateResult> => {
	if (options.confirm !== true) return failure('confirm: true required');
	const labels = (options.labels ?? [])
		.map((label) => label.trim())
		.filter((label) => label !== '');
	const body = trimOrEmpty(options.body);
	const run = await exec({
		tool: {
			id: 'gh',
			bin: 'gh',
			installHints: [
				{ manager: 'brew', command: 'brew install gh' },
				{ manager: 'apt', command: 'sudo apt install gh' },
			],
		},
		args: [
			'api',
			`repos/${MCP_VERTEX_REPOSITORY}/issues`,
			'--method',
			'POST',
			'-f',
			`title=${trimOrEmpty(options.title)}`,
			'-f',
			`body=${body}`,
			...labels.flatMap((label) => ['-f', `labels[]=${label}`]),
		],
		cwd: _workspaceRootAbs,
		maxOutputBytes: 128 * 1024,
	});
	if (!run.ok) {
		return failure(
			trimOrEmpty(run.stderr) || 'gh request failed',
			'github',
		);
	}
	const payload = parseJsonRecord(run.stdout || run.stderr);
	if (payload === undefined) {
		return failure(
			'Could not parse the forge write response payload.',
			'github',
		);
	}
	const issue = parseIssueCreateResult(payload, body, labels);
	return issue === undefined
		? failure('Could not parse the created issue payload.', 'github')
		: { ok: true, provider: 'github', data: { issue } };
};
