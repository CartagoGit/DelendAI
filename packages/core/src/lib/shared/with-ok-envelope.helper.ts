// with-ok-envelope: the output schema of a tool that answers through
// `toolOk`, derived from the payload schema instead of restated by hand.
//
// `toolOk(data)` puts `{ ok: true, ...data }` on the wire. A client that
// has listed tools validates `structuredContent` against the advertised
// JSON schema, and that schema forbids undeclared keys, so every tool
// whose output schema forgot `ok` rejected its own successful answers
// with `-32602 ... must NOT have additional properties`. Seven tools were
// fixed one by one by declaring `ok` beside their payload fields; two
// more (`proposals_db_rebuild`, `proposals_db_reconcile`) were still
// failing, because nothing made forgetting impossible.
//
// Wrap the payload schema at registration instead:
//
//   outputSchema: withOkEnvelope(dbRebuildOutputSchema)
//
// The payload schema stays what the service returns, and the envelope is
// declared exactly once, here, next to the helper that writes it.

import z from 'zod';

export const withOkEnvelope = <TPayload extends z.ZodObject>(
	payload: TPayload,
) => payload.extend({ ok: z.literal(true) });
