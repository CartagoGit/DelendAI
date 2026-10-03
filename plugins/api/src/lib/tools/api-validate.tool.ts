/**
 * f00130 S2 — `api_validate` tool.
 *
 * Validates a decoded JSON response against the selected success response
 * schema for one OpenAPI operation. The tool is read-only; when `specUrl`
 * is used it loads the spec through the allow-listed web-fetch engine or an
 * injected fetch seam in tests.
 */
import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';
import {
	summarizeFindings,
	toolError,
	toolJson,
	worstSeverity,
} from '@delendai/core/public';
import {
	webFetch,
	type IFetchLike,
	type IWebFetchResult,
} from '@delendai/web-fetch/public';

import { fetchAndParseSpec, parseOpenApi } from '../spec/openapi';
import type { IOpenApiOperation, IOpenApiSpec } from '../spec/openapi';
import {
	resolveResponseSchema,
	validateResponse,
} from '../validate/response-validator';

export interface IApiValidateToolOptions {
	readonly namespacePrefix: string;
	readonly spec?: IOpenApiSpec;
	readonly defaultAllowList?: readonly string[];
	readonly fetchImpl?: typeof webFetch;
	readonly specFetch?: IFetchLike;
}

const INPUT = z
	.object({
		operationId: z.string().min(1).max(200),
		response: z.unknown(),
		spec: z.unknown().optional(),
		specUrl: z.string().url().optional(),
		allowList: z.array(z.string()).min(1).optional(),
		timeoutMs: z.number().int().positive().optional(),
		maxBytes: z.number().int().positive().optional(),
	})
	.strict();

const FINDING = z.object({
	ruleId: z.string(),
	severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
	message: z.string(),
	location: z
		.object({
			file: z.string(),
			line: z.number().int().positive().optional(),
			endLine: z.number().int().positive().optional(),
		})
		.optional(),
	fix: z.string().optional(),
});

const OUTPUT = z.union([
	z.object({
		ok: z.literal(true),
		operationId: z.string(),
		findings: z.array(FINDING),
		summary: z.object({
			critical: z.number().int().nonnegative(),
			high: z.number().int().nonnegative(),
			medium: z.number().int().nonnegative(),
			low: z.number().int().nonnegative(),
			info: z.number().int().nonnegative(),
		}),
		worst: z.enum(['critical', 'high', 'medium', 'low', 'info', 'none']),
	}),
	z.object({
		ok: z.literal(false),
		error: z.object({
			reason: z.string(),
			nextAction: z.string().optional(),
		}),
	}),
]);

const isParsedSpec = (value: unknown): value is IOpenApiSpec => {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return false;
	}
	return 'operations' in value;
};

const installHint = (reason: string, nextAction: string) =>
	toolError(reason, nextAction);

const resolveSpec = async (
	args: z.infer<typeof INPUT>,
	options: IApiValidateToolOptions,
): Promise<
	{ spec: IOpenApiSpec } | { error: ReturnType<typeof toolError> }
> => {
	if (args.spec !== undefined) {
		return {
			spec: isParsedSpec(args.spec)
				? args.spec
				: parseOpenApi(args.spec as object),
		};
	}
	if (args.specUrl !== undefined) {
		const allowList = args.allowList ?? options.defaultAllowList;
		if (allowList === undefined || allowList.length === 0) {
			return {
				error: installHint(
					'specUrl requires an allowList.',
					'Pass `allowList: ["api.example.com"]` or pre-load `spec` inline.',
				),
			};
		}
		if (options.specFetch !== undefined) {
			const loaded = await fetchAndParseSpec({
				url: args.specUrl,
				allowList,
				fetch: options.specFetch,
				...(args.timeoutMs === undefined
					? {}
					: { timeoutMs: args.timeoutMs }),
				...(args.maxBytes === undefined
					? {}
					: { maxBytes: args.maxBytes }),
			});
			return { spec: loaded.spec };
		}
		const fetchResult: IWebFetchResult = await (
			options.fetchImpl ?? webFetch
		)({
			url: args.specUrl,
			allowList,
			...(args.timeoutMs === undefined
				? {}
				: { timeoutMs: args.timeoutMs }),
			...(args.maxBytes === undefined ? {} : { maxBytes: args.maxBytes }),
		});
		if (!fetchResult.ok) {
			return {
				error: installHint(
					`specUrl fetch rejected: ${fetchResult.reason}${fetchResult.detail === undefined ? '' : ` (${fetchResult.detail})`}`,
					'Check the `allowList` / `specUrl`, or pass `spec` inline.',
				),
			};
		}
		return { spec: parseOpenApi(fetchResult.body) };
	}
	if (options.spec !== undefined) return { spec: options.spec };
	return {
		error: installHint(
			'api_validate needs a spec or specUrl.',
			'Pass `spec` (inline object) or `specUrl` (URL + allowList).',
		),
	};
};

const findOperation = (
	spec: IOpenApiSpec,
	operationId: string,
): IOpenApiOperation | undefined => spec.operations[operationId];

export const buildApiValidateToolRegistration = (
	options: IApiValidateToolOptions,
): IToolRegistration => ({
	id: 'api_validate',
	tags: ['api', 'openapi', 'contract', 'validation'],
	summary: 'Validate an HTTP response against an OpenAPI response schema.',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_api_validate`,
			{
				description:
					'Validate a decoded JSON response against an OpenAPI success response schema. Accepts an inline spec or an allow-listed `specUrl`; returns normalized findings for required fields, type mismatches, enum drift, format errors and extra properties on closed objects.',
				inputSchema: INPUT,
				outputSchema: OUTPUT,
			},
			async (args: z.infer<typeof INPUT>) => {
				const loaded = await resolveSpec(args, options);
				if ('error' in loaded) return loaded.error;
				const spec = loaded.spec;
				const operation = findOperation(spec, args.operationId);
				if (operation === undefined) {
					return installHint(
						`operationId "${args.operationId}" not in spec.`,
						`Available operations: ${Object.keys(spec.operations).join(', ') || '(none)'}.`,
					);
				}
				const schema = resolveResponseSchema(operation);
				if (schema === undefined) {
					return installHint(
						`operationId "${args.operationId}" has no success response schema.`,
						'Add a JSON success response schema to the OpenAPI spec or choose another operation.',
					);
				}
				try {
					const findings = validateResponse(
						operation,
						args.response,
						{
							schema,
						},
					);
					return toolJson({
						ok: true,
						operationId: operation.operationId,
						findings,
						summary: summarizeFindings(findings),
						worst: worstSeverity(findings) ?? 'none',
					});
				} catch (error) {
					return installHint(
						(error as Error).message,
						'Use a simpler schema surface or extend the validator before relying on oneOf/anyOf.',
					);
				}
			},
		);
	},
});

export const buildApiValidateToolRegistrations = (
	options: IApiValidateToolOptions,
): readonly IToolRegistration[] => [buildApiValidateToolRegistration(options)];
