import type {
	FindingSeverity,
	IFinding,
	IFindingCounts,
} from '@delendai/core/public';

import type {
	IJsonSchema,
	IJsonSchemaPrimitive,
	IOpenApiOperation,
	IOperationResponse,
} from '../spec/openapi';

export interface ITypedMismatch {
	readonly path: string;
	readonly expected: IJsonSchemaPrimitive;
	readonly actual: IJsonSchemaPrimitive | 'unknown';
	readonly severity: FindingSeverity;
	readonly message: string;
	readonly schema: IJsonSchema;
}

export interface IFieldMismatch extends IFinding {
	readonly path: string;
}

export interface IValidationResult {
	readonly ok: true;
	readonly operationId: string;
	readonly mismatches: readonly IFinding[];
	readonly summary: IFindingCounts;
	readonly worst: FindingSeverity | 'none';
}

export interface IValidationDeps {
	readonly summarizeFindings: (
		findings: readonly IFinding[],
	) => IFindingCounts;
	readonly worstSeverity: (
		findings: readonly IFinding[],
	) => FindingSeverity | undefined;
	readonly selectResponse?: (
		operation: IOpenApiOperation,
		statusCode: number,
	) => IOperationResponse | undefined;
}
