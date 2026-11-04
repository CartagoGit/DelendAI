/**
 * types.ts — f00251 S1.
 *
 * Shared zod schemas and TypeScript types for the error-collection engine.
 * All schemas are validated at runtime; TypeScript types are derived via
 * `z.infer` and wrapped in `Readonly<>` to enforce immutability at
 * compile-time.
 */
import z from 'zod';

// ---------------------------------------------------------------------------
// Primitive schemas
// ---------------------------------------------------------------------------

/**
 * The 8 severity bands ordered from lowest to highest impact.
 *
 * @example
 * ```ts
 * const band = ISeverityBandSchema.parse('error'); // → 'error'
 * ```
 */
export const ISeverityBandSchema = z.enum([
	'debug',
	'info',
	'notice',
	'warning',
	'error',
	'critical',
	'alert',
	'emergency',
]);

/** One of the 8 canonical severity bands. */
export type ISeverityBand = z.infer<typeof ISeverityBandSchema>;

/**
 * A non-empty string that uniquely identifies a sink within a collector.
 *
 * @example
 * ```ts
 * const id = ISinkIdSchema.parse('console-error'); // ok
 * ISinkIdSchema.parse(''); // throws
 * ```
 */
export const ISinkIdSchema = z.string().min(1);

/** Non-empty sink identifier. */
export type ISinkId = z.infer<typeof ISinkIdSchema>;

// ---------------------------------------------------------------------------
// Context and input schemas
// ---------------------------------------------------------------------------

/**
 * Tool-level metadata supplied by the caller at the moment an error is
 * captured.  Identifies which package, plugin and tool raised the error so
 * the collector can construct a stable fingerprint.
 */
export const ICapturedErrorContextSchema = z.object({
	/** Unique id of the package that owns the tool (e.g. a pkg namespace). */
	toolName: z.string().min(1),
	/** The package / host id that owns the plugin. */
	packageId: z.string().min(1),
	/** The plugin id within the package. */
	pluginName: z.string().min(1),
});

/** Tool metadata at the time of error capture. */
export type ICapturedErrorContext = Readonly<
	z.infer<typeof ICapturedErrorContextSchema>
>;

/**
 * Builder fields assembled by the collector before the computed properties
 * (`ts`, `fingerprint`, `kind`) are attached.  Exported so downstream
 * layers can build partial events without running the full pipeline.
 */
export const IErrorSinkRecordInputSchema = z.object({
	/** Short machine-readable error code (e.g. `'ERR_TYPE'`). */
	errorCode: z.string().min(1),
	/** The error constructor name (e.g. `'TypeError'`, `'RangeError'`). */
	errorName: z.string().min(1),
	/** Severity band assigned by the classifier. */
	severity: ISeverityBandSchema,
	/** Human-readable classification tag (e.g. `'TYPE_ERROR'`). */
	classification: z.string().min(1),
	/** Tool name from the capturing context. */
	toolName: z.string().min(1),
	/** Package id from the capturing context. */
	packageId: z.string().min(1),
	/** Plugin id from the capturing context. */
	pluginName: z.string().min(1),
	/** Truncated error message (≤ `argByteLimit` bytes after redaction). */
	summary: z.string(),
	/** Top 3 stack frames, newline-separated (may be empty). */
	stackHead: z.string(),
	/** Byte count of the original message + stack before any truncation. */
	byteCount: z.number().int().nonnegative(),
	/** `true` when `summary` or `stackHead` was truncated to fit the cap. */
	truncated: z.boolean(),
});

/** Pre-fingerprint builder input for the error-collection engine. */
export type IErrorSinkRecordInput = Readonly<
	z.infer<typeof IErrorSinkRecordInputSchema>
>;

// ---------------------------------------------------------------------------
// Full captured-error event
// ---------------------------------------------------------------------------

/**
 * A fully validated captured-error event ready for sink fan-out.  The
 * `ts`, `fingerprint`, and `kind` fields are computed by the collector
 * engine and not present in `IErrorSinkRecordInput`.
 *
 * @example
 * ```ts
 * const event = ICapturedErrorSchema.parse(rawEvent);
 * ```
 */
export const ICapturedErrorSchema = IErrorSinkRecordInputSchema.extend({
	/** ISO-8601 UTC timestamp of capture. */
	ts: z.iso.datetime(),
	/** SHA-256 hex fingerprint for deduplication. */
	fingerprint: z.string().min(1),
	/** Discriminant for the captured-error event stream. */
	kind: z.literal('captured-error'),
});

/** A validated, ready-to-record captured-error event. */
export type ICapturedError = Readonly<z.infer<typeof ICapturedErrorSchema>>;
