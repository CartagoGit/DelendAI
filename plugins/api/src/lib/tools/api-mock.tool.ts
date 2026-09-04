/**
 * f00130 S3 — `api_mock` tool.
 *
 * Generates a deterministic example response for one OpenAPI
 * operation directly from the parsed spec — no live server, no
 * network. Useful for local development, contract-test seeds and
 * documentation stubs.
 *
 * Inputs:
 *   - `operationId` (required) or `method` + `path`.
 *   - `statusCode?` to pick a specific response (defaults to the
 *     "happy path" — the first 2xx, or `default`).
 *   - `spec?` (inline parsed) or `specUrl?` (allow-listed fetch).
 *   - `count?` to generate a list of `count` unique mocks (default 1).
 *
 * Output is a compact JSON envelope: `{ ok, operationId, response }`
 * where `response` carries the chosen status, content type, and the
 * generated body. Errors are surfaced through the canonical
 * `toolError` shape.
 */
import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';
import { toolError, toolJson } from '@delendai/core/public';

import {
	generateOperationMock,
	mockHappyPath,
	mockResponseForStatus,
	type IMockedResponse,
} from '../mock/mock-engine';
import { parseOpenApi } from '../spec/openapi';
import type { IOpenApiOperation, IOpenApiSpec } from '../spec/openapi';

export interface IApiMockToolOptions {
	readonly namespacePrefix: string;
	readonly defaultAllowList?: readonly string[];
	readonly specFetch?: (args: {
		url: string;
		allowList: readonly string[];
		timeoutMs?: number;
		maxBytes?: number;
	}) => Promise<{ body: string }>;
}

const INPUT = z
	.object({
		operationId: z.string().min(1).max(200).optional(),
		method: z
			.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])
			.optional(),
		path: z.string().min(1).optional(),
		statusCode: z.number().int().min(100).max(599).optional(),
		count: z.number().int().min(1).max(20).optional(),
		randomize: z.boolean().optional(),
		spec: z.unknown().optional(),
		specUrl: z.string().url().optional(),
		allowList: z.array(z.string().min(1)).optional(),
		timeoutMs: z.number().int().positive().optional(),
		maxBytes: z.number().int().positive().optional(),
	})
	.strict();

const MOCKED_RESPONSE = z.object({
	status: z.string(),
	contentType: z.string(),
	body: z.unknown(),
});

const OUTPUT = z.object({
	ok: z.literal(true),
	operationId: z.string(),
	method: z.string(),
	path: z.string(),
	selectedStatus: z.string(),
	selectedBody: z.unknown(),
	allResponses: z.array(MOCKED_RESPONSE),
	count: z.number().int().nonnegative(),
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

const deterministicLabel = (operationId: string, index: number): number => {
	let h = 2166136261;
	const text = `${operationId}:${index}`;
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
};

export const buildApiMockToolRegistration = (
	options: IApiMockToolOptions,
): IToolRegistration => ({
	id: 'api_mock',
	tags: ['api', 'openapi', 'mock', 'docs'],
	summary:
		'Generate an example response for one OpenAPI operation directly from the spec.',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_api_mock`,
			{
				description:
					'Read-only. Picks the requested response (or the happy path) and returns a deterministic example body for the matching OpenAPI operation. Pass `count` to generate a list of distinct samples.',
				inputSchema: INPUT,
				outputSchema: OUTPUT,
			},
			async (args) => {
				const parsed = INPUT.safeParse(args);
				if (!parsed.success) {
					return toolError(
						'invalid-arguments',
						parsed.error.issues
							.map((i) => `${i.path.join('.')}: ${i.message}`)
							.join('; ') || 'Invalid input.',
					);
				}
				const input = parsed.data;
				if (
					input.operationId === undefined &&
					(input.method === undefined || input.path === undefined)
				) {
					return toolError(
						'invalid-arguments',
						'Provide `operationId` or both `method` and `path`.',
					);
				}

				let spec: IOpenApiSpec | undefined;
				if (input.spec !== undefined) {
					spec = isParsedSpec(input.spec)
						? input.spec
						: parseOpenApi(input.spec as object);
				} else if (input.specUrl !== undefined) {
					const allowList =
						input.allowList ?? options.defaultAllowList;
					if (allowList === undefined || allowList.length === 0) {
						return toolError(
							'specUrl requires an allowList.',
							'Pass `allowList: ["api.example.com"]` or supply `spec` inline.',
						);
					}
					if (options.specFetch === undefined) {
						return toolError(
							'install-required',
							'api_mock needs an injected fetch seam to load `specUrl` in this host.',
						);
					}
					const loaded = await options.specFetch({
						url: input.specUrl,
						allowList,
						...(input.timeoutMs === undefined
							? {}
							: { timeoutMs: input.timeoutMs }),
						...(input.maxBytes === undefined
							? {}
							: { maxBytes: input.maxBytes }),
					});
					spec = parseOpenApi(loaded.body);
				} else {
					return toolError(
						'missing-spec',
						'Pass `spec` (inline parsed) or `specUrl` (allow-listed).',
					);
				}

				const operation = findOperation(spec, input);
				if (operation === undefined) {
					return toolError(
						'operation-not-found',
						input.operationId !== undefined
							? `operationId "${input.operationId}" is not declared in the spec.`
							: `No operation matches ${input.method} ${input.path}.`,
					);
				}

				const count = input.count ?? 1;
				const randomize = input.randomize ?? true;
				const allResponsesRaw = generateOperationMock(operation, {
					randomize,
				}).responses;

				const samples: IMockedResponse[] = [];
				for (let i = 0; i < count; i++) {
					const picked =
						input.statusCode === undefined
							? mockHappyPathWithSeed(
									operation,
									input.statusCode,
									randomize,
									i,
								)
							: mockResponseForStatusWithSeed(
									operation,
									input.statusCode,
									randomize,
									i,
								);
					if (picked !== undefined) samples.push(picked);
				}
				const selected = samples[0] ?? allResponsesRaw[0];
				if (selected === undefined) {
					return toolError(
						'no-responses',
						`operation "${operation.operationId}" declares no response mocks.`,
					);
				}

				return toolJson(
					OUTPUT.parse({
						ok: true,
						operationId: operation.operationId,
						method: operation.method,
						path: operation.path,
						selectedStatus: selected.status,
						selectedBody: selected.body,
						allResponses: allResponsesRaw,
						count: samples.length,
					}),
				);
			},
		);
	},
});

// Re-seeders so each generated sample is unique without the host
// having to inject a seed factory.
const mockHappyPathWithSeed = (
	operation: IOpenApiOperation,
	_statusCode: number | undefined,
	randomize: boolean,
	index: number,
): IMockedResponse | undefined =>
	mockHappyPath(
		operation,
		{ randomize },
		{ nextSeed: deterministicIndexSeed(operation.operationId, index) },
	);

const mockResponseForStatusWithSeed = (
	operation: IOpenApiOperation,
	statusCode: number,
	randomize: boolean,
	index: number,
): IMockedResponse | undefined =>
	mockResponseForStatus(
		operation,
		statusCode,
		{ randomize },
		{
			nextSeed: deterministicIndexSeed(operation.operationId, index),
		},
	);

const deterministicIndexSeed = (operationId: string, index: number) => {
	let counter = deterministicLabel(operationId, index);
	return () => {
		counter = (counter * 1664525 + 1013904223) >>> 0;
		return counter;
	};
};
