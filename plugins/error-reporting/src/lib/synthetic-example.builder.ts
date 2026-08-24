import type { McpVertexErrorCode } from './contracts/constants/error-codes.constant';
import type {
	ISafeSyntheticExample,
	SafeFailureClass,
	SafeScalar,
} from './contracts/interfaces/reporter.interface';
import { selectSyntheticFixture } from './synthetic-fixtures.constant';

type SyntheticArgumentType = 'object' | 'array' | 'scalar' | 'unknown';
type SyntheticFixture = ReturnType<typeof selectSyntheticFixture>;

interface ISyntheticToolShape {
	readonly rootKind: SyntheticArgumentType;
	readonly propertyKeys?: readonly string[] | undefined;
	readonly scalarType?:
		| 'string'
		| 'number'
		| 'boolean'
		| 'unknown'
		| undefined;
}

interface IBuildSyntheticExampleInput {
	readonly packageId: string;
	readonly toolName: string;
	readonly errorCode?: McpVertexErrorCode | undefined;
	readonly failureClass: SafeFailureClass;
	readonly toolSchema?: unknown;
}

const toolShapeOf = (schema: unknown): ISyntheticToolShape | undefined => {
	if (typeof schema !== 'object' || schema === null) return undefined;
	const record = schema as Record<string, unknown>;
	if (
		typeof record.properties === 'object' &&
		record.properties !== null &&
		!Array.isArray(record.properties)
	) {
		return {
			rootKind: 'object',
			propertyKeys: Object.keys(record.properties),
		};
	}
	if (record.type === 'object') {
		return { rootKind: 'object' };
	}
	if (record.type === 'array' || 'items' in record) {
		return { rootKind: 'array' };
	}
	if (
		record.type === 'string' ||
		record.type === 'number' ||
		record.type === 'boolean'
	) {
		return {
			rootKind: 'scalar',
			scalarType: record.type,
		};
	}
	return undefined;
};

const stableIndexOf = (seed: string, length: number): number => {
	let hash = 0;
	for (const char of seed) {
		hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
	}
	return hash % length;
};

const operationOf = (errorCode: McpVertexErrorCode | undefined): string => {
	switch (errorCode) {
		case 'PLUGIN_REGISTER_TIMEOUT':
			return 'plugin registration';
		case 'PLUGIN_LOAD_FAILED':
			return 'plugin load';
		case 'PLUGIN_DISPOSE_FAILED':
			return 'plugin dispose';
		case 'TOOL_EXECUTION_FAILED':
			return 'tool execution';
		case 'HOOK_FAILED':
			return 'tool lifecycle hook';
		case 'INVALID_OPTIONS':
			return 'options validation';
		case 'MUTEX_STALE_LOCK':
			return 'mutex recovery';
		case 'PROCESS_TIMEOUT':
			return 'external process timeout';
		default:
			return 'internal failure';
	}
};

const stringValueOf = (input: {
	readonly propertyKey: string;
	readonly fixture: SyntheticFixture;
	readonly seed: string;
}): string => {
	const lowerKey = input.propertyKey.toLowerCase();
	const id =
		input.fixture.ids[
			stableIndexOf(
				`${input.seed}:${lowerKey}:id`,
				input.fixture.ids.length,
			)
		] ?? input.fixture.ids[0]!;
	if (/(^id$|id$|code$|sku$)/i.test(input.propertyKey)) return id;
	if (/(url|uri|endpoint|href)/i.test(input.propertyKey)) {
		return /(preview|secondary|fallback)/i.test(input.propertyKey)
			? input.fixture.urls.secondary
			: input.fixture.urls.primary;
	}
	if (/(name|title|label)/i.test(input.propertyKey)) {
		return input.fixture.label;
	}
	if (/(kind|mode|state|status|reason)/i.test(input.propertyKey)) {
		return `${input.fixture.domain}-demo`;
	}
	if (/(city|location|region|locale)/i.test(input.propertyKey)) {
		return 'Harbor Point';
	}
	if (/(query|term|slug)/i.test(input.propertyKey)) {
		return `${input.fixture.domain}-sample`;
	}
	return `${input.fixture.domain}-${stableIndexOf(`${input.seed}:${lowerKey}:value`, 90) + 10}`;
};

const numberValueOf = (input: {
	readonly propertyKey: string;
	readonly seed: string;
}): number => {
	const lowerKey = input.propertyKey.toLowerCase();
	if (/(ms|timeout|window)/i.test(input.propertyKey)) {
		return 250 + stableIndexOf(`${input.seed}:${lowerKey}`, 8) * 50;
	}
	if (
		/(count|qty|quantity|copies|visits|hours|items|limit|size)/i.test(
			input.propertyKey,
		)
	) {
		return stableIndexOf(`${input.seed}:${lowerKey}`, 7) + 1;
	}
	if (/(amount|price|cents|total)/i.test(input.propertyKey)) {
		return 42 + stableIndexOf(`${input.seed}:${lowerKey}`, 12);
	}
	return stableIndexOf(`${input.seed}:${lowerKey}`, 25) + 1;
};

const booleanValueOf = (seed: string): boolean => stableIndexOf(seed, 2) === 0;

const objectPayloadOf = (input: {
	readonly fixture: SyntheticFixture;
	readonly toolShape: ISyntheticToolShape | undefined;
	readonly seed: string;
}): Readonly<Record<string, SafeScalar>> => {
	const propertyKeys = input.toolShape?.propertyKeys;
	if (propertyKeys === undefined || propertyKeys.length === 0) {
		return input.fixture.payload;
	}
	const payload: Record<string, SafeScalar> = {};
	for (const propertyKey of propertyKeys) {
		if (
			/(items|entries|records|tracks|books|pets|products|forecast)/i.test(
				propertyKey,
			)
		) {
			payload[propertyKey] = input.fixture.list;
			continue;
		}
		if (
			/(enabled|include|dryrun|strict|recursive|force|alerts)/i.test(
				propertyKey,
			)
		) {
			payload[propertyKey] = booleanValueOf(
				`${input.seed}:${propertyKey}`,
			);
			continue;
		}
		if (
			/(count|qty|quantity|copies|visits|hours|items|limit|size|amount|price|cents|total|ms|timeout|window)/i.test(
				propertyKey,
			)
		) {
			payload[propertyKey] = numberValueOf({
				propertyKey,
				seed: input.seed,
			});
			continue;
		}
		payload[propertyKey] = stringValueOf({
			propertyKey,
			fixture: input.fixture,
			seed: input.seed,
		});
	}
	return payload;
};

const payloadOf = (input: {
	readonly fixture: SyntheticFixture;
	readonly toolShape: ISyntheticToolShape | undefined;
	readonly seed: string;
}): SafeScalar => {
	switch (input.toolShape?.rootKind) {
		case 'array':
			return input.fixture.list;
		case 'scalar':
			switch (input.toolShape.scalarType) {
				case 'number':
					return numberValueOf({
						propertyKey: 'value',
						seed: input.seed,
					});
				case 'boolean':
					return booleanValueOf(input.seed);
				case 'string':
					return stringValueOf({
						propertyKey: 'value',
						fixture: input.fixture,
						seed: input.seed,
					});
				default:
					return (
						input.fixture.ids[
							stableIndexOf(input.seed, input.fixture.ids.length)
						] ?? input.fixture.ids[0]!
					);
			}
		case 'unknown':
		case 'object':
		case undefined:
			return objectPayloadOf(input);
	}
};

export const buildSyntheticExample = (
	input: IBuildSyntheticExampleInput,
): ISafeSyntheticExample => {
	const toolShape = toolShapeOf(input.toolSchema);
	const fixture = selectSyntheticFixture(input);
	const seed = [
		input.packageId,
		input.toolName,
		input.errorCode ?? '',
		input.failureClass,
	].join(':');
	const payload = payloadOf({ fixture, toolShape, seed });
	return {
		summary: `Synthetic ${fixture.domain} reproduction for ${input.errorCode ?? input.failureClass}.`,
		source: toolShape === undefined ? 'fixture-fallback' : 'schema-fixture',
		fixtureId: fixture.domain,
		fixtureDomain: fixture.domain,
		argumentType:
			toolShape?.rootKind ??
			(Array.isArray(payload)
				? 'array'
				: typeof payload === 'object' && payload !== null
					? 'object'
					: 'scalar'),
		context: {
			operation: operationOf(input.errorCode),
			fixtureLabel: fixture.label,
			reservedHosts: ['example.invalid', 'example.com'],
			exampleIds: fixture.ids,
		},
		payload,
	};
};
