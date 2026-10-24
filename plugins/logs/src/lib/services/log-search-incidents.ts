/**
 * log-search-incidents.ts — f00153 S2 + S3.
 *
 * Two pure services used by the `logs_search` and `logs_incidents` tools:
 *
 * - `logSearch(store, options)` — full-text / regex scan over `summary`,
 *   `meta.error.message`, `meta.error.stack`, `meta.args` and
 *   `meta.result`. Returns the matched events with `matched` and
 *   `hasMore` pagination metadata.
 *
 * - `logIncidents(store, options)` — cluster failing events
 *   (errors-stream only) by `(toolName, hash(error.message))` and
 *   return clusters with `count`, `distinctAgents`, `firstSeen`,
 *   `lastSeen`, `sampleSummary`, `sampleError` and `recentEvents[]`.
 *
 * Both services are pure over the existing `ILogStore` (they never
 * touch the filesystem directly) so they can be exercised by the
 * test fixtures without extra mocks.
 */

import { createHash } from 'node:crypto';

import { isErrorOutcome } from './normalize-event';
import type { ILogEvent } from './normalize-event';
import type { ILogRangeFilter, ILogStore } from './log-store';

export interface ILogSearchOptions {
	/** Required: text or regex pattern. */
	readonly pattern: string;
	/** Default false. */
	readonly caseSensitive?: boolean | undefined;
	/** Default false (substring). When true, `pattern` is a PCRE/JS regex. */
	readonly isRegex?: boolean | undefined;
	/**
	 * Default `'all'`. Narrows the search surface to one of:
	 *   - `summary`   → event.summary only
	 *   - `error`     → meta.error.message + meta.error.stack
	 *   - `args`      → meta.args
	 *   - `result`    → meta.result
	 *   - `all`       → every field above (concatenated, newline-joined)
	 */
	readonly scope?:
		| 'summary'
		| 'error'
		| 'args'
		| 'result'
		| 'all'
		| undefined;
	readonly limit?: number | undefined;
	readonly since?: string | undefined;
	readonly until?: string | undefined;
}

export interface ILogSearchResult {
	readonly events: readonly ILogEvent[];
	readonly matched: number;
	readonly hasMore: boolean;
}

const collectStrings = (value: unknown, out: string[]): void => {
	if (value === null || value === undefined) return;
	if (typeof value === 'string') {
		out.push(value);
		return;
	}
	if (typeof value === 'number' || typeof value === 'boolean') {
		out.push(String(value));
		return;
	}
	if (Array.isArray(value)) {
		for (const entry of value) collectStrings(entry, out);
		return;
	}
	if (typeof value === 'object') {
		for (const entry of Object.values(value as Record<string, unknown>)) {
			collectStrings(entry, out);
		}
	}
};

const fieldForScope = (
	event: ILogEvent,
	scope: ILogSearchOptions['scope'],
): string => {
	const meta = event.meta;
	switch (scope) {
		case 'summary': {
			return event.summary;
		}
		case 'error': {
			const err = meta.error;
			const parts: string[] = [];
			if (err && typeof err === 'object') {
				const errObj = err as Record<string, unknown>;
				if (typeof errObj.message === 'string')
					parts.push(errObj.message);
				if (typeof errObj.stack === 'string') parts.push(errObj.stack);
			} else if (typeof err === 'string') {
				parts.push(err);
			}
			return parts.join('\n');
		}
		case 'args': {
			const parts: string[] = [];
			collectStrings(meta.args, parts);
			return parts.join('\n');
		}
		case 'result': {
			const parts: string[] = [];
			collectStrings(meta.result, parts);
			return parts.join('\n');
		}
		case 'all': {
			const parts: string[] = [event.summary];
			collectStrings(meta.error, parts);
			collectStrings(meta.args, parts);
			collectStrings(meta.result, parts);
			return parts.join('\n');
		}
	}
	return '';
};

export const logSearch = async (
	store: ILogStore,
	options: ILogSearchOptions,
): Promise<ILogSearchResult> => {
	const scope = options.scope ?? 'all';
	const limit = Math.max(1, Math.min(options.limit ?? 100, 1000));
	const compiled: RegExp | null = options.isRegex
		? (() => {
				try {
					return new RegExp(
						options.pattern,
						options.caseSensitive ? '' : 'i',
					);
				} catch {
					throw new Error(
						`invalid regex: ${options.pattern.slice(0, 200)}`,
					);
				}
			})()
		: null;
	const substring = options.isRegex ? null : options.pattern;
	const haystackNormalize = (text: string): string =>
		options.caseSensitive ? text : text.toLowerCase();
	const needle = substring ? haystackNormalize(options.pattern) : '';
	const filter: ILogRangeFilter = {
		...(options.since !== undefined ? { since: options.since } : {}),
		...(options.until !== undefined ? { until: options.until } : {}),
	};
	const events = await store.readRange(filter);
	const matches: ILogEvent[] = [];
	for (const event of events) {
		const haystack = haystackNormalize(fieldForScope(event, scope));
		const isMatch = compiled
			? compiled.test(fieldForScope(event, scope))
			: haystack.includes(needle);
		if (isMatch) matches.push(event);
	}
	const page = matches.slice(0, limit);
	return {
		events: page,
		matched: matches.length,
		hasMore: matches.length > page.length,
	};
};

export interface ILogIncident {
	readonly incidentType: string;
	readonly toolName: string;
	readonly errorFingerprint?: string;
	readonly sampleError: string;
	readonly hasStack: boolean;
	readonly count: number;
	readonly distinctAgents: number;
	readonly firstSeen: string;
	readonly lastSeen: string;
	readonly sampleSummary: string;
	readonly recentEvents: readonly ILogEvent[];
}

export interface ILogIncidentsOptions {
	readonly since?: string | undefined;
	readonly until?: string | undefined;
	/** Default 2 — drop singleton clusters. */
	readonly minCount?: number | undefined;
	/** Optional agent filter applied before clustering. */
	readonly agent?: string | undefined;
	/** Max recent events kept per cluster. Default 5. */
	readonly recentLimit?: number | undefined;
}

export interface ILogIncidentsResult {
	readonly incidents: readonly ILogIncident[];
	readonly totalIncidents: number;
}

const messageOfEvent = (event: ILogEvent): string => {
	const err = event.meta.error;
	if (err && typeof err === 'object') {
		const errObj = err as Record<string, unknown>;
		if (typeof errObj.message === 'string') return errObj.message;
	}
	if (typeof err === 'string') return err;
	return event.summary;
};

const toolNameOfEvent = (event: ILogEvent): string => {
	const metaTool = event.meta.toolName;
	if (typeof metaTool === 'string' && metaTool.length > 0) return metaTool;
	return event.taskId ?? event.kind;
};

const hasStackOfEvent = (event: ILogEvent): boolean => {
	const error = event.meta.error;
	if (!error || typeof error !== 'object') return false;
	return typeof (error as Record<string, unknown>).stack === 'string';
};

const sha1 = (input: string): string =>
	createHash('sha1').update(input).digest('hex').slice(0, 16);

const compareIso = (a: string, b: string): number =>
	new Date(a).getTime() - new Date(b).getTime();

export const logIncidents = async (
	store: ILogStore,
	options: ILogIncidentsOptions = {},
): Promise<ILogIncidentsResult> => {
	const minCount = Math.max(1, options.minCount ?? 2);
	const recentLimit = Math.max(0, options.recentLimit ?? 5);
	const filter: ILogRangeFilter = {
		...(options.since !== undefined ? { since: options.since } : {}),
		...(options.until !== undefined ? { until: options.until } : {}),
		...(options.agent !== undefined ? { agent: options.agent } : {}),
	};
	const events = await store.readRange(filter);
	const failing = events.filter((event) => isErrorOutcome(event.outcome));
	// Cluster deterministically: same (toolName, error.message hash) collapse
	// into one cluster. We use a sha1-prefixed key (16 hex chars) so cluster
	// ids are stable across processes — the operator can grep the cache
	// directly if they want raw events.
	type Cluster = {
		toolName: string;
		messageHash: string;
		incidentType: string;
		events: ILogEvent[];
		agents: Set<string>;
		hasStack: boolean;
		firstSeen: string;
		lastSeen: string;
		sampleSummary: string;
	};
	const clusters = new Map<string, Cluster>();
	for (const event of failing) {
		const toolName = toolNameOfEvent(event);
		const message = messageOfEvent(event);
		const messageHash = sha1(`${toolName}|${message}`);
		const key = `${toolName}|${messageHash}`;
		const existing = clusters.get(key);
		if (existing) {
			existing.events.push(event);
			if (event.agent) existing.agents.add(event.agent);
			existing.hasStack ||= hasStackOfEvent(event);
			if (compareIso(event.ts, existing.firstSeen) < 0)
				existing.firstSeen = event.ts;
			if (compareIso(event.ts, existing.lastSeen) > 0)
				existing.lastSeen = event.ts;
		} else {
			clusters.set(key, {
				toolName,
				messageHash,
				incidentType: event.incidentType ?? 'unknown',
				events: [event],
				agents: new Set(event.agent ? [event.agent] : []),
				hasStack: hasStackOfEvent(event),
				firstSeen: event.ts,
				lastSeen: event.ts,
				sampleSummary: event.summary,
			});
		}
	}
	const incidents: ILogIncident[] = [];
	for (const cluster of clusters.values()) {
		if (cluster.events.length < minCount) continue;
		// sort events ascending for stable recent slice
		const sorted = [...cluster.events].sort((a, b) =>
			compareIso(a.ts, b.ts),
		);
		const recent = sorted.slice(-recentLimit);
		incidents.push({
			incidentType: cluster.incidentType,
			toolName: cluster.toolName,
			errorFingerprint: cluster.messageHash,
			sampleError: `redacted:${cluster.messageHash}`,
			hasStack: cluster.hasStack,
			count: cluster.events.length,
			distinctAgents: cluster.agents.size,
			firstSeen: cluster.firstSeen,
			lastSeen: cluster.lastSeen,
			sampleSummary: cluster.sampleSummary,
			recentEvents: recent,
		});
	}
	// Sort: highest count first, then earliest firstSeen (older problem wins)
	incidents.sort((a, b) => {
		if (b.count !== a.count) return b.count - a.count;
		return compareIso(a.firstSeen, b.firstSeen);
	});
	return {
		incidents,
		totalIncidents: incidents.length,
	};
};
