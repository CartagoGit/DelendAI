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
export {
	buildApiValidateToolRegistration,
	buildApiValidateToolRegistrations,
} from '../lib/tools/api-validate.tool';
export type { IApiValidateToolOptions } from '../lib/tools/api-validate.tool';
export {
	resolveResponseSchema,
	validateResponse,
} from '../lib/validate/response-validator';
export type { IValidateResponseOptions } from '../lib/validate/response-validator';
export {
	generateMockFromSchema,
	generateOperationMock,
	mockHappyPath,
	mockResponseForStatus,
} from '../lib/mock/mock-engine';
export type {
	IMockGeneratorOptions,
	IMockGeneratorDeps,
	IMockedResponse,
	IMockedOperation,
} from '../lib/mock/mock-engine';
export { buildApiMockToolRegistration } from '../lib/tools/api-mock.tool';
export type { IApiMockToolOptions } from '../lib/tools/api-mock.tool';
