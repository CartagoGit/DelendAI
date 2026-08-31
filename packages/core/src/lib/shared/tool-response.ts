import { DEFAULT_MAX_RESPONSE_BYTES } from '../contracts/constants/response-byte-budget.constant';
import type {
	ITruncatedEnvelope,
	ITruncationResult,
} from '../contracts/interfaces/truncation.interface';

/**
 * Shared tool-response helpers. All tools should return COMPACT JSON
 * (no pretty-printing) to minimise tokens, and a consistent envelope
 * so any agent or model handles success and failure the same way:
 *
 * - success: `{ ok: true, ...data }`
 * - failure: `{ ok: false, error: { reason, nextAction? } }` + `isError`
 *
 * Failures may also carry a `logHint` (path + line + ts) so the IDE
 * can offer a one-click "Open log" affordance. Use
 * `toolErrorWithLogHint` for that — `toolError` stays the canonical
 * minimal envelope.
 */
export interface IToolTextResult {
	content: Array<{ type: 'text'; text: string }>;
	/**
	 * Machine-readable mirror of the text payload (MCP modern
	 * `structuredContent`). Modern clients read this directly instead of
	 * re-parsing the text. Only set for object payloads — the MCP type is
	 * an object map, so arrays/primitives stay text-only.
	 */
	structuredContent?: Record<string, unknown>;
	isError?: boolean;
	// The MCP SDK's tool result type carries an open index signature.
	[key: string]: unknown;
}

/**
 * Pointer to the persisted log line that records a failure. The
 * `path` is the absolute log file the server just appended to;
 * `line` is the 1-indexed line number inside that JSONL file; `ts`
 * is the event timestamp (ISO 8601). All three are best-effort —
 * the IDE renders the affordance only when every field is present.
 */
export interface IToolErrorLogHint {
	readonly path: string;
	readonly line: number;
	readonly ts: string;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const ensureToolResultMeta = (
	result: unknown,
): Record<string, unknown> | null => {
	if (!isPlainObject(result)) return null;
	const existing = result._meta;
	if (isPlainObject(existing)) return existing;
	const meta: Record<string, unknown> = {};
	result._meta = meta;
	return meta;
};

export const injectToolResultMeta = (
	result: unknown,
	metaEntries: Record<string, unknown>,
): void => {
	const meta = ensureToolResultMeta(result);
	if (meta === null) return;
	for (const [key, value] of Object.entries(metaEntries)) {
		if (value === undefined) continue;
		meta[key] = value;
	}
};

/**
 * Compact JSON text result (no envelope). Use for raw structured data.
 * Object payloads are also surfaced as `structuredContent` so modern MCP
 * clients consume them without re-parsing the text.
 */
export const toolJson = (value: unknown): IToolTextResult => ({
	content: [{ type: 'text', text: JSON.stringify(value) }],
	...(isPlainObject(value) ? { structuredContent: value } : {}),
});

/**
 * Structured object payload plus a compact human-readable summary string.
 * The summary text is JSON-stringified so callers that still parse
 * `content[0].text` as JSON receive a valid primitive, not raw prose.
 */
export const toolJsonWithSummary = (
	value: Record<string, unknown>,
	summaryText: string,
): IToolTextResult => ({
	content: [{ type: 'text', text: JSON.stringify(summaryText) }],
	structuredContent: value,
});

/** Compact success envelope: `{ ok: true, ...data }`. */
export const toolOk = (data: Record<string, unknown> = {}): IToolTextResult =>
	toolJson({ ok: true, ...data });

/** Compact, uniform error envelope with an actionable hint. */
export const toolError = (
	reason: string,
	nextAction?: string,
): IToolTextResult => {
	const envelope = {
		ok: false as const,
		error: {
			reason,
			...(nextAction !== undefined ? { nextAction } : {}),
		},
	};
	return {
		content: [{ type: 'text', text: JSON.stringify(envelope) }],
		structuredContent: envelope,
		isError: true,
	};
};

/**
 * Same envelope as `toolError`, plus a `logHint` so the IDE can offer
 * a clickable "Open log" affordance on the failure render. Additive:
 * the existing `toolError` envelope is unchanged so any client that
 * ignores the new field keeps working.
 */
export const toolErrorWithLogHint = (
	reason: string,
	logHint: IToolErrorLogHint,
	nextAction?: string,
): IToolTextResult => {
	const envelope = {
		ok: false as const,
		error: {
			reason,
			...(nextAction !== undefined ? { nextAction } : {}),
		},
		logHint,
	};
	return {
		content: [{ type: 'text', text: JSON.stringify(envelope) }],
		structuredContent: envelope,
		isError: true,
	};
};

interface ITruncatedPreviewString {
	readonly kind: 'string';
	readonly totalChars: number;
	readonly preview?: string;
	readonly truncated?: true;
}

interface ITruncatedPreviewArray {
	readonly kind: 'array';
	readonly length: number;
	readonly items?: readonly unknown[];
	readonly remainingItems?: number;
}

interface ITruncatedPreviewObject {
	readonly kind: 'object';
	readonly totalKeys: number;
	readonly keys?: readonly string[];
	readonly sample?: Readonly<Record<string, unknown>>;
	readonly remainingKeys?: number;
}

interface ITruncatedPreviewScalar {
	readonly kind:
		| 'number'
		| 'boolean'
		| 'null'
		| 'bigint'
		| 'undefined'
		| 'function'
		| 'symbol';
	readonly value?: boolean | number | string;
}

type TruncatedPreview =
	| ITruncatedPreviewString
	| ITruncatedPreviewArray
	| ITruncatedPreviewObject
	| ITruncatedPreviewScalar;

const byteLengthUtf8 = (input: string): number =>
	Buffer.byteLength(input, 'utf8');

const takeCodePoints = (value: string, limit: number): string =>
	Array.from(value).slice(0, Math.max(0, limit)).join('');

const describeScalar = (value: unknown): ITruncatedPreviewScalar => {
	if (value === null) return { kind: 'null' };
	if (typeof value === 'number') return { kind: 'number', value };
	if (typeof value === 'boolean') return { kind: 'boolean', value };
	if (typeof value === 'bigint') {
		return { kind: 'bigint', value: value.toString() };
	}
	if (typeof value === 'undefined') return { kind: 'undefined' };
	if (typeof value === 'function') return { kind: 'function' };
	return { kind: 'symbol', value: String(value) };
};

const previewLeaf = (value: unknown): unknown => {
	if (typeof value === 'string') {
		const totalChars = Array.from(value).length;
		const preview = takeCodePoints(value, 16);
		return {
			kind: 'string',
			totalChars,
			...(preview.length === 0 ? {} : { preview }),
			...(preview === value ? {} : { truncated: true as const }),
		} satisfies ITruncatedPreviewString;
	}
	if (Array.isArray(value)) {
		return {
			kind: 'array',
			length: value.length,
		} satisfies ITruncatedPreviewArray;
	}
	if (isPlainObject(value)) {
		return {
			kind: 'object',
			totalKeys: Object.keys(value).length,
		} satisfies ITruncatedPreviewObject;
	}
	return describeScalar(value);
};

const buildPreview = (
	value: unknown,
	detailBudget: number,
): TruncatedPreview => {
	if (typeof value === 'string') {
		const totalChars = Array.from(value).length;
		const preview = takeCodePoints(value, detailBudget);
		return {
			kind: 'string',
			totalChars,
			...(preview.length === 0 ? {} : { preview }),
			...(preview === value ? {} : { truncated: true as const }),
		};
	}
	if (Array.isArray(value)) {
		const visibleCount = Math.min(detailBudget, value.length);
		const items = value.slice(0, visibleCount).map(previewLeaf);
		return {
			kind: 'array',
			length: value.length,
			...(items.length === 0 ? {} : { items }),
			...(visibleCount < value.length
				? { remainingItems: value.length - visibleCount }
				: {}),
		};
	}
	if (isPlainObject(value)) {
		const keys = Object.keys(value);
		const visibleKeys = keys.slice(0, Math.min(detailBudget, keys.length));
		const sampleEntries = visibleKeys.map(
			(key) => [key, previewLeaf(value[key])] as const,
		);
		return {
			kind: 'object',
			totalKeys: keys.length,
			...(visibleKeys.length === 0 ? {} : { keys: visibleKeys }),
			...(sampleEntries.length === 0
				? {}
				: { sample: Object.fromEntries(sampleEntries) }),
			...(visibleKeys.length < keys.length
				? { remainingKeys: keys.length - visibleKeys.length }
				: {}),
		};
	}
	return describeScalar(value);
};

const previewSearchUpperBound = (value: unknown): number => {
	if (typeof value === 'string') return Array.from(value).length;
	if (Array.isArray(value)) return value.length;
	if (isPlainObject(value)) return Object.keys(value).length;
	return 1;
};

const buildEnvelope = (
	originalBytes: number,
	maxBytes: number,
	head: TruncatedPreview,
	clamped?: true,
): { readonly envelope: ITruncatedEnvelope; readonly finalBytes: number } => {
	let finalBytes = 0;
	while (true) {
		const envelope = {
			__truncated: true as const,
			originalBytes,
			maxBytes,
			finalBytes,
			head,
			...(clamped === true ? { clamped: true as const } : {}),
		};
		const nextBytes = byteLengthUtf8(JSON.stringify(envelope));
		if (nextBytes === finalBytes) {
			return {
				envelope: envelope as ITruncatedEnvelope,
				finalBytes: nextBytes,
			};
		}
		finalBytes = nextBytes;
	}
};

/**
 * Pure: serialize `value` to JSON and emit a `{ __truncated, head, … }`
 * envelope when the result exceeds `maxBytes` UTF-8 bytes.
 *
 * Aligns with the project\'s token-budget discipline: a runaway tool
 * output cannot blow past the per-tool budget the agent is sized for.
 * The marker keeps the shape valid JSON so clients that ignore the
 * marker still parse the response without crashing.
 *
 * Implementation note — we never slice the JSON string at an arbitrary
 * offset (that produces invalid JSON when the cut lands mid-string or
 * mid-escape). Instead we emit a fresh envelope whose `head` is a safe
 * structural preview, then binary-search the maximum preview detail
 * that still fits. If even the minimum honest envelope does not fit,
 * we return that minimum envelope with `clamped: true` and the real
 * `finalBytes`.
 */
export const truncateIfTooLarge = <T>(
	value: T,
	maxBytes: number = DEFAULT_MAX_RESPONSE_BYTES,
): ITruncationResult<T | ITruncatedEnvelope> => {
	const serialised = JSON.stringify(value);
	const originalBytes = byteLengthUtf8(serialised);
	if (originalBytes <= maxBytes) {
		return {
			value,
			truncated: false,
			originalBytes,
			finalBytes: originalBytes,
		};
	}
	const minimalHead = buildPreview(value, 0);
	const minimumEnvelope = buildEnvelope(originalBytes, maxBytes, minimalHead);
	if (minimumEnvelope.finalBytes > maxBytes) {
		const clampedEnvelope = buildEnvelope(
			originalBytes,
			maxBytes,
			minimalHead,
			true,
		);
		return {
			value: clampedEnvelope.envelope,
			truncated: true,
			originalBytes,
			finalBytes: clampedEnvelope.finalBytes,
			clamped: true,
		};
	}
	let bestEnvelope = minimumEnvelope;
	let low = 0;
	let high = previewSearchUpperBound(value);
	while (low <= high) {
		const mid = Math.floor((low + high) / 2);
		const candidate = buildEnvelope(
			originalBytes,
			maxBytes,
			buildPreview(value, mid),
		);
		if (candidate.finalBytes <= maxBytes) {
			bestEnvelope = candidate;
			low = mid + 1;
			continue;
		}
		high = mid - 1;
	}
	return {
		value: bestEnvelope.envelope,
		truncated: true,
		originalBytes,
		finalBytes: bestEnvelope.finalBytes,
	};
};

/** Convenience wrapper that combines `toolJson` with `truncateIfTooLarge`.
 * Use when a tool\'s output is potentially unbounded (full file dumps,
 * search hits, logs, etc.). */
export const toolJsonBounded = (
	value: unknown,
	maxBytes: number = DEFAULT_MAX_RESPONSE_BYTES,
): IToolTextResult => {
	const { value: bounded } = truncateIfTooLarge(value, maxBytes);
	return toolJson(bounded);
};
