/**
 * observability/timeline.ts — f00192 (Track J / agent timeline).
 *
 * The host-agnostic core of the Agent Timeline view: an
 * append-only, rotatable, redactable log of agent lifecycle
 * events. The pure module produces a `ITimelineLog`; the host
 * (VSCode, CLI, web) decides where to persist it.
 *
 * Design notes (SRP + OCP):
 *   - The store is a value object (POJO + a tiny ring-buffer
 *     helper). No file I/O lives here — the host owns the path
 *     (`.vscode/delendai/timeline.json` in VSCode, `/tmp` in CI).
 *   - `serialize` / `deserialize` round-trip through JSON. Versioned
 *     (`version: 1`) so the host can fail loudly when reading an
 *     older schema.
 *   - `append` is the only mutator. It is intentionally synchronous
 *     and synchronous-only — events are cheap, the buffer is
 *     in-memory, and the caller controls batching.
 *   - Redaction runs at `append` time so the on-disk log never
 *     holds tool names in clear. The redaction policy is a single
 *     function (`redactFreeText`) that callers can swap for a
 *     stricter variant via the constructor.
 *
 * Privacy (R1.1, R1.6, R1.9):
 *   - Tool-name-like tokens (`<word>.<word>`) are replaced with
 *     `<tool>` BEFORE persistence — same heuristic as the
 *     external-MCP sanitizer (f00193).
 *   - URLs are replaced with `<url>`.
 *   - The redaction is irreversible by design; a reader cannot
 *     recover the original.
 */

export type TimelineEventKind =
	| 'claim'
	| 'activate'
	| 'change'
	| 'test'
	| 'cost'
	| 'commit'
	| 'close'
	| 'note';

/**
 * A single timeline event. All fields are optional EXCEPT `kind`
 * and `ts` — the minimum to render an entry is "what" + "when".
 *
 * `why`, `inputs`, `outputs` are FREE TEXT and MUST be redacted by
 * the buffer before they reach the on-disk log. Callers MAY pass
 * unredacted text for ergonomics; the buffer guarantees the log is
 * safe to surface in any view.
 */
export interface ITimelineEvent {
	readonly ts: string;
	readonly kind: TimelineEventKind;
	readonly plugin?: string;
	readonly sliceId?: string;
	/** Tokens consumed by the step (optional; surfaces on `cost` events). */
	readonly cost?: number;
	/** Free-text motivation; auto-redacted before persistence. */
	readonly why?: string;
	/** Free-text summary of inputs; auto-redacted. */
	readonly inputs?: string;
	/** Free-text summary of outputs; auto-redacted. */
	readonly outputs?: string;
	/** Commit sha; surfaces on `commit` events. */
	readonly commitSha?: string;
	/** Arbitrary structured metadata; values are NOT auto-redacted. */
	readonly meta?: Readonly<Record<string, string>>;
}

export interface ITimelineLog {
	readonly version: 1;
	readonly events: readonly ITimelineEvent[];
}

/** Default ring size — keeps the on-disk log bounded. Hosts can
 *  override per-instance. 500 events ≈ a week of dense activity. */
export const DEFAULT_MAX_EVENTS = 500;

export interface ITimelineBufferOptions {
	readonly maxEvents?: number;
	/** Custom redaction function (e.g. a stricter one in tests). */
	readonly redact?: (text: string) => string;
}

/** Built-in free-text redactor: strips tool-name-like tokens +
 *  URLs + collapses whitespace. Pure. */
const TOOL_NAME_RE = /\b[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*\b/g;
const URL_RE = /https?:\/\/\S+/g;

export const redactFreeText = (text: string): string => {
	if (text.length === 0) return text;
	const noTool = text.replace(TOOL_NAME_RE, '<tool>');
	const noUrl = noTool.replace(URL_RE, '<url>');
	return noUrl.replace(/\s+/g, ' ').trim();
};

/**
 * Compose a redact function that delegates to `redactFreeText` and
 * truncates the result to `maxLen` characters. Pure.
 */
export const truncateRedactor =
	(maxLen: number) =>
	(text: string): string => {
		const redacted = redactFreeText(text);
		if (redacted.length <= maxLen) return redacted;
		return `${redacted.slice(0, Math.max(0, maxLen - 3))}...`;
	};

const cloneEvent = (
	event: ITimelineEvent,
	redact: (s: string) => string,
): ITimelineEvent => {
	const optional: {
		plugin?: string;
		sliceId?: string;
		cost?: number;
		why?: string;
		inputs?: string;
		outputs?: string;
		commitSha?: string;
		meta?: Readonly<Record<string, string>>;
	} = {};
	if (event.plugin !== undefined) optional.plugin = event.plugin;
	if (event.sliceId !== undefined) optional.sliceId = event.sliceId;
	if (event.cost !== undefined) optional.cost = event.cost;
	if (event.why !== undefined) optional.why = redact(event.why);
	if (event.inputs !== undefined) optional.inputs = redact(event.inputs);
	if (event.outputs !== undefined) optional.outputs = redact(event.outputs);
	if (event.commitSha !== undefined) optional.commitSha = event.commitSha;
	if (event.meta !== undefined) optional.meta = { ...event.meta };
	return { ts: event.ts, kind: event.kind, ...optional };
};

const defaultMaxEvents = (opts?: ITimelineBufferOptions): number =>
	opts?.maxEvents ?? DEFAULT_MAX_EVENTS;

const defaultRedact = (
	opts?: ITimelineBufferOptions,
): ((s: string) => string) => opts?.redact ?? truncateRedactor(280);

/**
 * In-memory ring buffer of timeline events with auto-redaction at
 * the boundary. Construct, append, serialize.
 */
export class TimelineBuffer {
	private readonly capacity: number;
	private readonly redact: (s: string) => string;
	private readonly events: ITimelineEvent[] = [];

	constructor(options: ITimelineBufferOptions = {}) {
		this.capacity = defaultMaxEvents(options);
		this.redact = defaultRedact(options);
	}

	/** Append an event. Returns the (redacted) event that landed in the log. */
	append(event: ITimelineEvent): ITimelineEvent {
		if (event.kind === undefined || event.ts === undefined) {
			throw new Error('timeline event requires { kind, ts }');
		}
		const stored = cloneEvent(event, this.redact);
		this.events.push(stored);
		if (this.events.length > this.capacity) {
			this.events.splice(0, this.events.length - this.capacity);
		}
		return stored;
	}

	/** Read-only view of the live log. */
	snapshot(): ITimelineLog {
		return { version: 1, events: this.events.slice() };
	}

	/** Number of events currently buffered (test helper). */
	get size(): number {
		return this.events.length;
	}

	/** Capacity (test helper). */
	get maxEvents(): number {
		return this.capacity;
	}

	/** Drop every event. Used by the rotation policy. */
	clear(): void {
		this.events.length = 0;
	}

	/**
	 * Return only events whose kind matches one of the provided
	 * kinds (OR). Pure; safe for the view layer to call on every
	 * render. Unknown kinds in the filter list are ignored.
	 */
	filterByKind(
		kinds: readonly TimelineEventKind[],
	): readonly ITimelineEvent[] {
		const set = new Set<TimelineEventKind>(kinds);
		return this.events.filter((event) => set.has(event.kind));
	}

	/**
	 * Return only events whose `plugin` matches the given id.
	 * Pure.
	 */
	filterByPlugin(pluginId: string): readonly ITimelineEvent[] {
		return this.events.filter((event) => event.plugin === pluginId);
	}

	/** JSON-serialize the log. The host writes this to disk. */
	serialize(): string {
		return JSON.stringify({ version: 1, events: this.events });
	}

	/** Parse a serialized log back into a value object. */
	static deserialize(raw: string): ITimelineLog {
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch (err: unknown) {
			throw new Error(
				`timeline.json: invalid JSON (${err instanceof Error ? err.message : 'parse error'})`,
			);
		}
		if (!isTimelineLog(parsed)) {
			throw new Error(
				'timeline.json: schema mismatch (expected { version: 1, events: [...] })',
			);
		}
		return parsed;
	}
}

/**
 * Type guard: a parsed JSON value is a valid timeline log.
 * Pure.
 */
export const isTimelineLog = (value: unknown): value is ITimelineLog => {
	if (typeof value !== 'object' || value === null) return false;
	const obj = value as { version?: unknown; events?: unknown };
	if (obj.version !== 1) return false;
	if (!Array.isArray(obj.events)) return false;
	return obj.events.every(isTimelineEvent);
};

const isTimelineEvent = (value: unknown): value is ITimelineEvent => {
	if (typeof value !== 'object' || value === null) return false;
	const obj = value as { ts?: unknown; kind?: unknown };
	if (typeof obj.ts !== 'string') return false;
	if (typeof obj.kind !== 'string') return false;
	const valid: ReadonlySet<string> = new Set([
		'claim',
		'activate',
		'change',
		'test',
		'cost',
		'commit',
		'close',
		'note',
	]);
	return valid.has(obj.kind);
};

/**
 * Merge two logs into a single one (left wins on duplicate ts+kind
 * collisions). Used by the host when reading an existing on-disk
 * log and resuming the in-memory buffer. Pure.
 */
export const mergeTimelineLogs = (
	left: ITimelineLog,
	right: ITimelineLog,
): ITimelineLog => {
	const seen = new Set<string>();
	const out: ITimelineEvent[] = [];
	const push = (event: ITimelineEvent) => {
		const key = `${event.ts}|${event.kind}|${event.plugin ?? ''}|${event.sliceId ?? ''}`;
		if (seen.has(key)) return;
		seen.add(key);
		out.push(event);
	};
	for (const event of left.events) push(event);
	for (const event of right.events) push(event);
	out.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
	return { version: 1, events: out };
};

/**
 * Convenience: build a one-shot event timestamped at the current
 * instant. The host sets `cost`, `why`, etc. separately.
 */
export const nowEvent = (
	kind: TimelineEventKind,
	fields: Omit<ITimelineEvent, 'ts' | 'kind'> = {},
): ITimelineEvent => {
	return { ts: new Date().toISOString(), kind, ...fields };
};

/**
 * Format an event's timestamp as `YYYY-MM-DD HH:MM:SS` for display
 * (UTC). Pure.
 */
export const formatEventTimestamp = (iso: string): string => {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return iso;
	const pad = (n: number): string => `${n}`.padStart(2, '0');
	return (
		`${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
		`${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
	);
};
