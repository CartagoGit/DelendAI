import {
	summarizeFindings,
	worstSeverity,
	type IFinding,
} from '@delendai/core/public';

import type { IOpenApiOperation, IOperationResponse } from '../spec/openapi';

import type { IValidationDeps, IValidationResult } from './interfaces';
import { stripFieldPaths, walkSchema } from './schema-walker';

const selectResponse = (
	operation: IOpenApiOperation,
	statusCode: number,
): IOperationResponse | undefined =>
	operation.responses.find(
		(response) => response.status === String(statusCode),
	) ?? operation.responses.find((response) => response.status === 'default');

const parseResponseBody = (responseBody: unknown): unknown => {
	if (typeof responseBody !== 'string') return responseBody;
	try {
		return JSON.parse(responseBody) as unknown;
	} catch {
		return responseBody;
	}
};

const DEFAULT_DEPS: IValidationDeps = {
	summarizeFindings,
	worstSeverity,
	selectResponse,
};

export const validateResponse = (
	operation: IOpenApiOperation,
	responseBody: unknown,
	statusCode = 200,
	deps: IValidationDeps = DEFAULT_DEPS,
): IValidationResult => {
	const response =
		deps.selectResponse?.(operation, statusCode) ??
		selectResponse(operation, statusCode);
	const findings: readonly IFinding[] =
		response?.schema === undefined
			? []
			: stripFieldPaths(
					walkSchema(
						parseResponseBody(responseBody),
						response.schema,
					),
				);
	return {
		ok: true,
		operationId: operation.operationId,
		mismatches: findings,
		summary: deps.summarizeFindings(findings),
		worst: deps.worstSeverity(findings) ?? 'none',
	};
};

export const _internal = { parseResponseBody, selectResponse };
