/**
 * call-writes.constant.ts — how a server says a tool's writes were not
 * committed, so a client that starts it can pass the sentence on.
 */

/** The start of the stderr line a server writes when that commit fails. */
export const CALL_WRITES_NOT_COMMITTED = '[delendai] delendai could not commit';
