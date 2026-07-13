/**
 * The title prefix under which `memory_compact` persists a session digest
 * (`session-digest:<topic>`). Single-sourced here so the writer
 * (`compact.tool.ts`) and the reader (`session-digest-recall.ts`) agree on
 * the exact convention without risk of drift (f00090 S3).
 */
export const SESSION_DIGEST_TITLE_PREFIX = 'session-digest:';
