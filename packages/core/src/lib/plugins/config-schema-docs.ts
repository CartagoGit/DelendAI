/**
 * config-schema-docs.ts — what every configuration value MEANS.
 *
 * The JSON Schema for `delendai.config.json` used to say which values
 * were legal and nothing about what they do. An editor offered
 * `"surfaceMode": "managed"` with no hint of what `managed` costs or
 * buys, and a person who did not already know the project had no way
 * to find out without reading the source.
 *
 * The prose lives here, apart from the shape, because the shape and the
 * meaning have different lifetimes: the shape changes when a field is
 * added, the meaning changes when a policy changes, and a reader
 * looking up "what does `granularity: slice` actually do" wants the
 * second without wading through the first.
 *
 * `documentedEnum` is the bridge. It takes the legal values and the
 * prose for each, and the TYPE of the prose map is keyed by the
 * values — so adding a value to an enum without writing its sentence
 * is a compile error, not a gap someone notices months later.
 *
 * The prose reaches the user twice: in the committed JSON Schema (the
 * editor's autocomplete) and in the `init_config` tool's payload (what
 * a model reads before it writes a config). Both come from the same
 * `z.toJSONSchema` projection, so they cannot disagree.
 */
import { z } from 'zod';

/**
 * An enum that carries the meaning of each of its values.
 *
 * The `docs` parameter is keyed by the values themselves, so the
 * compiler refuses an enum that grew a value nobody explained.
 */
export const documentedEnum = <const T extends readonly [string, ...string[]]>(
	values: T,
	docs: Readonly<Record<T[number], string>>,
): z.ZodEnum<z.util.ToEnum<T[number]>> =>
	// The cast is not laziness: `z.enum` re-widens a generic tuple to its
	// own mapped type, and `.meta()` keeps that widened type. The values
	// are exactly `T` — `documentedEnum` refuses a doc map that does not
	// cover every one of them, and the emitted schema carries the same
	// list the caller passed.
	z.enum(values).meta({ enumDescriptions: docs }) as unknown as z.ZodEnum<
		z.util.ToEnum<T[number]>
	>;

/** How much of the tool surface the MCP server exposes to the model. */
