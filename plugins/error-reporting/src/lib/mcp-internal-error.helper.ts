import type { McpVertexErrorCode } from './contracts/constants/error-codes.constant';
import type { SafeScalar } from './contracts/interfaces/reporter.interface';

export const isSafeScalar = (value: unknown): value is SafeScalar => {
	if (
		typeof value === 'string' ||
		typeof value === 'number' ||
		typeof value === 'boolean' ||
		value === null
	) {
		return true;
	}
	if (Array.isArray(value)) {
		return value.every((entry) => isSafeScalar(entry));
	}
	if (typeof value !== 'object' || value === null) return false;
	if (value instanceof Error) return false;
	if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) return false;
	for (const entry of Object.values(value)) {
		if (!isSafeScalar(entry)) return false;
	}
	return true;
};

export class McpVertexInternalError extends Error {
	readonly code: McpVertexErrorCode;
	readonly mcpVertexErrorCode: McpVertexErrorCode;
	readonly packageId: string;
	readonly componentId: string;
	readonly safeContext?: Readonly<Record<string, SafeScalar>> | undefined;

	constructor(input: {
		readonly code: McpVertexErrorCode;
		readonly packageId: string;
		readonly componentId: string;
		readonly safeContext?: Readonly<Record<string, SafeScalar>> | undefined;
		readonly message?: string | undefined;
		readonly cause?: unknown;
	}) {
		super(input.message ?? input.code, {
			...(input.cause !== undefined ? { cause: input.cause } : {}),
		});
		this.name = 'McpVertexInternalError';
		this.code = input.code;
		this.mcpVertexErrorCode = input.code;
		this.packageId = input.packageId;
		this.componentId = input.componentId;
		if (
			input.safeContext !== undefined &&
			!isSafeScalar(input.safeContext)
		) {
			throw new TypeError(
				'McpVertexInternalError.safeContext must contain only SafeScalar values',
			);
		}
		this.safeContext = input.safeContext;
	}
}
