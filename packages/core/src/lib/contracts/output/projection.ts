/**
 * contracts/output/projection.ts — v00133 (S2)
 *
 * Reusable compact/full projection contract for tools and APIs.
 *
 * Vocabulary (matches v00133 §S2 acceptance):
 *   - `mode: "compact" | "full"` selects the default verbosity.
 *     `compact` defaults to a curated subset (the value contract's
 *     `compactFields`, when present, or a fallback list); `full`
 *     emits every key of the source value.
 *   - `fields` is an explicit allow-list. When present, it wins
 *     over `mode` and limits the projection to that subset.
 *   - `limit` caps the number of rows emitted (arrays/streams).
 *   - `cursor` is opaque to the projector; consumers attach it to
 *     follow-up calls. Projectors never inspect or mutate it.
 *   - `maxBytes` is a UTF-8 byte budget for the serialized output.
 *     When the projection would exceed the budget, the projector
 *     truncates with a sentinel `truncated: true` and reduces the
 *     emitted rows/fields to fit. Empty inputs are respected
 *     verbatim (truncation only kicks in for non-empty payloads).
 *
 * Privacy & determinism (R1.1–R1.10): no I/O, no clock, no log
 * sinks. The projector is pure over its inputs. UTF-8 byte
 * measurements are deterministic per encoding version.
 */

export type TProjectionMode = 'compact' | 'full';

export interface IProjectionRequest {
	readonly mode?: TProjectionMode;
	readonly fields?: readonly string[];
	readonly limit?: number;
	readonly cursor?: string;
	readonly maxBytes?: number;
}

export interface IProjectionResult<T> {
	readonly value: T;
	readonly mode: TProjectionMode;
	readonly fields: readonly string[] | null;
	readonly limit: number | null;
	readonly cursor: string | null;
	readonly emittedBytes: number;
	readonly truncated: boolean;
	readonly truncatedByLimit: boolean;
	readonly truncatedByBytes: boolean;
	readonly nextCursor: string | null;
}

const UTF8_ENCODER = new TextEncoder();

const byteLength = (value: string): number => UTF8_ENCODER.encode(value).length;

const FALLBACK_COMPACT_FIELDS: readonly string[] = Object.freeze([
	'id',
	'name',
	'kind',
	'type',
	'plugin',
	'summary',
	'description',
]);

const normalizeFields = (
	request: IProjectionRequest,
): readonly string[] | null => {
	if (request.fields !== undefined) {
		const seen = new Set<string>();
		const ordered: string[] = [];
		for (const field of request.fields) {
			const trimmed = field.trim();
			if (trimmed.length === 0) continue;
			if (seen.has(trimmed)) continue;
			seen.add(trimmed);
			ordered.push(trimmed);
		}
		return ordered.length === 0 ? null : Object.freeze(ordered);
	}
	return null;
};

const resolveMode = (request: IProjectionRequest): TProjectionMode =>
	request.mode === 'full' ? 'full' : 'compact';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' &&
	value !== null &&
	!Array.isArray(value) &&
	(Object.getPrototypeOf(value) === Object.prototype ||
		Object.getPrototypeOf(value) === null);

const projectScalar = (
	value: unknown,
	fields: readonly string[] | null,
	mode: TProjectionMode,
): unknown => {
	if (value === null || value === undefined) return value;
	if (typeof value !== 'object') return value;
	if (Array.isArray(value)) return value;
	if (!isPlainObject(value)) return value;
	const allowed =
		fields ??
		(mode === 'compact'
			? FALLBACK_COMPACT_FIELDS
			: Object.freeze(Object.keys(value)));
	const projected: Record<string, unknown> = {};
	for (const key of allowed) {
		if (Object.hasOwn(value, key)) {
			projected[key] = (value as Record<string, unknown>)[key];
		}
	}
	return Object.freeze(projected);
};

const projectArray = <T>(
	values: readonly T[],
	request: IProjectionRequest,
	fields: readonly string[] | null,
	mode: TProjectionMode,
): {
	readonly rows: readonly T[];
	readonly nextCursor: string | null;
	readonly limited: boolean;
} => {
	const limit = request.limit;
	const limited = limit !== undefined && limit >= 0 && values.length > limit;
	const capped = limited ? values.slice(0, limit ?? values.length) : values;
	const projectedRows = capped.map((row) =>
		projectScalar(row, fields, mode),
	) as unknown as T[];
	const nextCursor = limited ? `offset:${limit}` : null;
	return { rows: projectedRows, nextCursor, limited };
};

const truncateRowsToBudget = <T>(
	rows: readonly T[],
	maxBytes: number,
): { readonly rows: readonly T[]; readonly cost: number } => {
	if (rows.length === 0) return { rows, cost: 2 };
	const fullCost = byteLength(JSON.stringify(rows));
	if (fullCost <= maxBytes) return { rows, cost: fullCost };
	let low = 1;
	let high = rows.length;
	let bestRows: readonly T[] = rows.slice(0, 1);
	let bestCost = byteLength(JSON.stringify(bestRows));
	while (low <= high) {
		const mid = Math.floor((low + high) / 2);
		const candidate = rows.slice(0, mid);
		const cost = byteLength(JSON.stringify(candidate));
		if (cost <= maxBytes) {
			bestRows = candidate;
			bestCost = cost;
			low = mid + 1;
		} else {
			high = mid - 1;
		}
	}
	return { rows: bestRows, cost: bestCost };
};

/**
 * Apply a projection request over an arbitrary payload. Pure,
 * deterministic, and side-effect-free. Caller supplies the cursor
 * opaque value untouched; the projector only emits `nextCursor`
 * when truncation happened due to `limit`.
 */
export const projectValue = <T>(
	value: T,
	request: IProjectionRequest = {},
): IProjectionResult<T> => {
	const mode = resolveMode(request);
	const fields = normalizeFields(request);
	const cursor = request.cursor ?? null;

	if (Array.isArray(value)) {
		const { rows, nextCursor, limited } = projectArray(
			value,
			request,
			fields,
			mode,
		);
		const maxBytes = request.maxBytes;
		let emitted: readonly T[] = rows;
		let truncatedByBytes = false;
		if (maxBytes !== undefined && maxBytes >= 0 && rows.length > 0) {
			const initial = byteLength(JSON.stringify(rows));
			if (initial > maxBytes) {
				truncatedByBytes = true;
				const truncatedResult = truncateRowsToBudget(rows, maxBytes);
				emitted = truncatedResult.rows;
			}
		}
		const emittedBytes = byteLength(JSON.stringify(emitted));
		const truncated = limited || truncatedByBytes;
		return Object.freeze({
			value: emitted as unknown as T,
			mode,
			fields,
			limit: request.limit ?? null,
			cursor,
			emittedBytes,
			truncated,
			truncatedByLimit: limited,
			truncatedByBytes,
			nextCursor: truncated ? nextCursor : null,
		}) as IProjectionResult<T>;
	}

	const projected = projectScalar(value, fields, mode);
	const projectedJson = JSON.stringify(projected);
	const emittedBytes = byteLength(projectedJson);
	const maxBytes = request.maxBytes;
	const truncated =
		maxBytes !== undefined &&
		maxBytes >= 0 &&
		emittedBytes > maxBytes &&
		projected !== null &&
		projected !== undefined;
	return Object.freeze({
		value: truncated ? null : (projected as T),
		mode,
		fields,
		limit: null,
		cursor,
		emittedBytes: truncated ? 0 : emittedBytes,
		truncated,
		truncatedByLimit: false,
		truncatedByBytes: truncated,
		nextCursor: null,
	}) as IProjectionResult<T>;
};

export const __testing = Object.freeze({
	UTF8_ENCODER,
	truncateRowsToBudget,
	FALLBACK_COMPACT_FIELDS,
});
