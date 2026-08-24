import type { ISafeMcpFrame } from './safe-frame.interface';

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
	readonly context?: Readonly<Record<string, SafeScalar>> | undefined;
}

export interface IEnvironmentClass {
	readonly runtime: 'node' | 'bun' | 'unknown';
	readonly platformFamily: 'windows' | 'linux' | 'macos' | 'unknown';
}

export interface ISafeMcpVertexReport {
	readonly reporterVersion: string;
	readonly mcpVertexVersion: string;
	readonly packageId: string;
	readonly toolId?: string | undefined;
	readonly errorCode?: string | undefined;
	readonly failureClass: SafeFailureClass;
	readonly classification: IssueClassification;
	readonly fingerprint: string;
	readonly mcpFrames: readonly ISafeMcpFrame[];
	readonly syntheticExample?: ISafeSyntheticExample | undefined;
	readonly environmentClass?: IEnvironmentClass | undefined;
}

export const isSafeScalar = (value: unknown): value is SafeScalar => {
	if (
		typeof value === 'string' ||
		typeof value === 'number' ||
		typeof value === 'boolean' ||
		value === null
	) {
		return true;
	}
	if (Array.isArray(value))
		return value.every((entry) => isSafeScalar(entry));
	if (typeof value !== 'object' || value === null) return false;
	if (value instanceof Error) return false;
	if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) return false;
	for (const entry of Object.values(value)) {
		if (!isSafeScalar(entry)) return false;
	}
	return true;
};

export class McpVertexInternalError extends Error {
	readonly code: string;
	readonly packageId: string;
	readonly componentId: string;
	readonly safeContext?: Readonly<Record<string, SafeScalar>> | undefined;

	constructor(input: {
		readonly code: string;
		readonly packageId: string;
		readonly componentId: string;
		readonly safeContext?: Readonly<Record<string, SafeScalar>> | undefined;
		readonly message?: string | undefined;
		readonly cause?: unknown;
	}) {
		super(input.message ?? input.code, {
			...(input.cause !== undefined ? { cause: input.cause } : {}),
		});
		this.name = 'McpVertexInternalError';
		this.code = input.code;
		this.packageId = input.packageId;
		this.componentId = input.componentId;
		if (
			input.safeContext !== undefined &&
			!isSafeScalar(input.safeContext)
		) {
			throw new TypeError(
				'McpVertexInternalError.safeContext must contain only SafeScalar values',
			);
		}
		this.safeContext = input.safeContext;
	}
}

export interface ISafeReporterConfig {
	readonly targetRepo: string;
	readonly labels: readonly string[];
	readonly workspaceRootAbs: string;
}

export interface ISafeReporter {
	submitSafeReport(
		report: ISafeMcpVertexReport,
		exec?: IIssueExec,
	): Promise<ISubmitIssueOutcome>;
}

export interface ISubmitIssueOutcome {
	readonly ok: boolean;
	readonly reason: string;
	readonly issueNumber?: number | undefined;
	readonly issueUrl?: string | undefined;
}
