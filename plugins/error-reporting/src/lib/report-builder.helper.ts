import { MCP_VERTEX_VERSION } from '@delendai/core/version';
import {
	resolvePublicToolIdentity,
	type IToolIdentityRegistry,
} from '@delendai/core/public';

import type { McpVertexErrorCode } from './contracts/constants/error-codes.constant';
import type {
	ISafeMcpVertexReport,
	SafeFailureClass,
} from './contracts/interfaces/reporter.interface';
import {
	classificationFromEvidence,
	classifyInternalError,
} from './internal-classifier.helper';
import { McpVertexInternalError } from './mcp-internal-error.helper';
import {
	analyzeErrorOrigin,
	resolveFirstPartyLlmToolProvenance,
} from './origin-analyzer.helper';
import { signatureOf } from './signature.helper';
import { buildSyntheticExample } from './synthetic-example.builder';

import reporterPackageJson from '../../package.json';

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

const runtimeOf = (): 'node' | 'bun' | 'unknown' => {
	if ('Bun' in globalThis) return 'bun';
	if (typeof process !== 'undefined' && process.versions.node) return 'node';
	return 'unknown';
};

const platformFamilyOf = (): 'windows' | 'linux' | 'macos' | 'unknown' => {
	switch (process.platform) {
		case 'win32':
			return 'windows';
		case 'linux':
			return 'linux';
		case 'darwin':
			return 'macos';
		default:
			return 'unknown';
	}
};

const packageIdOf = (
	resolvedSpecifier: string,
	pluginName: string,
): string | undefined => {
	if (resolvedSpecifier.startsWith('@delendai/')) return resolvedSpecifier;
	if (/(^|\/)mcp-vertex\//i.test(resolvedSpecifier)) {
		return `@delendai/${pluginName}`;
	}
	return undefined;
};

export const inferLifecycleErrorPackage = (
	error: unknown,
): string | undefined => {
	if (!isRecord(error)) return undefined;
	if (
		typeof error.resolvedSpecifier === 'string' &&
		typeof error.pluginName === 'string'
	) {
		return packageIdOf(error.resolvedSpecifier, error.pluginName);
	}
	return undefined;
};

const safePathSegment = (value: string): string =>
	value.replace(/[^a-zA-Z0-9/_-]+/g, '-');

export const withSyntheticSafeStack = <T extends Error>(
	error: T,
	packageId: string,
	componentId: string,
): T => {
	error.stack = [
		`${error.name}: ${error.message}`,
		`    at ${safePathSegment(componentId)} (${packageId}/${safePathSegment(componentId)}.ts:1:1)`,
	].join('\n');
	return error;
};

export const extractObservedFailure = (
	result: unknown,
	error: unknown,
): unknown => {
	if (error !== undefined) return error;
	if (isRecord(result)) {
		if (
			isRecord(result.structuredContent) &&
			'error' in result.structuredContent
		) {
			return result.structuredContent;
		}
		if ('error' in result || result.isError === true) return result;
	}
	return undefined;
};

const lifecycleErrorCodeOf = (error: unknown): McpVertexErrorCode => {
	const phase =
		isRecord(error) && typeof error.phase === 'string'
			? error.phase
			: isRecord(error) && typeof error.hookName === 'string'
				? error.hookName
				: 'lifecycle';
	return phase === 'register' || phase === 'dependency'
		? 'PLUGIN_LOAD_FAILED'
		: 'HOOK_FAILED';
};

const lifecycleComponentIdOf = (error: unknown): string => {
	const phase =
		isRecord(error) && typeof error.phase === 'string'
			? error.phase
			: isRecord(error) && typeof error.hookName === 'string'
				? error.hookName
				: 'lifecycle';
	return `lifecycle/${phase}`;
};

const syntheticExampleOf = (input: {
	readonly packageId: string;
	readonly toolName: string;
	readonly toolSeed?: string | undefined;
	readonly errorCode?: McpVertexErrorCode | undefined;
	readonly failureClass: SafeFailureClass;
}) =>
	buildSyntheticExample({
		packageId: input.packageId,
		toolName: input.toolName,
		...(input.toolSeed !== undefined ? { toolSeed: input.toolSeed } : {}),
		errorCode: input.errorCode,
		failureClass: input.failureClass,
	});

export const asReportableError = (
	toolName: string,
	toolRegistry: Pick<IToolIdentityRegistry, 'get'>,
	error: unknown,
): unknown | undefined => {
	const origin = analyzeErrorOrigin({ toolName, toolRegistry, error });
	if (origin.origin === 'project') return undefined;
	if (origin.origin === 'provider') return undefined;
	if (origin.origin === 'environment') return undefined;
	if (classifyInternalError({ toolId: toolName, error }).isInternal) {
		return error;
	}
	const lifecyclePackageId = inferLifecycleErrorPackage(error);
	if (lifecyclePackageId !== undefined) {
		const componentId = lifecycleComponentIdOf(error);
		return withSyntheticSafeStack(
			new McpVertexInternalError({
				code: lifecycleErrorCodeOf(error),
				packageId: lifecyclePackageId,
				componentId,
				cause: error,
			}),
			lifecyclePackageId,
			componentId,
		);
	}
	if (origin.origin === 'llm-format') {
		const llmTool = resolveFirstPartyLlmToolProvenance(
			toolName,
			toolRegistry,
		);
		if (llmTool === undefined) return undefined;
		const componentId = `tools/${llmTool.safeToolId}/llm-format`;
		return withSyntheticSafeStack(
			new McpVertexInternalError({
				code: 'TOOL_EXECUTION_FAILED',
				packageId: llmTool.packageId,
				componentId,
				cause: error,
			}),
			llmTool.packageId,
			componentId,
		);
	}
	return undefined;
};

export const buildSafeReport = (input: {
	readonly toolName: string;
	readonly toolRegistry: Pick<IToolIdentityRegistry, 'get'>;
	readonly error: unknown;
}): ISafeMcpVertexReport | undefined => {
	const classified = classifyInternalError({
		toolId: input.toolName,
		error: input.error,
	});
	if (!classified.isInternal || classified.classification === 'UNKNOWN') {
		return undefined;
	}
	if (classified.mcpFrames.length === 0) return undefined;
	if (classified.packageId === undefined) return undefined;
	const identity = resolvePublicToolIdentity(
		input.toolName,
		input.toolRegistry,
	);
	const classification = classificationFromEvidence({
		...(identity.safeToolId !== undefined
			? { toolId: identity.safeToolId }
			: {}),
		packageId: classified.packageId,
		...(classified.componentId !== undefined
			? { componentId: classified.componentId }
			: {}),
		...(classified.errorCode !== undefined
			? { errorCode: classified.errorCode }
			: {}),
		failureClass: classified.failureClass,
	});
	const reportCore = {
		reporterVersion: reporterPackageJson.version,
		mcpVertexVersion: MCP_VERTEX_VERSION,
		packageId: classified.packageId,
		...(identity.safeToolId !== undefined
			? { safeToolId: identity.safeToolId }
			: {}),
		toolOwner: identity.owner,
		toolCategory: identity.category,
		...(classified.errorCode !== undefined
			? { errorCode: classified.errorCode }
			: {}),
		failureClass: classified.failureClass,
		classification,
		mcpFrames: classified.mcpFrames,
		environmentClass: {
			runtime: runtimeOf(),
			platformFamily: platformFamilyOf(),
		},
	};
	const syntheticExample = syntheticExampleOf({
		packageId: classified.packageId,
		toolName: input.toolName,
		toolSeed:
			identity.safeToolId ?? `${identity.owner}:${identity.category}`,
		errorCode: classified.errorCode,
		failureClass: classified.failureClass,
	});
	return {
		...reportCore,
		fingerprint: signatureOf({
			...reportCore,
			componentId: classified.componentId,
		}),
		...(syntheticExample !== undefined ? { syntheticExample } : {}),
	};
};
