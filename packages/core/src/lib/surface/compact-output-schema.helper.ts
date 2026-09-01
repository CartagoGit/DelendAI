// compact-output-schema: a shared, deliberately-permissive `outputSchema`
// for tools whose real response shape is expensive to declare in full.
//
// v00129 S1 (AUD-B01) — `outputSchema` is OPTIONAL in the MCP spec and its
// value to a model is marginal: the exact response shape matters *after*
// the call, and by then the model already has the real payload in
// `structuredContent`. Declaring the full nested Zod shape up front in
// `tools/list` pays real, recurring tokens for something the model rarely
// consults before calling. This factory returns the canonical minimal
// envelope hint (`{ ok, ... }` — see `tool-response.ts`) with
// `additionalProperties: true` (via `z.looseObject`), so the declared
// schema is honest ("an object comes back, shape not pinned here") without
// re-describing every field.
//
// IMPORTANT: this only prunes the *declared* schema sent in `tools/list`.
// It must never be used as the schema a tool validates its own response
// against at runtime — if a tool currently does `FullSchema.parse(value)`
// before returning, keep that full schema as a separate, un-exported
// internal constant and pass `compactOutputSchema()` to `registerTool`
// instead. The real response payload does not change; only what we
// advertise about its shape does.
//
// Deferred to later proposals (see v00129 non-goals): a shared `$defs`
// envelope referenced by every tool via `$ref`, published detail levels
// (full schema available on demand via `tool_details`), and schemas as
// MCP resources.

import z from 'zod';

export const compactOutputSchema = () =>
	z.looseObject({
		ok: z.boolean().optional(),
	});
