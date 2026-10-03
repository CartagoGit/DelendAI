import type { IInvocationRecord } from './types';
import { percentile } from './statistics.helper';

const ESTIMATED_PLUGIN_SCHEMA_OVERHEAD_BYTES = 768;
const ESTIMATED_TOOL_SCHEMA_BYTES = 640;
const DEFAULT_STATIC_SCHEMA_BYTES = 4_096;
const DEFAULT_COMPACT_TYPICAL_BYTES = 512;
const DEFAULT_P95_RESPONSE_BYTES = 2_048;

const observedResponseBytes = (
	records: readonly IInvocationRecord[],
): number[] =>
	records
		.map((record) => record.responseBytes)
		.filter((value): value is number => typeof value === 'number');

const observedToolCount = (records: readonly IInvocationRecord[]): number =>
	new Set(records.map((record) => record.tool)).size;

export const buildTokenTax = (
	plugin: string,
	records: readonly IInvocationRecord[],
): {
	readonly plugin: string;
	readonly staticSchemaBytes: number;
	readonly compactTypicalBytes: number;
	readonly p95ResponseBytes: number;
	readonly totalBytes: number;
	readonly estimated: boolean;
	readonly observedToolCount: number;
	readonly observedResponseSamples: number;
	readonly sources: {
		readonly staticSchemaBytes: string;
		readonly compactTypicalBytes: string;
		readonly p95ResponseBytes: string;
	};
} => {
	const toolCount = observedToolCount(records);
	const responseBytes = observedResponseBytes(records);
	const compactTypicalBytes = percentile(responseBytes, 0.5);
	const p95ResponseBytes = percentile(responseBytes, 0.95);
	const staticSchemaBytes =
		toolCount > 0
			? ESTIMATED_PLUGIN_SCHEMA_OVERHEAD_BYTES +
				toolCount * ESTIMATED_TOOL_SCHEMA_BYTES
			: DEFAULT_STATIC_SCHEMA_BYTES;

	const tax = {
		plugin,
		staticSchemaBytes,
		compactTypicalBytes:
			compactTypicalBytes ?? DEFAULT_COMPACT_TYPICAL_BYTES,
		p95ResponseBytes: p95ResponseBytes ?? DEFAULT_P95_RESPONSE_BYTES,
		estimated:
			toolCount === 0 ||
			compactTypicalBytes === null ||
			p95ResponseBytes === null,
		observedToolCount: toolCount,
		observedResponseSamples: responseBytes.length,
		sources: {
			staticSchemaBytes:
				toolCount > 0
					? 'derived-from-observed-distinct-tools'
					: 'estimated-default-no-observed-tools',
			compactTypicalBytes:
				compactTypicalBytes === null
					? 'estimated-default-no-response-bytes'
					: 'observed-response-bytes-p50',
			p95ResponseBytes:
				p95ResponseBytes === null
					? 'estimated-default-no-response-bytes'
					: 'observed-response-bytes-p95',
		},
	} as const;

	return {
		...tax,
		totalBytes:
			tax.staticSchemaBytes +
			tax.compactTypicalBytes +
			tax.p95ResponseBytes,
	};
};
