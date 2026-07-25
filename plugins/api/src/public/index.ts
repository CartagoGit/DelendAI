/**
 * f00130 — public surface for the `api` plugin.
 *
 * Re-exports the spec parser + request builder so plugin authors
 * (and the S2/S3 contract validator + mock generator) can build
 * on top of the same shape without forking the contracts.
 */
export type {
	IOpenApiSpec,
	IOpenApiOperation,
	IOperationParam,
	IOperationResponse,
	IJsonSchema,
	IJsonSchemaPrimitive,
	IParamIn,
} from '../lib/spec/openapi';
export { parseOpenApi, fetchAndParseSpec } from '../lib/spec/openapi';
export type { ILoadSpecOptions } from '../lib/spec/openapi';
export { buildRequest, coerceValue } from '../lib/spec/build-request';
export type {
	IBuildRequestInput,
	IBuiltRequest,
} from '../lib/spec/build-request';
export { buildApiCallToolRegistration } from '../lib/tools/api-call.tool';
export type { IApiCallToolOptions } from '../lib/tools/api-call.tool';
