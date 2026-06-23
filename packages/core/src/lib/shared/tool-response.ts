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

/**
 * Compact JSON text result (no envelope). Use for raw structured data.
 * Object payloads are also surfaced as `structuredContent` so modern MCP
 * clients consume them without re-parsing the text.
 */
export const toolJson = (value: unknown): IToolTextResult => ({
	content: [{ type: 'text', text: JSON.stringify(value) }],
	...(isPlainObject(value) ? { structuredContent: value } : {}),
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

/** Default byte ceiling for a single tool response (256 KiB). Aligns with
 * the `token-budgets` table — a compact JSON payload under this size
 * stays under the measured per-tool budget for every preset we ship. */
export const DEFAULT_MAX_RESPONSE_BYTES = 256 * 1024;

export interface ITruncationResult<T> {
	/** The (possibly truncated) value to surface to the agent. */
	readonly value: T;
	/** True when the value was truncated to fit under `maxBytes`. */
	readonly truncated: boolean;
	/** Original byte length of the serialised value. */
	readonly originalBytes: number;
	/** Byte length of the truncated value (`<= maxBytes`). */
	readonly finalBytes: number;
}

/**
 * Pure: serialize `value` to JSON and emit a `{ __truncated, head, … }`
 * envelope when the result exceeds `maxBytes` UTF-8 bytes.
 *
 * Aligns with the project\'s token-budget discipline: a runaway tool
 * output cannot blow past the per-tool budget the agent is sized for.
 * The marker keeps the shape valid JSON so clients that ignore the
 * marker still parse the response without crashing.
 *
 * Implementation note — we never slice the JSON string at an
 * arbitrary offset (that produces invalid JSON when the cut lands
 * mid-string or mid-escape). Instead we serialise the full payload,
 * verify the byte count, and only when over budget we emit a fresh
 * envelope that holds the original value under `head` (so the caller
 * can still consume the structured data without re-parsing fragile
 * substrings).
 */
export const truncateIfTooLarge = <T>(
	value: T,
	maxBytes: number = DEFAULT_MAX_RESPONSE_BYTES,
): ITruncationResult<T | ITruncatedEnvelope> => {
	const serialised = JSON.stringify(value);
	const originalBytes = Buffer.byteLength(serialised, 'utf8');
	if (originalBytes <= maxBytes) {
		return {
			value,
			truncated: false,
			originalBytes,
			finalBytes: originalBytes,
		};
	}
	// Build the envelope first to measure its size, then decide how
	// much room is left for `head`. `head` is a JSON fragment of the
	// original value (NOT a re-parsed object — slicing JSON mid-string
	// would produce invalid output). The caller can re-parse `head`
	// when it has a schema-aware reader.
	const envelopeBase = {
		__truncated: true,
		originalBytes,
		maxBytes,
		head: '',
	} as const;
	const baseBytes = Buffer.byteLength(JSON.stringify(envelopeBase), 'utf8');
	const headBudget = Math.max(0, maxBytes - baseBytes - 1);
	const headSlice = serialised.slice(0, headBudget);
	const envelope = {
		__truncated: true,
		originalBytes,
		maxBytes,
		head: headSlice,
	};
	const finalSerialised = JSON.stringify(envelope);
	const truncatedValue = JSON.parse(finalSerialised) as ITruncatedEnvelope;
	return {
		value: truncatedValue,
		truncated: true,
		originalBytes,
		finalBytes: Buffer.byteLength(finalSerialised, 'utf8'),
	};
};

export interface ITruncatedEnvelope {
	readonly __truncated: true;
	readonly originalBytes: number;
	readonly maxBytes: number;
	readonly head?: unknown;
}

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
