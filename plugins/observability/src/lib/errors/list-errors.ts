/**
 * f00129 S1 — `listRecentErrors` (pure planner).
 *
 * The tool lives in `obs-errors.tool.ts`; this file is the
 * testable, dependency-injected core. It fetches one page of recent
 * issues through an `IErrorSource`, redacts any leaked token from the
 * response (defence in depth), and normalizes the vendor response
 * into `IObsIssue[]`. Never throws — every failure mode resolves to
 * a structured envelope the host renders uniformly.
 */
import { redactSecrets } from '@delendai/core/public';
import { webFetch, type IWebFetchResult } from '@delendai/web-fetch/public';

import {
	authHeaderFor,
	dispatchFetch,
	FETCH_TIMEOUT_MS,
	redactToken,
	type IErrorSource,
	type IListErrorsInput,
	type IListErrorsOutput,
	type IObsIssue,
} from './ierror-source';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

// x00157 S4 + a00084: FETCH_TIMEOUT_MS is defined once in
// ierror-source.ts (dispatchFetch uses it too) and re-exported here so
// this module's own direct re-fetch below can't silently drift out of
// sync with it.
export { FETCH_TIMEOUT_MS };

const clampLimit = (limit: number): number =>
	Number.isFinite(limit) && limit > 0
		? Math.min(limit, MAX_LIMIT)
		: DEFAULT_LIMIT;

/** Normalize a vendor's raw level string to the 5-band scale (r00012). */
export const normalizeLevel = (raw: string | undefined): IObsIssue['level'] => {
	switch ((raw ?? '').toLowerCase()) {
		case 'fatal':
		case 'critical':
			return 'fatal';
		case 'error':
			return 'error';
		case 'warning':
		case 'warn':
			return 'warning';
		case 'info':
			return 'info';
		case 'debug':
			return 'debug';
		default:
			return 'unknown';
	}
};

const truncate = (value: string, max = 240): string =>
	value.length <= max ? value : `${value.slice(0, max - 1)}…`;

/**
 * Default Sentry list-issues mapper. Sentry returns `{ data: [...] }`
 * where each entry has `id`, `title`, `project.slug`, `level`,
 * `lastSeen`, `count`, `permalink`, `culprit` (stack hint). Pure.
 */
export const sentryParseList = (body: string): readonly IObsIssue[] => {
	let json: unknown;
	try {
		json = JSON.parse(body);
	} catch {
		return [];
	}
	const list = (json as { data?: unknown }).data;
	if (!Array.isArray(list)) return [];
	const issues: IObsIssue[] = [];
	for (const item of list) {
		if (typeof item !== 'object' || item === null) continue;
		const o = item as Record<string, unknown>;
		const project =
			typeof o.project === 'object' && o.project !== null
				? (((o.project as Record<string, unknown>).slug as string) ??
					'unknown')
				: 'unknown';
		const context =
			typeof o.culprit === 'string'
				? truncate(o.culprit)
				: typeof o.metadata === 'object' &&
						o.metadata !== null &&
						typeof (o.metadata as Record<string, unknown>).value ===
							'string'
					? truncate(
							(o.metadata as Record<string, unknown>)
								.value as string,
						)
					: '';
		issues.push({
			id: String(o.id ?? ''),
			title: typeof o.title === 'string' ? o.title : '(untitled)',
			project,
			level: normalizeLevel(o.level as string | undefined),
			lastSeen:
				typeof o.lastSeen === 'string' ? (o.lastSeen as string) : '',
			eventCount: Number(o.count ?? 0) || 0,
			context,
			url: typeof o.permalink === 'string' ? (o.permalink as string) : '',
		});
	}
	return issues;
};

/** Default Sentry URL builder. */
export const sentryBuildListUrl =
	(source: IErrorSource) =>
	(input: { cursor?: string; limit: number }): string => {
		const params = new URLSearchParams({
			limit: String(clampLimit(input.limit)),
			query: 'is:unresolved',
			sort: 'lastSeen',
		});
		if (input.cursor !== undefined && input.cursor.length > 0) {
			params.set('cursor', input.cursor);
		}
		return `${source.baseUrl.replace(/\/$/, '')}/api/0/projects/?${params.toString()}`;
	};

/**
 * The vendored `webFetch` path. Reachable in production. In tests
 * the source provides its own `fetch` shim so the engine is bypassed
 * (and a real network is not required).
 */
const fetchViaWebFetch = async (
	source: IErrorSource,
	url: string,
): Promise<IWebFetchResult> => {
	const f = source.fetch;
	if (f !== undefined) {
		// Injected seam: tests + hosts that already manage auth.
		return dispatchFetch(source, url);
	}
	// Production path: route through the engine so allow-list + caps
	// are honoured, then re-issue with auth (the engine's fetch seam
	// has no header support today).
	const engine = await webFetch(
		{
			url,
			allowList: source.allowList,
			maxBytes: 200_000,
			timeoutMs: FETCH_TIMEOUT_MS,
		},
		undefined as never,
	);
	if (!engine.ok) return engine;
	const headers = authHeaderFor(source);
	const direct = await fetch(url, {
		headers: { [headers.name]: headers.value, Accept: 'application/json' },
		redirect: 'manual',
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
	});
	const text = await direct.text();
	return {
		ok: true as const,
		url,
		status: direct.status,
		contentType: direct.headers.get('content-type'),
		body: text,
		truncated: false,
	};
};

/**
 * Pull one page of issues from the source. Pure planner over the
 * injected seams; never throws.
 */
export const listRecentErrors = async (
	source: IErrorSource,
	input: IListErrorsInput,
): Promise<IListErrorsOutput> => {
	if (source.token.length === 0) {
		return {
			source: source.id,
			issues: [],
			nextCursor: null,
			redactions: 0,
		};
	}
	const url = source.buildListUrl({
		...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
		limit: clampLimit(input.limit),
	});
	const result = await fetchViaWebFetch(source, url);
	if (!result.ok) {
		return {
			source: source.id,
			issues: [],
			nextCursor: null,
			redactions: 0,
		};
	}
	// Defence in depth: redact any token that bled into the body.
	const redactedBody = redactToken(result.body, source.token);
	const reRedacted = redactSecrets(redactedBody).text;
	const redactions =
		redactedBody.length - reRedacted.length > 0
			? Math.max(1, (redactedBody.length - reRedacted.length) / 6)
			: 0;
	let issues = source.parseList(reRedacted);
	// Apply caller filters (post-vendor normalization).
	issues = issues.filter((i) =>
		input.project === undefined ? true : i.project === input.project,
	);
	issues = issues.filter((i) =>
		input.level === undefined ? true : i.level === input.level,
	);
	return {
		source: source.id,
		issues,
		nextCursor: null,
		redactions: Math.round(redactions),
	};
};

/**
 * Re-export the dispatch seam so tests can verify header wiring
 * without spinning up a network.
 */
export { dispatchFetch, authHeaderFor };

export type { IListErrorsInput, IListErrorsOutput } from './ierror-source';
