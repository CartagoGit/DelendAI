import { runGhCli } from '@delendai/core/public';

import { BOT_REPLY_MARKER } from './contracts/constants/github.constant';
import type {
	ICommentResult,
	IGhExec,
	IGhResult,
	ITriageIssueDetail,
	ITriageIssueSummary,
} from './contracts/interfaces/github.interface';

export const ghExec: IGhExec = async (argv) => runGhCli(argv);

const sliceJson = (raw: string): string => {
	const trimmed = raw.trim();
	const start = trimmed.indexOf('[');
	const objectStart = trimmed.indexOf('{');
	const hasArray = start >= 0;
	const hasObject = objectStart >= 0;
	if (!hasArray && !hasObject) return '';
	const idx =
		hasArray && hasObject
			? Math.min(start, objectStart)
			: hasArray
				? start
				: objectStart;
	const open = trimmed[idx];
	const close = open === '[' ? ']' : '}';
	const end = trimmed.lastIndexOf(close);
	return end >= idx ? trimmed.slice(idx, end + 1) : '';
};

const parseJson = (raw: string): unknown => {
	const json = sliceJson(raw);
	if (json === '') return undefined;
	try {
		return JSON.parse(json);
	} catch {
		return undefined;
	}
};

const asString = (value: unknown): string =>
	typeof value === 'string' ? value : '';

const asNumber = (value: unknown): number => {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim() !== '') {
		const n = Number(value);
		return Number.isFinite(n) ? n : 0;
	}
	return 0;
};

const labelNames = (value: unknown): readonly string[] =>
	Array.isArray(value)
		? value
				.map((entry) => {
					if (typeof entry === 'string') return entry.trim();
					if (typeof entry === 'object' && entry !== null) {
						const record = entry as { name?: unknown };
						return asString(record.name).trim();
					}
					return '';
				})
				.filter((label) => label !== '')
		: [];

export const listOpenIssues = async (
	repo: string,
	exec: IGhExec = ghExec,
): Promise<IGhResult<readonly ITriageIssueSummary[]>> => {
	const run = await exec([
		'issue',
		'list',
		'--repo',
		repo,
		'--state',
		'open',
		'--json',
		'number,title,labels,updatedAt',
	]);
	if (!run.ok) {
		return {
			ok: false,
			reason: run.stderr.trim() || `gh exited ${run.code}`,
		};
	}
	const parsed = parseJson(run.stdout);
	if (!Array.isArray(parsed)) {
		return { ok: false, reason: 'Could not parse gh issue list output.' };
	}
	const data = parsed.map((entry) => {
		const record =
			typeof entry === 'object' && entry !== null
				? (entry as Record<string, unknown>)
				: {};
		return {
			number: asNumber(record.number),
			title: asString(record.title),
			labels: labelNames(record.labels),
			updatedAt: asString(record.updatedAt),
		};
	});
	return { ok: true, data };
};

export const fetchIssue = async (
	repo: string,
	number: number,
	exec: IGhExec = ghExec,
): Promise<IGhResult<ITriageIssueDetail>> => {
	const run = await exec([
		'issue',
		'view',
		String(number),
		'--repo',
		repo,
		'--json',
		'number,title,body,labels,comments',
	]);
	if (!run.ok) {
		return {
			ok: false,
			reason: run.stderr.trim() || `gh exited ${run.code}`,
		};
	}
	const parsed = parseJson(run.stdout);
	if (typeof parsed !== 'object' || parsed === null) {
		return { ok: false, reason: 'Could not parse gh issue view output.' };
	}
	const record = parsed as Record<string, unknown>;
	const comments = Array.isArray(record.comments) ? record.comments : [];
	const hasBotReply = comments.some((entry) => {
		if (typeof entry !== 'object' || entry === null) return false;
		const body = (entry as { body?: unknown }).body;
		return typeof body === 'string' && body.includes(BOT_REPLY_MARKER);
	});
	return {
		ok: true,
		data: {
			number: asNumber(record.number),
			title: asString(record.title),
			body: asString(record.body),
			labels: labelNames(record.labels),
			commentCount: comments.length,
			hasBotReply,
		},
	};
};

export const addComment = async (
	repo: string,
	number: number,
	body: string,
	exec: IGhExec = ghExec,
): Promise<IGhResult<ICommentResult>> => {
	const run = await exec([
		'issue',
		'comment',
		String(number),
		'--repo',
		repo,
		'--body',
		body,
	]);
	if (!run.ok) {
		return {
			ok: false,
			reason: run.stderr.trim() || `gh exited ${run.code}`,
		};
	}
	const urlMatch = /https:\/\/[^\s]+/.exec(run.stdout);
	return {
		ok: true,
		data: {
			number,
			...(urlMatch?.[0] !== undefined ? { url: urlMatch[0] } : {}),
		},
	};
};

export const addLabels = async (
	repo: string,
	number: number,
	labels: readonly string[],
	exec: IGhExec = ghExec,
): Promise<IGhResult<readonly string[]>> => {
	if (labels.length === 0) return { ok: true, data: [] };
	const run = await exec([
		'issue',
		'edit',
		String(number),
		'--repo',
		repo,
		'--add-label',
		labels.join(','),
	]);
	if (!run.ok) {
		return {
			ok: false,
			reason: run.stderr.trim() || `gh exited ${run.code}`,
		};
	}
	return { ok: true, data: labels };
};
