#!/usr/bin/env bun
/**
 * Group of proposal files that share the same `id:` in their frontmatter.
 * `a00044` H5 (a00044 robustness audit): the previous lint only ever checked
 * each file in isolation, so two `.md` files claiming `id: f00058` (one in
 * `done/`, one in `ready/`) sailed through `bun run validate` without a
 * single warning. This struct is the per-id collision payload surfaced by
 * {@link detectDuplicateProposalIds}.
 */
export interface IDuplicateProposalIdGroup {
	readonly id: string;
	readonly absPaths: readonly string[];
}
/**
 * Walk `files` and group them by the `id:` field in their frontmatter.
 * Returns only the groups that have >= 2 members — a single-occurrence
 * `id:` is the expected case and is omitted from the result.
 *
 * Pure over its inputs (filesystem + the list of abs paths); does NOT
 * recurse into subdirectories — pass an already-walked list. Reads
 * each file's first ~4 KiB because frontmatter always lives in the
 * first 100 lines or so.
 */
export declare const detectDuplicateProposalIds: (
	files: readonly string[],
	proposalsDirAbs: string,
) => Promise<readonly IDuplicateProposalIdGroup[]>;
export interface ILintProposalsSummary {
	readonly filesChecked: number;
	readonly legacySkipped: number;
	readonly fatalErrors: number;
	readonly duplicateIds: readonly IDuplicateProposalIdGroup[];
	readonly ok: boolean;
}
export declare const lintProposalsDir: (
	proposalsDirAbs: string,
) => Promise<ILintProposalsSummary>;
