#!/usr/bin/env bun
export type TCouplingCategory =
	| 'import'
	| 'path'
	| 'plugin-name'
	| 'type'
	| 'message'
	| 'index-access';
export type TProposedDestination =
	| 'contract'
	| 'adapter'
	| 'composition'
	| 'intentional-compat';
export interface IBoundaryFindingRule {
	readonly file: string;
	readonly symbolOrLiteral: string;
	readonly category: TCouplingCategory;
	readonly destination: TProposedDestination;
	readonly needle: string;
	readonly note: string;
	/**
	 * Slice id (e.g. `S2`) that removed this coupling from
	 * `packages/core/src`. A resolved rule that no longer matches the
	 * tree is expected success; a resolved rule that STILL matches is a
	 * regression (the refactor did not actually land).
	 */
	readonly resolvedBy?: string;
}
export interface IBoundaryFinding extends IBoundaryFindingRule {
	readonly occurrences: number;
	readonly lines: readonly number[];
}
export interface IBoundaryCandidate {
	readonly file: string;
	readonly line: number;
	readonly content: string;
}
export interface IBoundaryScanResult {
	readonly findings: readonly IBoundaryFinding[];
	readonly unclassified: readonly IBoundaryCandidate[];
	readonly missing: readonly IBoundaryFindingRule[];
	readonly resolved: readonly IBoundaryFindingRule[];
	readonly regressions: readonly IBoundaryFindingRule[];
	readonly scannedFiles: number;
}
export declare const INVENTORY_RULES: readonly IBoundaryFindingRule[];
export declare const detectUnclassifiedCandidates: (
	relPath: string,
	text: string,
) => readonly IBoundaryCandidate[];
export declare const scanCoreProposalsBoundary: (
	repoRoot?: string,
) => Promise<IBoundaryScanResult>;
export declare const renderInventoryMarkdown: (
	result: Pick<
		IBoundaryScanResult,
		'findings' | 'unclassified' | 'missing' | 'resolved' | 'regressions'
	>,
) => string;
export declare const main: () => Promise<number>;
export declare const readCommittedInventory: () => Promise<string>;
