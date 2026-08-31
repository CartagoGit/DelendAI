import { runExternalTool } from '@mcp-vertex/core/public';

import type {
	IForgeFailure,
	IForgeProvider,
} from '../contracts/interfaces/forge-read.interface';
import type {
	IForgeReleaseExec,
	IForgeReleaseOptions,
	IForgeReleaseResult,
} from '../contracts/interfaces/forge-release.interface';
import { runForge } from './forge';

/**
 * `gh release view --json id,...` returns `id`/`databaseId` as numbers, not
 * strings — treating anything non-string as "missing" made every real
 * GitHub release response fail to parse, even on success.
 */
const trimOrEmpty = (value: unknown, fallback = ''): string => {
	if (typeof value === 'string') return value.trim();
	if (typeof value === 'number') return String(value);
	return fallback;
};

const toRecord = (value: unknown): Record<string, unknown> | undefined =>
	typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;

const parseJsonRecord = (raw: string): Record<string, unknown> | undefined => {
	const trimmed = raw.trim();
	if (trimmed === '') return undefined;
	try {
		return toRecord(JSON.parse(trimmed));
	} catch {
		return undefined;
	}
};

const toBool = (value: unknown): boolean => value === true;

const failure = (reason: string, provider?: IForgeProvider): IForgeFailure => ({
	ok: false,
	...(provider !== undefined ? { provider } : {}),
	error: { reason },
});

const parseReleasePayload = (
	provider: IForgeProvider,
	tag: string,
	payload: Record<string, unknown>,
): IForgeReleaseResult => {
	const links = toRecord(payload._links);
	const url = trimOrEmpty(
		payload.url ??
			payload.htmlUrl ??
			payload.html_url ??
			payload.web_url ??
			links?.self,
	);
	const id = trimOrEmpty(
		payload.id ??
			payload.databaseId ??
			payload.tagName ??
			payload.tag_name ??
			tag,
	);
	const name = trimOrEmpty(
		payload.name ?? payload.tagName ?? payload.tag_name ?? tag,
	);
	const resolvedTag = trimOrEmpty(payload.tagName ?? payload.tag_name ?? tag);
	if (url === '' || id === '' || name === '' || resolvedTag === '') {
		return failure(
			'Could not parse the forge release response payload.',
			provider,
		);
	}
	return {
		ok: true,
		provider,
		url,
		id,
		name,
		tag: resolvedTag,
		draft: toBool(payload.isDraft ?? payload.draft),
		prerelease: toBool(payload.isPrerelease ?? payload.prerelease),
	};
};

export const createRelease = async (
	cwd: string,
	options: IForgeReleaseOptions,
	exec: IForgeReleaseExec = runExternalTool,
): Promise<IForgeReleaseResult> => {
	if (options.confirm !== true) {
		return failure('confirm: true required');
	}
	const tag = trimOrEmpty(options.tag);
	if (tag === '') return failure('tag is required');
	const notes = trimOrEmpty(options.notes);
	const notesFromFile = trimOrEmpty(options.notesFile);
	const target = trimOrEmpty(options.target);
	if (notes !== '' && notesFromFile !== '') {
		return failure(
			'notes and notesFile are mutually exclusive (pass only one)',
		);
	}
	const draftFlag = options.draft === true;
	const prereleaseFlag = options.prerelease === true;
	const createRun = await runForge(
		cwd,
		{
			github: [
				'release',
				'create',
				tag,
				...(notes !== '' ? ['--notes', notes] : []),
				...(notesFromFile !== ''
					? ['--notes-file', notesFromFile]
					: []),
				...(target !== '' ? ['--target', target] : []),
				...(draftFlag ? ['--draft'] : []),
				...(prereleaseFlag ? ['--prerelease'] : []),
			],
			gitlab: [
				'release',
				'create',
				tag,
				...(notes !== '' ? ['--notes', notes] : []),
				...(notesFromFile !== ''
					? ['--notes-file', notesFromFile]
					: []),
			],
		},
		exec,
	);
	if (!createRun.ok) return createRun;
	const viewRun = await runForge(
		cwd,
		{
			github: [
				'release',
				'view',
				tag,
				'--json',
				'url,id,name,tagName,isDraft,isPrerelease',
			],
			gitlab: ['release', 'view', tag, '--output', 'json'],
		},
		exec,
	);
	if (!viewRun.ok) return viewRun;
	const payload = parseJsonRecord(viewRun.stdout || viewRun.stderr);
	return payload === undefined
		? failure(
				'Could not parse the forge release response payload.',
				viewRun.provider,
			)
		: parseReleasePayload(viewRun.provider, tag, payload);
};
