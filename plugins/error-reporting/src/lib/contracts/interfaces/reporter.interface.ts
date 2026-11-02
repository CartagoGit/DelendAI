import type { ISafeMcpFrame } from './safe-frame.interface';
import type {
	SafeToolCategory,
	SafeToolId,
	ToolOwner,
} from '@delendai/core/public';
import type { SafeReporterTransportFailureCode } from '../constants/safe-reporter-failure-codes.constant';
import type { DelendaiErrorCode } from '../constants/error-codes.constant';
import {
	DelendaiInternalError,
	isSafeScalar,
} from '../../mcp-internal-error.helper';

/** Injected exec seam so the network call is unit-testable. */
export interface IIssueExecResult {
	readonly ok: boolean;
	readonly code: number;
	readonly stdout: string;
	readonly stderr: string;
}

export type IIssueExec = (
	argv: readonly string[],
	options?: { readonly cwd?: string | undefined },
) => Promise<IIssueExecResult>;

export const ISSUE_CLASSIFICATIONS = [
	'BUG',
	'REGRESSION',
	'SECURITY',
	'PRIVACY',
	'PERFORMANCE',
	'TOKEN_REGRESSION',
	'DOC_DRIFT',
	'CONFIG_DRIFT',
	'DUPLICATE',
	'NOT_A_BUG',
	'DESIGN_DECISION',
	'PRODUCT_DECISION',
	'NEEDS_REPRODUCTION',
	'UNKNOWN',
] as const;

export type IssueClassification = (typeof ISSUE_CLASSIFICATIONS)[number];

export const SAFE_FAILURE_CLASSES = [
	'INTERNAL_TYPED_ERROR',
	'INTERNAL_RUNTIME_ERROR',
	'INTERNAL_VALIDATION_ERROR',
	'INTERNAL_TIMEOUT',
	'UNKNOWN_INTERNAL',
] as const;

export type SafeFailureClass = (typeof SAFE_FAILURE_CLASSES)[number];

export type SafeScalar =
	| string
	| number
	| boolean
	| null
	| readonly SafeScalar[]
	| { readonly [key: string]: SafeScalar };

export interface ISafeSyntheticExample {
	readonly summary: string;
	readonly source: 'schema-fixture' | 'fixture-fallback';
	readonly fixtureId: string;
	readonly fixtureDomain: string;
	readonly argumentType: 'object' | 'array' | 'scalar' | 'unknown';
	readonly context?: Readonly<Record<string, SafeScalar>> | undefined;
	readonly payload?: SafeScalar | undefined;
}

export interface IEnvironmentClass {
	readonly runtime: 'node' | 'bun' | 'unknown';
	readonly platformFamily: 'windows' | 'linux' | 'macos' | 'unknown';
}

export interface ISafeDelendaiReport {
	readonly reporterVersion: string;
	readonly delendaiVersion: string;
	readonly packageId: string;
	readonly safeToolId?: SafeToolId | undefined;
	readonly toolOwner: ToolOwner;
	readonly toolCategory: SafeToolCategory;
	readonly errorCode?: DelendaiErrorCode | undefined;
	readonly failureClass: SafeFailureClass;
	readonly classification: IssueClassification;
	readonly fingerprint: string;
	readonly mcpFrames: readonly ISafeMcpFrame[];
	readonly syntheticExample?: ISafeSyntheticExample | undefined;
	readonly environmentClass?: IEnvironmentClass | undefined;
}

export { DelendaiInternalError, isSafeScalar };

export interface ISafeReporterConfig {
	readonly targetRepo: string;
	readonly labels: readonly string[];
	readonly workspaceRootAbs: string;
	readonly networkProbe?: (() => Promise<boolean>) | undefined;
}

export interface ISafeReporter {
	submitSafeReport(
		report: ISafeDelendaiReport,
		exec?: IIssueExec,
	): Promise<ISubmitIssueOutcome>;
}

export interface ISubmitIssueSuccessOutcome {
	readonly ok: true;
	readonly reason: 'created';
	readonly issueNumber: number;
	readonly issueUrl?: string | undefined;
}

export interface ISubmitIssueFailureOutcome {
	readonly ok: false;
	readonly reason: string;
	readonly failureCode: SafeReporterTransportFailureCode;
}

export type ISubmitIssueOutcome =
	| ISubmitIssueSuccessOutcome
	| ISubmitIssueFailureOutcome;
