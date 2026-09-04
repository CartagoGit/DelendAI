#!/usr/bin/env bun
export type TBoundaryMatchKind = 'import' | 'path' | 'literal';
export type TBoundaryExceptionClass =
	| 'adapter'
	| 'compatibility'
	| 'host-composition';
export interface ICoreProposalsBoundaryException {
	readonly file: string;
	readonly needle: string;
	readonly until: string;
	readonly classification: TBoundaryExceptionClass;
	readonly reason: string;
	readonly kind?: TBoundaryMatchKind;
}
export interface ICoreProposalsBoundaryMatch {
	readonly absPath: string;
	readonly relPath: string;
	readonly line: number;
	readonly kind: TBoundaryMatchKind;
	readonly token: string;
	readonly snippet: string;
}
export interface ICoreProposalsBoundaryViolation
	extends ICoreProposalsBoundaryMatch {
	readonly code: 'unclassified' | 'expired-exception';
	readonly exception?: ICoreProposalsBoundaryException;
}
export interface ICoreProposalsBoundaryScanResult {
	readonly scannedFiles: number;
	readonly matches: readonly ICoreProposalsBoundaryMatch[];
	readonly allowed: readonly {
		readonly match: ICoreProposalsBoundaryMatch;
		readonly exception: ICoreProposalsBoundaryException;
	}[];
	readonly violations: readonly ICoreProposalsBoundaryViolation[];
	readonly expired: readonly ICoreProposalsBoundaryViolation[];
}
export declare const CORE_PROPOSALS_BOUNDARY_EXCEPTIONS: readonly ICoreProposalsBoundaryException[];
export declare const collectBoundaryMatches: (
	text: string,
	absPath: string,
	relPath: string,
) => readonly ICoreProposalsBoundaryMatch[];
export declare const applyBoundaryExceptions: (
	matches: readonly ICoreProposalsBoundaryMatch[],
	exceptions?: readonly ICoreProposalsBoundaryException[],
	now?: Date,
) => Pick<
	ICoreProposalsBoundaryScanResult,
	'allowed' | 'violations' | 'expired'
>;
export declare const scanCoreProposalsBoundaryLint: (
	root?: string,
	scanRoot?: string,
	now?: Date,
) => Promise<ICoreProposalsBoundaryScanResult>;
export declare const formatReport: (
	result: Pick<
		ICoreProposalsBoundaryScanResult,
		'scannedFiles' | 'allowed' | 'violations' | 'expired'
	>,
) => string;
export declare const main: () => Promise<number>;
