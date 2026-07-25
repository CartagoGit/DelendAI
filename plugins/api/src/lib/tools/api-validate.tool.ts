import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolError, toolJson } from '@mcp-vertex/core/public';

import { parseOpenApi } from '../spec/openapi';
import type { IOpenApiOperation, IOpenApiSpec } from '../spec/openapi';
import { validateResponse } from '../validate';

export interface IApiValidateToolOptions {
	readonly namespacePrefix: string;
	readonly spec?: IOpenApiSpec;
}

const INPUT = z
	.object({
		operationId: z.string().min(1).max(200).optional(),
		method: z
			.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])
			.optional(),
		path: z.string().min(1).optional(),
		responseBody: z.unknown(),
		statusCode: z.number().int().min(100).max(599).optional(),
		spec: z.unknown().optional(),
	})
	.strict()
	.superRefine((value, ctx) => {
		const hasOperationId = value.operationId !== undefined;
		const hasMethodPath =
			value.method !== undefined || value.path !== undefined;
		if (
			!hasOperationId &&
			!(value.method !== undefined && value.path !== undefined)
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'Provide `operationId` or both `method` and `path`.',
			});
		}
		if (hasOperationId && hasMethodPath) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message:
					'Use either `operationId` or `method` + `path`, not both.',
			});
		}
	});

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

const OUTPUT = z.object({
	ok: z.literal(true),
	operationId: z.string(),
	mismatches: z.array(FINDING),
	summary: z.object({
		critical: z.number().int().nonnegative(),
		high: z.number().int().nonnegative(),
		medium: z.number().int().nonnegative(),
		low: z.number().int().nonnegative(),
		info: z.number().int().nonnegative(),
	}),
	worst: z.enum(['critical', 'high', 'medium', 'low', 'info', 'none']),
});

const isParsedSpec = (value: unknown): value is IOpenApiSpec => {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return false;
	}
	return 'operations' in value;
};

const findOperation = (
	spec: IOpenApiSpec,
	args: z.infer<typeof INPUT>,
): IOpenApiOperation | undefined => {
	if (args.operationId !== undefined)
		return spec.operations[args.operationId];
	return Object.values(spec.operations).find(
		(operation) =>
			operation.method === args.method && operation.path === args.path,
	);
};

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
					'Validate a parsed or stringified JSON response body against the matched OpenAPI response schema. Emits normalized findings for missing required fields, extra fields and type mismatches.',
				inputSchema: INPUT,
				outputSchema: OUTPUT,
			},
			async (args: z.infer<typeof INPUT>) => {
				const spec =
					args.spec !== undefined
						? isParsedSpec(args.spec)
							? args.spec
							: parseOpenApi(args.spec as object)
						: options.spec;
				if (spec === undefined) {
					return toolError(
						'api_validate needs a spec.',
						'Pass `spec` inline or pre-load the spec in the plugin options.',
					);
				}
				const operation = findOperation(spec, args);
				if (operation === undefined) {
					return toolError(
						'Could not match the requested OpenAPI operation.',
						'Check `operationId`, or pass the exact `method` + `path` pair from the spec.',
					);
				}
				const statusCode = args.statusCode ?? 200;
				const hasSchema = operation.responses.some(
					(response) =>
						(response.status === String(statusCode) ||
							response.status === 'default') &&
						response.schema !== undefined,
				);
				if (!hasSchema) {
					return toolError(
						`No response schema found for status ${statusCode}.`,
						'Check the OpenAPI responses block or pass the expected `statusCode`.',
					);
				}
				return toolJson(
					validateResponse(operation, args.responseBody, statusCode),
				);
			},
		);
	},
});
