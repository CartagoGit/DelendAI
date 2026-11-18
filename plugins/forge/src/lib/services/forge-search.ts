import { runExternalTool } from '@delendai/core/public';

import type {
	IForgeFailure,
	IForgeProvider,
} from '../contracts/interfaces/forge-read.interface';
import type {
	IForgeCodeSearchHit,
	IForgeSearchCodeOptions,
	IForgeSearchCodeResult,
	IForgeSearchExec,
} from '../contracts/interfaces/forge-search.interface';
import { runForge } from './forge';

const trimOrEmpty = (value: unknown, fallback = ''): string =>
	typeof value === 'string' ? value.trim() : fallback;

const toRecord = (value: unknown): Record<string, unknown> | undefined =>
	typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;

const toRecordArray = (value: unknown): readonly Record<string, unknown>[] =>
	Array.isArray(value)
		? value
				.map((entry) => toRecord(entry))
				.filter(
					(entry): entry is Record<string, unknown> =>
						entry !== undefined,
				)
		: [];

const parseJson = (raw: string): unknown => {
	const trimmed = raw.trim();
	if (trimmed === '') return undefined;
	try {
		return JSON.parse(trimmed);
	} catch {
		return undefined;
	}
};

const failure = (reason: string, provider?: IForgeProvider): IForgeFailure => ({
	ok: false,
	...(provider !== undefined ? { provider } : {}),
	error: { reason },
});

const buildQualifiedQuery = (
	provider: IForgeProvider,
	options: IForgeSearchCodeOptions,
): string => {
	const parts = [options.query.trim()];
	if (trimOrEmpty(options.language) !== '') {
		parts.push(`language:${trimOrEmpty(options.language)}`);
	}
	if (trimOrEmpty(options.repo) !== '') {
		parts.push(
			provider === 'github'
				? `repo:${trimOrEmpty(options.repo)}`
				: `project:${trimOrEmpty(options.repo)}`,
		);
	}
	return parts.join(' ').trim();
};

const repositoryName = (value: unknown): string => {
	const record = toRecord(value);
	if (record === undefined) return '';
	return trimOrEmpty(
		record.fullName ??
			record.full_name ??
			record.nameWithOwner ??
			record.path_with_namespace ??
			record.fullPath ??
			record.name,
	);
};

const fragmentText = (value: unknown): string => {
	if (typeof value === 'string') return value.trim();
	const record = toRecord(value);
	if (record === undefined) return '';
	const matches = toRecordArray(record.matches);
	if (matches.length > 0) {
		return trimOrEmpty(
			matches[0]?.text ?? matches[0]?.fragment ?? matches[0]?.line,
		);
	}
	return trimOrEmpty(record.fragment ?? record.text ?? record.data);
};

const parseGithubHits = (raw: string): readonly IForgeCodeSearchHit[] =>
	toRecordArray(parseJson(raw)).map((entry) => {
		const repo = toRecord(entry.repository);
		const fragment =
			fragmentText(toRecordArray(entry.textMatches)[0]) ||
			fragmentText(entry.textMatches);
		return {
			path: trimOrEmpty(entry.path),
			repository: repositoryName(repo),
			fragment,
		};
	});

const parseGitlabHits = (raw: string): readonly IForgeCodeSearchHit[] =>
	toRecordArray(parseJson(raw)).map((entry) => ({
		path: trimOrEmpty(entry.path ?? entry.filename),
		repository:
			repositoryName(entry.project ?? entry.repository) ||
			trimOrEmpty(entry.path_with_namespace ?? entry.project_path),
		fragment: fragmentText(entry),
	}));

export const searchCode = async (
	cwd: string,
	options: IForgeSearchCodeOptions,
	exec: IForgeSearchExec = runExternalTool,
): Promise<IForgeSearchCodeResult> => {
	const query = trimOrEmpty(options.query);
	if (query === '') return failure('query is required');
	const limit = options.limit ?? 10;
	const githubQuery = buildQualifiedQuery('github', options);
	const gitlabQuery = buildQualifiedQuery('gitlab', options);
	const run = await runForge(
		cwd,
		{
			github: [
				'search',
				'code',
				githubQuery,
				'--limit',
				String(limit),
				'--json',
				'path,repository,url,sha,textMatches',
			],
			gitlab: [
				'search',
				'code',
				gitlabQuery,
				'--scope',
				'blobs',
				'--page',
				'1',
				'--per-page',
				String(limit),
				'--output',
				'json',
			],
		},
		exec,
	);
	if (!run.ok) return run;
	const raw = run.stdout || run.stderr;
	const hits =
		run.provider === 'github' ? parseGithubHits(raw) : parseGitlabHits(raw);
	return {
		ok: true,
		provider: run.provider,
		hits: hits.filter(
			(hit) =>
				hit.path !== '' && hit.repository !== '' && hit.fragment !== '',
		),
	};
};
