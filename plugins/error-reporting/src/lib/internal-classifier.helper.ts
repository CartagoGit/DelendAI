import type { McpVertexErrorCode } from './contracts/constants/error-codes.constant';
import { isMcpVertexErrorCode } from './contracts/constants/error-codes.constant';
import type {
	IssueClassification,
	SafeFailureClass,
} from './contracts/interfaces/reporter.interface';
import {
	extractSafeMcpFrameEvidence,
	packageIdFromSafeFrame,
	registerInternalPath,
	registerInternalRuntimePaths,
	resetInternalPathRegistry,
} from './frame-extractor.helper';
import { McpVertexInternalError } from './mcp-internal-error.helper';

const INTERNAL_BOUNDARY = Symbol.for(
	'@mcp-vertex/error-reporting/internal-boundary',
);

const componentIdFromFrame = (packageId: string, frameFile: string): string => {
	const prefix = `${packageId}/`;
	if (!frameFile.startsWith(prefix)) return frameFile;
	return frameFile.slice(prefix.length);
};

const internalErrorCodeOf = (
	error: unknown,
): McpVertexErrorCode | undefined => {
	if (error instanceof McpVertexInternalError) return error.code;
	if (typeof error !== 'object' || error === null) return undefined;
	const record = error as { mcpVertexErrorCode?: unknown };
	return isMcpVertexErrorCode(record.mcpVertexErrorCode)
		? record.mcpVertexErrorCode
		: undefined;
};

const packageIdOf = (
	error: unknown,
	frames: readonly { readonly file: string }[],
): string | undefined => {
	if (error instanceof McpVertexInternalError) return error.packageId;
	for (const frame of frames) {
		const packageId = packageIdFromSafeFrame(frame);
		if (packageId !== undefined) return packageId;
	}
	return undefined;
};

const componentIdOf = (
	error: unknown,
	packageId: string | undefined,
	frames: readonly { readonly file: string }[],
): string | undefined => {
	if (error instanceof McpVertexInternalError) return error.componentId;
	if (packageId === undefined) return undefined;
	const frame = frames[0];
	if (frame === undefined) return undefined;
	return componentIdFromFrame(packageId, frame.file);
};

export const classificationFromEvidence = (input: {
	readonly toolId?: string | undefined;
	readonly packageId?: string | undefined;
	readonly componentId?: string | undefined;
	readonly errorCode?: McpVertexErrorCode | undefined;
	readonly failureClass: SafeFailureClass;
}): IssueClassification => {
	const haystack = [
		input.toolId,
		input.packageId,
		input.componentId,
		input.errorCode,
		input.failureClass,
	]
		.filter((value) => value !== undefined && value !== '')
		.join(' ')
		.toUpperCase();

	if (haystack.includes('NOT_A_BUG')) return 'NOT_A_BUG';
	if (haystack.includes('PRIVACY')) return 'PRIVACY';
	if (haystack.includes('SECURITY') || haystack.includes('SECRET')) {
		return 'SECURITY';
	}
	if (haystack.includes('TOKEN')) return 'TOKEN_REGRESSION';
	if (haystack.includes('DOC')) return 'DOC_DRIFT';
	if (input.errorCode === 'INVALID_OPTIONS' || haystack.includes('CONFIG')) {
		return 'CONFIG_DRIFT';
	}
	if (haystack.includes('REGRESSION')) return 'REGRESSION';
	if (
		input.errorCode === 'PLUGIN_REGISTER_TIMEOUT' ||
		input.errorCode === 'PROCESS_TIMEOUT' ||
		haystack.includes('PERF') ||
		haystack.includes('TIMEOUT') ||
		haystack.includes('LATENCY')
	) {
		return 'PERFORMANCE';
	}
	return 'BUG';
};

export const markErrorAsInternalBoundary = <T extends object>(error: T): T => {
	Object.defineProperty(error, INTERNAL_BOUNDARY, {
		value: true,
		enumerable: false,
		configurable: true,
	});
	return error;
};

export const isMarkedInternalBoundary = (error: unknown): boolean =>
	typeof error === 'object' &&
	error !== null &&
	(error as Record<PropertyKey, unknown>)[INTERNAL_BOUNDARY] === true;

export const safeFailureClassOf = (error: unknown): SafeFailureClass => {
	if (error instanceof McpVertexInternalError) {
		if (error.code.includes('TIMEOUT')) return 'INTERNAL_TIMEOUT';
		if (error.code.includes('VALID')) return 'INTERNAL_VALIDATION_ERROR';
		return 'INTERNAL_TYPED_ERROR';
	}
	if (error instanceof Error) {
		if (error.name === 'TimeoutError') return 'INTERNAL_TIMEOUT';
		if (error.name.includes('Validation')) {
			return 'INTERNAL_VALIDATION_ERROR';
		}
		return 'INTERNAL_RUNTIME_ERROR';
	}
	return 'UNKNOWN_INTERNAL';
};

export const classificationOf = (input: {
	readonly toolId?: string | undefined;
	readonly packageId?: string | undefined;
	readonly componentId?: string | undefined;
	readonly errorCode?: McpVertexErrorCode | undefined;
	readonly failureClass: SafeFailureClass;
}): IssueClassification => {
	const hasPositiveEvidence =
		input.packageId !== undefined ||
		input.componentId !== undefined ||
		input.errorCode !== undefined;
	if (!hasPositiveEvidence) return 'UNKNOWN';
	return classificationFromEvidence(input);
};

export const classifyInternalError = (input: {
	readonly error: unknown;
	readonly toolId?: string | undefined;
}) => {
	const frameEvidence = extractSafeMcpFrameEvidence(input.error);
	const mcpFrames = frameEvidence.map((entry) => entry.frame);
	const hasMcpPackageFrame = frameEvidence.some(
		(entry) => entry.source === 'mcp-package',
	);
	const hasRegisteredPathFrame = frameEvidence.some(
		(entry) => entry.source === 'registered-internal-path',
	);
	const errorCode = internalErrorCodeOf(input.error);
	const failureClass = safeFailureClassOf(input.error);
	const packageId = packageIdOf(input.error, mcpFrames);
	const componentId = componentIdOf(input.error, packageId, mcpFrames);
	const boundaryMarked = isMarkedInternalBoundary(input.error);
	const isInternal =
		hasMcpPackageFrame ||
		hasRegisteredPathFrame ||
		input.error instanceof McpVertexInternalError ||
		errorCode !== undefined ||
		boundaryMarked;

	return {
		isInternal,
		classification: isInternal
			? classificationFromEvidence({
					toolId: input.toolId,
					packageId,
					componentId,
					errorCode,
					failureClass,
				})
			: 'UNKNOWN',
		failureClass,
		...(packageId !== undefined ? { packageId } : {}),
		...(componentId !== undefined ? { componentId } : {}),
		...(errorCode !== undefined ? { errorCode } : {}),
		mcpFrames,
		evidence: [
			...(hasMcpPackageFrame ? ['mcp-package-frame'] : []),
			...(hasRegisteredPathFrame ? ['registered-internal-path'] : []),
			...(input.error instanceof McpVertexInternalError
				? ['typed-internal-error']
				: []),
			...(errorCode !== undefined ? ['mcp-vertex-error-code'] : []),
			...(boundaryMarked ? ['internal-boundary'] : []),
		] as const,
	};
};

export const isMcpVertexInternal = (error: unknown): boolean =>
	classifyInternalError({ error }).isInternal;

export {
	registerInternalPath,
	registerInternalRuntimePaths,
	resetInternalPathRegistry,
};
