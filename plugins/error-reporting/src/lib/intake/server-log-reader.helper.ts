import { createHash } from 'node:crypto';

import type {
	IServerLogEvent,
	IServerLogReaderOptions,
	IServerLogReadResult,
	IServerLogShapeCount,
	IServerLogEventKind,
} from '../contracts/interfaces/log-intake.interface';

/**
 * server-log-reader.ts — q00014 S3.
 *
 * Parse a host's MCP **server stderr log** into structured events.
 *
 * Why this exists: the single most productive bug-finding activity in
 * this project has been a person pasting a VS Code MCP log into a chat
 * and an agent reading it. Two days of that found a twelve-hour push
 * retry loop, `console.info` corrupting the JSON-RPC channel, a `.mutex`
 * file breaking `git add`'s pathspec, and a log storm where the event id
 * was the whole serialised event printed twice per slice. None of it was
 * visible in the code. Nothing automated it. This does.
 *
 * What the input actually looks like — this matters more than any
 * schema, because the reader has to survive hosts we have never seen:
 *
 *   2026-09-03 01:48:00.665 [warning] [server stderr] {"event":"pipe…
 *   2026-09-03 01:48:00.665 [error] Failed to parse message: Unexpec…
 *   [push-scheduler] push failed (interval): refused by push-to-deve…
 *
 * The host prefix varies (VS Code brackets a level and a channel;
 * Claude Code brackets an ISO stamp; a raw capture has no prefix at
 * all), and the payload is often — but by no means always — JSON.
 *
 * Two rules follow, and both are load-bearing:
 *
 *  1. **Tolerance.** An unrecognised line is skipped, never fatal. A log
 *     from an unknown host must still yield whatever it can; a parser
 *     that throws on line 4 of 40 000 is worth less than no parser.
 *  2. **Bounded.** Storms are the normal case here, not the exception —
 *     hundreds of lines a second. The reader consumes an iterable of
 *     lines (so the caller may stream), retains a capped number of
 *     events, and tracks a capped number of line *shapes*. It never
 *     accumulates the log itself.
 *
 * A "shape" is the line with its variable parts masked: digits, quoted
 * strings, hex digests and path-like tokens all collapse. Two
 * occurrences of the same log line share a `shapeId`, which is how
 * repetition is counted without keeping the bytes that repeated — and
 * which is the only line identity allowed to leave the machine.
 */

const DEFAULT_MAX_LINES = 200_000;
const DEFAULT_MAX_EVENTS = 5_000;
const DEFAULT_MAX_SHAPES = 2_000;
const DEFAULT_MAX_LINE_LENGTH = 8_192;

/** Characters of the shape digest kept. Collision-free at these counts. */
const SHAPE_ID_LENGTH = 16;
/** Cap on the masked excerpt kept for the LOCAL answer only. */
const MAX_DETAIL_LENGTH = 160;

/**
 * Bracketed tokens that are host framing rather than payload. Anything
 * else in brackets — `[push-scheduler]`, `[delendai]` — is the
 * server's own text and stays in the payload where the classifiers can
 * see it.
 */
const HOST_CHANNELS = new Set([
	'server stderr',
	'server stdout',
	'stderr',
	'stdout',
	'server',
	'client',
	'mcp',
]);

/**
 * One permissive prefix matcher covering every host format observed so
 * far. Every group is optional: a bare payload matches with all of them
 * empty, which is exactly the tolerance requirement.
 */
const HOST_PREFIX =
	/^\s*(?:\[?(?<ts>\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d{1,6})?Z?)\]?)?\s*(?:\[(?<level>[A-Za-z]+)\]\s*)?(?<rest>[\s\S]*)$/;

const LEADING_BRACKET = /^\[(?<channel>[^\]]{1,32})\]\s*(?<rest>[\s\S]*)$/;

/* --- payload classifiers -------------------------------------------
 * Order is significant: protocol corruption is checked before anything
 * else because the host emits it for lines the server never meant to
 * write, and those lines may otherwise look like ordinary text. */

/** The host could not parse a JSON-RPC frame: something wrote to stdout. */
const PARSE_FAILURE =
	/Failed to parse message|Unexpected token .* in JSON|invalid JSON-RPC|Parse error/i;

const PUSH_FAILURE =
	/push failed|failed to push some refs|\[rejected\]|push-to-develop|stopped pushing automatically|non-fast-forward/i;

const PATHSPEC_FAILURE =
	/pathspec .* did not match any files|did not match any file\(s\) known to git|fatal: pathspec/i;

const PLUGIN_LOAD_FAILURE =
	/plugin ".*" (?:failed during|register\(\) failed|context build failed|dispose\(\) failed)|failed to load plugin|plugin load failed/i;

/** An engine refusal code: SCREAMING_SNAKE with at least one underscore. */
const REFUSAL_CODE = /\b([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\b/;

const REFUSAL_CONTEXT = /refus|blocked|denied|rejected|\bERR\b|violation/i;

/* --- masking -------------------------------------------------------- */

const QUOTED = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g;
const HEXISH = /\b[0-9a-f]{7,}\b/gi;
const PATHISH = /(?:[A-Za-z]:)?(?:[\\/][\w.@-]+){2,}/g;
const NUMBER = /\d+/g;
const WHITESPACE = /\s+/g;

/**
 * Reduce a payload to its shape. Everything that varies between two
 * occurrences of "the same" log line is replaced by a placeholder, so
 * the result is a template rather than an instance.
 *
 * Path masking runs before number masking on purpose: a masked path is
 * a single token, whereas masking its digits first would leave the
 * directory names behind.
 */
export const maskLogPayload = (payload: string): string =>
	payload
		.replace(QUOTED, '"~"')
		.replace(PATHISH, '~path')
		.replace(HEXISH, '~hex')
		.replace(NUMBER, '0')
		.replace(WHITESPACE, ' ')
		.trim();

const digestOf = (masked: string): string =>
	createHash('sha256').update(masked).digest('hex').slice(0, SHAPE_ID_LENGTH);

/* --- line splitting -------------------------------------------------- */

/**
 * Split a pasted log into lines lazily. A generator rather than
 * `String.prototype.split` so a large paste is not doubled in memory as
 * an array of every line at once; the reader's caps then stop the walk.
 */
export function* splitLogLines(text: string): Generator<string> {
	let start = 0;
	while (start <= text.length) {
		const next = text.indexOf('\n', start);
		if (next === -1) {
			if (start < text.length) yield text.slice(start);
			return;
		}
		yield text.slice(start, next);
		start = next + 1;
	}
}

/* --- parsing --------------------------------------------------------- */

interface IParsedLine {
	readonly atMs?: number | undefined;
	readonly level?: string | undefined;
	readonly payload: string;
}

/** Strip whatever host framing is present. Never fails. */
const stripHostPrefix = (line: string): IParsedLine => {
	const prefix = HOST_PREFIX.exec(line)?.groups;
	let rest = prefix?.rest ?? line;
	const level = prefix?.level?.toLowerCase();
	const stamp = prefix?.ts;

	// Peel host channel tags only — `[server stderr]`, `[stderr]`. A
	// bracketed token the host did not write (`[push-scheduler]`) is
	// payload and must survive for the classifiers.
	for (;;) {
		const bracket = LEADING_BRACKET.exec(rest)?.groups;
		if (bracket === undefined) break;
		const channel = (bracket.channel ?? '').toLowerCase();
		if (!HOST_CHANNELS.has(channel)) break;
		rest = bracket.rest ?? '';
	}

	const atMs =
		stamp === undefined
			? undefined
			: (() => {
					const parsed = Date.parse(stamp.replace(' ', 'T'));
					return Number.isNaN(parsed) ? undefined : parsed;
				})();

	return {
		...(atMs !== undefined ? { atMs } : {}),
		...(level !== undefined ? { level } : {}),
		payload: rest.trim(),
	};
};

interface IJsonPayload {
	readonly event?: unknown;
	readonly code?: unknown;
	readonly trigger?: unknown;
	readonly outcome?: unknown;
	readonly step?: unknown;
}

const asJsonPayload = (payload: string): IJsonPayload | undefined => {
	if (!payload.startsWith('{')) return undefined;
	try {
		const parsed: unknown = JSON.parse(payload);
		if (typeof parsed !== 'object' || parsed === null) return undefined;
		return parsed as IJsonPayload;
	} catch {
		// A truncated or interleaved JSON line is normal in a storm.
		return undefined;
	}
};

const stringOrUndefined = (value: unknown): string | undefined =>
	typeof value === 'string' && value.length > 0 ? value : undefined;

interface IClassification {
	readonly kind: IServerLogEventKind;
	readonly code?: string | undefined;
	readonly trigger?: string | undefined;
}

/**
 * Decide what a payload is, or `undefined` for "not recognised".
 *
 * Structured engine lines are classified from their fields; free text
 * is classified from the marker patterns above. Nothing here guesses:
 * a line without a marker and without an `ERR` outcome contributes to
 * the repetition counters and to nothing else.
 */
const classifyPayload = (
	payload: string,
	level: string | undefined,
): IClassification | undefined => {
	if (PARSE_FAILURE.test(payload)) return { kind: 'protocol-corruption' };
	if (PATHSPEC_FAILURE.test(payload)) return { kind: 'pathspec-failure' };
	if (PLUGIN_LOAD_FAILURE.test(payload))
		return { kind: 'plugin-load-failure' };
	if (PUSH_FAILURE.test(payload)) return { kind: 'push-failure' };

	const json = asJsonPayload(payload);
	if (json !== undefined) {
		const code = stringOrUndefined(json.code);
		const trigger = stringOrUndefined(json.trigger);
		const isError =
			json.outcome === 'ERR' || (code !== undefined && code.length > 0);
		if (!isError) return undefined;
		return {
			kind: 'refusal',
			...(code !== undefined ? { code } : {}),
			...(trigger !== undefined ? { trigger } : {}),
		};
	}

	const code = REFUSAL_CODE.exec(payload)?.[1];
	const looksLikeRefusal =
		REFUSAL_CONTEXT.test(payload) ||
		level === 'error' ||
		level === 'warning';
	if (code !== undefined && looksLikeRefusal) {
		return { kind: 'refusal', code };
	}
	return undefined;
};

interface IShapeAccumulator {
	count: number;
	firstLineNumber: number;
	kind?: IServerLogEventKind;
}

const isAsyncIterable = (
	value: AsyncIterable<string> | Iterable<string>,
): value is AsyncIterable<string> => Symbol.asyncIterator in (value as object);

/**
 * Read a host's server log into classified events plus per-shape
 * repetition counts.
 *
 * The caller supplies lines, not a path: the log the operator wants read
 * lives outside the workspace (a host's own log directory) or arrives as
 * a paste, and this plugin does not open files. Streaming a real file is
 * the caller's job — hand this a `readline` interface and the bounds
 * below still hold.
 */
export const readServerLog = async (
	lines: AsyncIterable<string> | Iterable<string>,
	options: IServerLogReaderOptions = {},
): Promise<IServerLogReadResult> => {
	const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
	const maxEvents = options.maxEvents ?? DEFAULT_MAX_EVENTS;
	const maxShapes = options.maxShapes ?? DEFAULT_MAX_SHAPES;
	const maxLineLength = options.maxLineLength ?? DEFAULT_MAX_LINE_LENGTH;

	const events: IServerLogEvent[] = [];
	const shapes = new Map<string, IShapeAccumulator>();
	let linesRead = 0;
	let linesSkipped = 0;
	let truncated = false;

	const consume = (rawLine: string): boolean => {
		if (linesRead >= maxLines) {
			truncated = true;
			return false;
		}
		linesRead += 1;

		// A line longer than the cap is still counted and still shaped —
		// the storm case is thousands of *identical* oversized lines, and
		// dropping them outright would hide exactly that bug.
		const line =
			rawLine.length > maxLineLength
				? rawLine.slice(0, maxLineLength)
				: rawLine;
		if (line.trim().length === 0) {
			linesSkipped += 1;
			return true;
		}

		const { atMs, level, payload } = stripHostPrefix(line);
		if (payload.length === 0) {
			linesSkipped += 1;
			return true;
		}

		const masked = maskLogPayload(payload);
		const shapeId = digestOf(masked);
		const classification = classifyPayload(payload, level);

		const existing = shapes.get(shapeId);
		if (existing !== undefined) {
			existing.count += 1;
			if (existing.kind === undefined && classification !== undefined) {
				existing.kind = classification.kind;
			}
		} else if (shapes.size < maxShapes) {
			shapes.set(shapeId, {
				count: 1,
				firstLineNumber: linesRead,
				...(classification !== undefined
					? { kind: classification.kind }
					: {}),
			});
		} else {
			// At the shape cap the hot shapes are already tracked; a new
			// cold one is dropped rather than evicting a counted storm.
			truncated = true;
		}

		if (classification === undefined) {
			linesSkipped += 1;
			return true;
		}
		if (events.length >= maxEvents) {
			// Keep counting shapes — the diagnosis of a flood depends on
			// the counts, not on retaining one object per occurrence.
			truncated = true;
			return true;
		}
		events.push({
			kind: classification.kind,
			lineNumber: linesRead,
			shapeId,
			...(atMs !== undefined ? { atMs } : {}),
			...(level !== undefined ? { level } : {}),
			...(classification.code !== undefined
				? { code: classification.code }
				: {}),
			...(classification.trigger !== undefined
				? { trigger: classification.trigger }
				: {}),
			detail:
				masked.length > MAX_DETAIL_LENGTH
					? `${masked.slice(0, MAX_DETAIL_LENGTH - 1)}…`
					: masked,
		});
		return true;
	};

	if (isAsyncIterable(lines)) {
		for await (const line of lines) {
			if (!consume(line)) break;
		}
	} else {
		for (const line of lines) {
			if (!consume(line)) break;
		}
	}

	const shapeCounts: IServerLogShapeCount[] = [...shapes.entries()]
		.map(([shapeId, accumulator]) => ({
			shapeId,
			count: accumulator.count,
			firstLineNumber: accumulator.firstLineNumber,
			...(accumulator.kind !== undefined
				? { kind: accumulator.kind }
				: {}),
		}))
		.sort((left, right) =>
			left.count === right.count
				? left.firstLineNumber - right.firstLineNumber
				: right.count - left.count,
		);

	return {
		events,
		shapes: shapeCounts,
		linesRead,
		linesSkipped,
		truncated,
	};
};

/** Convenience for the pasted-log case; same bounds, lazy splitting. */
export const readServerLogText = async (
	text: string,
	options: IServerLogReaderOptions = {},
): Promise<IServerLogReadResult> => readServerLog(splitLogLines(text), options);
