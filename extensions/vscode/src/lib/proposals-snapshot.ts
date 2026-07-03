/**
 * proposals-snapshot.ts — f00097 S2 data layer (read-only, host-agnostic).
 *
 * The single place that turns the proposals plugin's **read-only** tools into
 * one projected, cached snapshot for the sidebar board (S2), the detail
 * webview (S3) and the web-parity route (S5). It:
 *
 *  - calls ONLY the whitelisted read-only tools (S1's `READ_ONLY_TOOLS`),
 *    each qualified with the host prefix via `formatToolName`, so a renamed
 *    `--prefix` never breaks the call sites;
 *  - projects tool output **tolerantly** — unknown fields pass through, a
 *    malformed board payload degrades to an empty list plus a `recoverable`
 *    banner instead of throwing (the proposal's "`safeParse`, never names"
 *    contract; the extension has no zod dependency, so the guards are
 *    hand-rolled, matching `render-output-schema.ts`);
 *  - caches the projection with a TTL (default 30 s) so focus refreshes and
 *    filter changes never refetch; `invalidate()` forces the next `get()` to
 *    refetch.
 *
 * No `vscode` import lives here on purpose: the module is pure enough to unit
 * test with a fake `client` and an injected clock.
 */
import { type McpStdioClient, formatToolName } from '@mcp-vertex/client';

import {
	type READ_ONLY_TOOLS,
	isReadOnlyProposalTool,
} from '../views/proposals-board-view';

/** One proposal row as projected from `proposal_board`. */
export interface IProposalSliceSummary {
	readonly sliceId: string;
	readonly status: string;
	readonly owner: string | null;
}

export interface IProposalSummary {
	readonly id: string;
	readonly status: string;
	readonly slices: readonly IProposalSliceSummary[];
	readonly claimableSliceIds: readonly string[];
}

/** The four non-collapsible header chips shown above the status groups. */
export interface IProposalsHeaderChips {
	readonly locks: number;
	readonly stale: number;
	readonly queueBackpressure: boolean;
	readonly health: 'ok' | 'warn' | 'crit' | 'unknown';
}

/** A tolerated projection failure, surfaced as a banner (never a crash). */
export interface IRecoverable {
	readonly message: string;
	/** Raw offending payload, JSON-stringified, for the "Copy error" action. */
	readonly raw: string;
}

export interface IProposalsSnapshot {
	readonly proposals: readonly IProposalSummary[];
	readonly chips: IProposalsHeaderChips;
	readonly recoverable?: IRecoverable;
	/** Epoch ms when this snapshot was produced (drives TTL). */
	readonly fetchedAt: number;
}

/** One redacted `logs_tail` event as projected for the detail webview (S3). */
export interface IProposalLogEvent {
	readonly ts: string;
	readonly kind: string;
	readonly agent: string | null;
	readonly taskId: string | null;
	readonly summary: string;
}

/** The per-proposal detail model rendered by the detail webview (S3). */
export interface IProposalDetail {
	readonly id: string;
	/** Absent when the id is not on the (actionable) board. */
	readonly summary?: IProposalSummary;
	/** The tolerant `proposal_diagnose` bag; absent when the call failed. */
	readonly diagnose?: Record<string, unknown>;
	/** Redacted transition / owner log lines for this proposal. */
	readonly logs: readonly IProposalLogEvent[];
}

const DEFAULT_TTL_MS = 30_000;

const EMPTY_CHIPS: IProposalsHeaderChips = {
	locks: 0,
	stale: 0,
	queueBackpressure: false,
	health: 'unknown',
};

export interface IProposalsSnapshotSourceOptions {
	readonly client: Pick<McpStdioClient, 'request'>;
	/** Host tool prefix; `undefined` → the default `mcp-vertex_`. */
	readonly namespacePrefix?: string;
	/** Cache lifetime in ms; a fresh `get()` inside the window is served from cache. */
	readonly ttlMs?: number;
	/** Injectable clock for deterministic tests. */
	readonly now?: () => number;
}

/**
 * Fetches + projects + caches the read-only proposals snapshot. One instance
 * is shared by every proposals surface so they observe a single TTL cache.
 */
export class ProposalsSnapshotSource {
	private cached: IProposalsSnapshot | undefined;

	private readonly client: Pick<McpStdioClient, 'request'>;
	private readonly namespacePrefix: string | undefined;
	private readonly ttlMs: number;
	private readonly now: () => number;

	constructor(options: IProposalsSnapshotSourceOptions) {
		this.client = options.client;
		this.namespacePrefix = options.namespacePrefix;
		this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
		this.now = options.now ?? Date.now;
	}

	/** Cached snapshot without triggering a fetch (may be stale/absent). */
	peek(): IProposalsSnapshot | undefined {
		return this.cached;
	}

	/** Drop the cache so the next `get()` refetches (explicit refresh). */
	invalidate(): void {
		this.cached = undefined;
	}

	/**
	 * Return the snapshot, refetching only when forced or when the cache is
	 * older than the TTL. Filter changes call this without `force`, so they
	 * are served from cache — no refetch on filter/keystroke.
	 */
	async get(options?: {
		readonly force?: boolean;
	}): Promise<IProposalsSnapshot> {
		const at = this.now();
		if (
			!options?.force &&
			this.cached !== undefined &&
			at - this.cached.fetchedAt < this.ttlMs
		) {
			return this.cached;
		}
		this.cached = await this.fetch(at);
		return this.cached;
	}

	private async fetch(at: number): Promise<IProposalsSnapshot> {
		const [board, compact, health, stale] = await Promise.all([
			this.call('proposals_proposal_board'),
			this.call('proposals_compact_status'),
			this.call('proposals_state_health'),
			this.call('proposals_proposal_stale_list'),
		]);

		const projected = projectProposals(board);
		return {
			proposals: projected.proposals,
			chips: deriveChips({ compact, health, stale }),
			...(projected.recoverable === undefined
				? {}
				: { recoverable: projected.recoverable }),
			fetchedAt: at,
		};
	}

	/**
	 * Issue a whitelisted read-only tool call. The guard makes the read-only
	 * contract enforceable at the call site: a non-whitelisted suffix throws
	 * rather than reaching the transport. Aux tools that fail resolve to
	 * `undefined` (the board still renders; chips fall back).
	 */
	private async call(
		suffix: (typeof READ_ONLY_TOOLS)[number],
		args: Record<string, unknown> = {},
	): Promise<unknown> {
		if (!isReadOnlyProposalTool(suffix)) {
			throw new Error(`refusing non-read-only proposal tool: ${suffix}`);
		}
		const name = formatToolName(this.namespacePrefix, suffix);
		try {
			return await this.client.request<Record<string, unknown>, unknown>(
				name,
				args,
			);
		} catch {
			return undefined;
		}
	}

	/**
	 * Fetch the per-proposal detail model (S3): the board summary (from the
	 * cached snapshot), the `proposal_diagnose` bag, and the redacted
	 * `logs_tail` events narrowed client-side to this proposal — the tail tool
	 * filters only by kind/outcome, so we keep events whose `taskId` is this
	 * proposal or whose kind is a `proposal_transition`. Every call is
	 * whitelisted read-only; the UI never re-redacts the tool-side output.
	 */
	async fetchProposalDetail(id: string): Promise<IProposalDetail> {
		const snapshot = await this.get();
		const summary = snapshot.proposals.find((p) => p.id === id);
		const [diagnose, logs] = await Promise.all([
			this.call('proposals_proposal_diagnose', { id }),
			this.call('logs_tail', { limit: 200 }),
		]);
		const events = projectLogEvents(logs).filter(
			(e) => e.taskId === id || e.kind === 'proposal_transition',
		);
		return {
			id,
			...(summary === undefined ? {} : { summary }),
			...(isRecord(diagnose) ? { diagnose } : {}),
			logs: events,
		};
	}
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

const asString = (value: unknown): string | undefined =>
	typeof value === 'string' ? value : undefined;

const asNumber = (value: unknown): number | undefined =>
	typeof value === 'number' && Number.isFinite(value) ? value : undefined;

/**
 * Tolerant projection of `proposal_board`. A well-formed `{ proposals: [...] }`
 * is projected field by field (unknown fields ignored, never rejected). Any
 * other shape yields an empty list plus a `recoverable` banner carrying the
 * raw payload.
 */
export const projectProposals = (
	board: unknown,
): { proposals: readonly IProposalSummary[]; recoverable?: IRecoverable } => {
	if (board === undefined) {
		return {
			proposals: [],
			recoverable: {
				message: 'proposal_board returned no payload',
				raw: 'undefined',
			},
		};
	}
	const list = isRecord(board) ? board.proposals : undefined;
	if (!Array.isArray(list)) {
		return {
			proposals: [],
			recoverable: {
				message: 'proposal_board payload has no proposals[] array',
				raw: safeStringify(board),
			},
		};
	}
	const proposals: IProposalSummary[] = [];
	for (const entry of list) {
		const projected = projectProposal(entry);
		if (projected !== undefined) proposals.push(projected);
	}
	return { proposals };
};

const projectProposal = (entry: unknown): IProposalSummary | undefined => {
	if (!isRecord(entry)) return undefined;
	const id = asString(entry.id);
	const status = asString(entry.status);
	if (id === undefined || status === undefined) return undefined;
	const slices = Array.isArray(entry.slices)
		? entry.slices.flatMap((slice) => {
				const projected = projectSlice(slice);
				return projected === undefined ? [] : [projected];
			})
		: [];
	const claimableSliceIds = Array.isArray(entry.claimableSliceIds)
		? entry.claimableSliceIds.filter(
				(value): value is string => typeof value === 'string',
			)
		: [];
	return { id, status, slices, claimableSliceIds };
};

/**
 * Tolerant projection of `logs_tail.events` into the fields the detail webview
 * shows. A non-array payload yields `[]` (the Logs card renders empty, never
 * throws). The tool has already redacted each event; we never re-redact.
 */
export const projectLogEvents = (
	logs: unknown,
): readonly IProposalLogEvent[] => {
	const events = isRecord(logs) ? logs.events : undefined;
	if (!Array.isArray(events)) return [];
	const out: IProposalLogEvent[] = [];
	for (const event of events) {
		if (!isRecord(event)) continue;
		const ts = asString(event.ts);
		const kind = asString(event.kind);
		if (ts === undefined || kind === undefined) continue;
		out.push({
			ts,
			kind,
			agent: asString(event.agent) ?? null,
			taskId: asString(event.taskId) ?? null,
			summary: asString(event.summary) ?? '',
		});
	}
	return out;
};

const projectSlice = (slice: unknown): IProposalSliceSummary | undefined => {
	if (!isRecord(slice)) return undefined;
	const sliceId = asString(slice.sliceId);
	const status = asString(slice.status);
	if (sliceId === undefined || status === undefined) return undefined;
	return { sliceId, status, owner: asString(slice.owner) ?? null };
};

/**
 * Derive the four header chips from the aux read-only tools, each defended
 * against absence (an aux call that failed resolves to `undefined`).
 *
 *  - `locks`   ← `state_health.locks.active` (falls back to `compact_status`).
 *  - `stale`   ← `proposal_stale_list.count` (falls back to `zombies.length`).
 *  - `queueBackpressure` ← any waiter orphans reported by either tool.
 *  - `health`  ← `state_health.healthy` → ok; orphans present → crit; else warn.
 */
export const deriveChips = (sources: {
	readonly compact: unknown;
	readonly health: unknown;
	readonly stale: unknown;
}): IProposalsHeaderChips => {
	const compact = isRecord(sources.compact) ? sources.compact : undefined;
	const health = isRecord(sources.health) ? sources.health : undefined;
	const stale = isRecord(sources.stale) ? sources.stale : undefined;

	const healthLocks = asNumber(
		isRecord(health?.locks) ? health?.locks.active : undefined,
	);
	const compactLocks = asNumber(
		isRecord(compact?.locks) ? compact?.locks.active : undefined,
	);
	const locks = healthLocks ?? compactLocks ?? 0;

	const staleCount =
		asNumber(stale?.count) ??
		(Array.isArray(stale?.zombies) ? stale?.zombies.length : undefined) ??
		0;

	const healthWaiters = asNumber(
		isRecord(health?.queue) ? health?.queue.waiterOrphans : undefined,
	);
	const compactWaiters = asNumber(
		isRecord(compact?.queue) ? compact?.queue.waiterOrphans : undefined,
	);
	const orphanAssignments = asNumber(
		isRecord(health?.registry) ? health?.registry.orphans : undefined,
	);
	const queueBackpressure = (healthWaiters ?? compactWaiters ?? 0) > 0;

	let chipHealth: IProposalsHeaderChips['health'] = 'unknown';
	if (typeof health?.healthy === 'boolean') {
		chipHealth = health.healthy
			? 'ok'
			: (orphanAssignments ?? 0) > 0 || queueBackpressure
				? 'crit'
				: 'warn';
	}

	return { locks, stale: staleCount, queueBackpressure, health: chipHealth };
};

const safeStringify = (value: unknown): string => {
	try {
		return JSON.stringify(value) ?? String(value);
	} catch {
		return String(value);
	}
};

export { EMPTY_CHIPS, DEFAULT_TTL_MS };
