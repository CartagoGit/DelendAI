/**
 * build-erd.ts — f00132 S2: thin re-export of the database plugin's
 * mermaid ERD builder so the diagram plugin owns one entry point
 * for ERD rendering. The database plugin is the source of truth
 * for the schema type and the renderer; the diagram plugin only
 * composes them into a tool.
 *
 * Adding a `wrapErd` here would be premature — `buildMermaidEr` is
 * already a stable, pure, deterministic function. The diagram
 * tool re-uses it as-is. This module exists so future ERD-related
 * transformations (e.g. annotating tables with owner, last-touched)
 * have a single place to live.
 */

export { buildMermaidEr } from '@delendai/database/public';
export type { IDatabaseSchema } from '@delendai/database/public';
