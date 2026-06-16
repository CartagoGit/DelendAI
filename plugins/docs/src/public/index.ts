/**
 * Public surface of `@cartago-git/mcp-docs`. The default export (in
 * `../index.ts`) is the loadable `IMcpPlugin`; this barrel exposes the
 * docs engine + tool builder for programmatic reuse.
 */
export { default } from '../index';

export { listDocs, readDoc, extractTitle, DEFAULT_DOC_ROOTS } from '../lib/engine';
export type { IDocEntry, IDocContent, IDocsOptions } from '../lib/engine';
export { buildDocsToolRegistrations } from '../lib/tools';
export type { IDocsToolOptions } from '../lib/tools';
