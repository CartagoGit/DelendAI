/**
 * Secret redaction for memory notes (M11).
 *
 * The implementation now lives in core (`@mcp-vertex/core/public`) so every
 * persistent store shares one redactor (M23). This module re-exports it to keep
 * memory's internal and public import paths stable.
 */
export { redactSecrets } from '@mcp-vertex/core/public';
export type { IRedactResult } from '@mcp-vertex/core/public';
