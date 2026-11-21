/**
 * Secret redaction for memory notes.
 *
 * The implementation now lives in core (`@delendai/core/public`) so every
 * persistent store shares one redactor. This module re-exports it to keep
 * memory's internal and public import paths stable.
 */
export { redactSecrets } from '@delendai/core/public';
export type { IRedactResult } from '@delendai/core/public';
