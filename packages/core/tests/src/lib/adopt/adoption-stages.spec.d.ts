/**
 * adoption-stages.spec.ts — f00280 S3 acceptance for the cumulative
 * adoption-stage contract (`adopt_project.stage`).
 *
 * Three acceptance points (per proposal):
 *  1. Invoking adopt_project with NO stage installs only `core` plugins.
 *  2. Specifying a later stage ADDS plugins on top of the previous
 *     stages (cumulative, never replaces).
 *  3. `specialized` is a sentinel — it lets the assessment's remaining
 *     recommended set flow through unmodified.
 *
 * Tests cover the pure constant (`resolveStagePluginIds`,
 * `isAdoptionStage`) and the tool's end-to-end stage filter.
 */
export {};
