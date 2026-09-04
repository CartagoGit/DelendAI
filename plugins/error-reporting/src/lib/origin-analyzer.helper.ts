import {
	resolvePublicToolIdentity,
	type IToolIdentityRegistry,
} from '@delendai/core/public';

import { classifyInternalError } from './internal-classifier.helper';

const FIRST_PARTY_LLM_SAFE_TOOL_IDS = new Set([
	'@delendai/orchestrator-runner.invoke',
	'@delendai/auto-agent-selector.auto_run',
]);

const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_REQUEST_TIMEOUT = 408;
const HTTP_CONFLICT = 409;
const HTTP_RATE_LIMITED = 429;
const COMMAND_NOT_FOUND_EXIT_CODE = 127;
const PROVIDER_HTTP_STATUSES = [
	HTTP_UNAUTHORIZED,
	HTTP_FORBIDDEN,
	HTTP_REQUEST_TIMEOUT,
	HTTP_CONFLICT,
	HTTP_RATE_LIMITED,
] as const;
const PROVIDER_HTTP_STATUS_PATTERN =
	PROVIDER_HTTP_STATUSES.map(String).join('|');

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

const isLifecycleInfo = (
	value: unknown,
): value is {
	pluginName: string;
	resolvedSpecifier: string;
	phase?: string;
	hookName?: string;
	error: unknown;
	missingDependencies?: readonly string[];
	toolName?: string;
	args?: unknown;
	elapsedMs?: number;
} =>
	isRecord(value) &&
	typeof value.pluginName === 'string' &&
	typeof value.resolvedSpecifier === 'string' &&
	'error' in value;

const textValuesOf = (value: unknown): string[] => {
	if (typeof value === 'string') return [value];
	if (value instanceof Error) {
		return [value.message, value.name, value.stack ?? ''].filter(Boolean);
	}
	if (!isRecord(value)) return [];
	const parts: string[] = [];
	for (const key of ['message', 'reason', 'code', 'userMessage', 'stderr']) {
		const entry = value[key];
		if (typeof entry === 'string') parts.push(entry);
	}
	if (isRecord(value.error)) {
		parts.push(...textValuesOf(value.error));
	}
	if (isRecord(value.structuredContent)) {
		parts.push(...textValuesOf(value.structuredContent));
	}
	return parts;
};

const anyMatches = (
	parts: readonly string[],
	patterns: readonly RegExp[],
): boolean =>
	patterns.some((pattern) => parts.some((part) => pattern.test(part)));

export const resolveFirstPartyLlmToolProvenance = (
	toolName: string | undefined,
	toolRegistry: Pick<IToolIdentityRegistry, 'get'>,
):
	| {
			readonly packageId: string;
			readonly safeToolId: string;
	  }
	| undefined => {
	if (typeof toolName !== 'string') return undefined;
	const identity = resolvePublicToolIdentity(toolName, toolRegistry);
	if (identity.owner !== 'mcp-vertex') return undefined;
	if (identity.safeToolId === undefined) return undefined;
	if (!FIRST_PARTY_LLM_SAFE_TOOL_IDS.has(identity.safeToolId)) {
		return undefined;
	}
	const packageSeparatorIndex = identity.safeToolId.lastIndexOf('.');
	if (packageSeparatorIndex <= 0) return undefined;
	return {
		packageId: identity.safeToolId.slice(0, packageSeparatorIndex),
		safeToolId: identity.safeToolId,
	};
};

const isFirstPartySpecifier = (specifier: string): boolean =>
	specifier.startsWith('@delendai/') ||
	/(^|\/)mcp-vertex\/(plugins|packages)\//i.test(specifier);

const providerPatterns = [
	new RegExp(
		`\\bapi responded\\s*(${PROVIDER_HTTP_STATUS_PATTERN}|5\\d\\d)\\b`,
		'i',
	),
	/\brate limit/i,
	/\bunauthori[sz]ed\b/i,
	/\bquota\b/i,
	/\bmodel unavailable\b/i,
	/\bprovider\b/i,
];

const llmFormatPatterns = [
	/\bLLM_FORMAT\b/i,
	/\binvalid request body\b/i,
	/\bschema validation\b/i,
	/\binvalid json\b/i,
	/\bmalformed payload\b/i,
	/\bmalformed request\b/i,
	/\bpayload.*schema\b/i,
];

const environmentPatterns = [
	/\bENOENT\b/i,
	/\bEAI_AGAIN\b/i,
	/\bECONNREFUSED\b/i,
	/\bfetch failed\b/i,
	/\bnetwork\b/i,
	/\bnot installed\b/i,
	/\bcommand not found\b/i,
	/\bspawn .* ENOENT\b/i,
	/\btimeout\b/i,
];

export const analyzeErrorOrigin = (input: {
	readonly toolName?: string;
	readonly toolRegistry: Pick<IToolIdentityRegistry, 'get'>;
	readonly error: unknown;
}): {
	origin: 'internal' | 'project' | 'llm-format' | 'provider' | 'environment';
	reason: string;
} => {
	if (isLifecycleInfo(input.error)) {
		if (isFirstPartySpecifier(input.error.resolvedSpecifier)) {
			return {
				origin: 'internal',
				reason: 'first-party plugin lifecycle surface failed inside mcp-vertex',
			};
		}
		return {
			origin: 'project',
			reason: 'plugin lifecycle failure was not proven to be first-party',
		};
	}

	const classified = classifyInternalError({
		toolId: input.toolName,
		error: input.error,
	});
	if (classified.isInternal) {
		return {
			origin: 'internal',
			reason: 'positive internal evidence from mcp-vertex error typing or frames',
		};
	}

	const parts = textValuesOf(input.error);
	if (isRecord(input.error)) {
		if (input.error.timedOut === true || input.error.unavailable === true) {
			return {
				origin: 'environment',
				reason: 'process or transport failed due to host environment conditions',
			};
		}
		if (
			typeof input.error.code === 'number' &&
			input.error.code === COMMAND_NOT_FOUND_EXIT_CODE
		) {
			return {
				origin: 'environment',
				reason: 'binary or executable was unavailable in the host environment',
			};
		}
	}
	if (
		resolveFirstPartyLlmToolProvenance(
			input.toolName,
			input.toolRegistry,
		) !== undefined &&
		anyMatches(parts, llmFormatPatterns)
	) {
		return {
			origin: 'llm-format',
			reason: 'provider rejected a malformed payload generated by an mcp-vertex LLM tool',
		};
	}
	if (anyMatches(parts, providerPatterns)) {
		return {
			origin: 'provider',
			reason: 'failure came from the external provider, not from mcp-vertex construction',
		};
	}
	if (anyMatches(parts, environmentPatterns)) {
		return {
			origin: 'environment',
			reason: 'failure came from the host environment or network boundary',
		};
	}
	return {
		origin: 'project',
		reason: 'no positive mcp-vertex evidence was found, so the failure is treated as host/project-local',
	};
};
