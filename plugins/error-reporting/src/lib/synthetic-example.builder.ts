import type { McpVertexErrorCode } from './contracts/constants/error-codes.constant';
import type {
	ISafeSyntheticExample,
	SafeFailureClass,
	SafeScalar,
} from './contracts/interfaces/reporter.interface';
import { stableIndexOf } from './stable-index.helper';
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
	readonly toolSeed?: string | undefined;
	readonly errorCode?: McpVertexErrorCode | undefined;
	readonly failureClass: SafeFailureClass;
	readonly toolSchema?: unknown;
}

const HASH_MULTIPLIER = 31;
const GENERATED_VALUE_RANGE = 90;
const GENERATED_VALUE_OFFSET = 10;
const TIMEOUT_VARIANT_COUNT = 8;
const TIMEOUT_BASE_MS = 250;
const TIMEOUT_STEP_MS = 50;
const QUANTITY_VARIANT_COUNT = 7;
const AMOUNT_BASE_VALUE = 42;
const AMOUNT_VARIANT_COUNT = 12;
const DEFAULT_NUMBER_VARIANT_COUNT = 25;
const DEFAULT_OPERATION_LABEL = 'internal failure';

const OPERATION_BY_ERROR_CODE: Record<McpVertexErrorCode, string> = {
	PLUGIN_REGISTER_TIMEOUT: 'plugin registration',
	PLUGIN_LOAD_FAILED: 'plugin load',
	PLUGIN_DISPOSE_FAILED: 'plugin dispose',
	TOOL_EXECUTION_FAILED: 'tool execution',
	HOOK_FAILED: 'tool lifecycle hook',
	INVALID_OPTIONS: 'options validation',
	MUTEX_STALE_LOCK: 'mutex recovery',
	PROCESS_TIMEOUT: 'external process timeout',
};

interface IStringValueRule {
	readonly test: RegExp;
	render(input: {
		readonly propertyKey: string;
		readonly fixture: SyntheticFixture;
		readonly seed: string;
		readonly lowerKey: string;
		readonly id: string;
	}): string;
}

const STRING_VALUE_RULES: readonly IStringValueRule[] = [
	{
		test: /(^id$|id$|code$|sku$)/i,
		render: ({ id }) => id,
	},
	{
		test: /(url|uri|endpoint|href)/i,
		render: ({ fixture, propertyKey }) =>
			/(preview|secondary|fallback)/i.test(propertyKey)
				? fixture.urls.secondary
				: fixture.urls.primary,
	},
	{
		test: /(name|title|label)/i,
		render: ({ fixture }) => fixture.label,
	},
	{
		test: /(kind|mode|state|status|reason)/i,
		render: ({ fixture }) => `${fixture.domain}-demo`,
	},
	{
		test: /(city|location|region|locale)/i,
		render: () => 'Harbor Point',
	},
	{
		test: /(query|term|slug)/i,
		render: ({ fixture }) => `${fixture.domain}-sample`,
	},
];

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

const operationOf = (errorCode: McpVertexErrorCode | undefined): string => {
	if (errorCode === undefined) return DEFAULT_OPERATION_LABEL;
	return OPERATION_BY_ERROR_CODE[errorCode] ?? DEFAULT_OPERATION_LABEL;
};

const stringValueOf = (input: {
	readonly propertyKey: string;
	readonly fixture: SyntheticFixture;
	readonly seed: string;
}): string => {
	const lowerKey = input.propertyKey.toLowerCase();
	const id =
		input.fixture.ids[
			stableIndexOf({
				seed: `${input.seed}:${lowerKey}:id`,
				length: input.fixture.ids.length,
				multiplier: HASH_MULTIPLIER,
			})
		] ?? input.fixture.ids[0]!;
	for (const rule of STRING_VALUE_RULES) {
		if (rule.test.test(input.propertyKey)) {
			return rule.render({
				propertyKey: input.propertyKey,
				fixture: input.fixture,
				seed: input.seed,
				lowerKey,
				id,
			});
		}
	}
	return `${input.fixture.domain}-${
		stableIndexOf({
			seed: `${input.seed}:${lowerKey}:value`,
			length: GENERATED_VALUE_RANGE,
			multiplier: HASH_MULTIPLIER,
		}) + GENERATED_VALUE_OFFSET
	}`;
};

const numberValueOf = (input: {
	readonly propertyKey: string;
	readonly seed: string;
}): number => {
	const lowerKey = input.propertyKey.toLowerCase();
	if (/(ms|timeout|window)/i.test(input.propertyKey)) {
		return (
			TIMEOUT_BASE_MS +
			stableIndexOf({
				seed: `${input.seed}:${lowerKey}`,
				length: TIMEOUT_VARIANT_COUNT,
				multiplier: HASH_MULTIPLIER,
			}) *
				TIMEOUT_STEP_MS
		);
	}
	if (
		/(count|qty|quantity|copies|visits|hours|items|limit|size)/i.test(
			input.propertyKey,
		)
	) {
		return (
			stableIndexOf({
				seed: `${input.seed}:${lowerKey}`,
				length: QUANTITY_VARIANT_COUNT,
				multiplier: HASH_MULTIPLIER,
			}) + 1
		);
	}
	if (/(amount|price|cents|total)/i.test(input.propertyKey)) {
		return (
			AMOUNT_BASE_VALUE +
			stableIndexOf({
				seed: `${input.seed}:${lowerKey}`,
				length: AMOUNT_VARIANT_COUNT,
				multiplier: HASH_MULTIPLIER,
			})
		);
	}
	return (
		stableIndexOf({
			seed: `${input.seed}:${lowerKey}`,
			length: DEFAULT_NUMBER_VARIANT_COUNT,
			multiplier: HASH_MULTIPLIER,
		}) + 1
	);
};

const booleanValueOf = (seed: string): boolean =>
	stableIndexOf({
		seed,
		length: 2,
		multiplier: HASH_MULTIPLIER,
	}) === 0;

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

const scalarPayloadOf = (input: {
	readonly fixture: SyntheticFixture;
	readonly toolShape: ISyntheticToolShape | undefined;
	readonly seed: string;
}): SafeScalar => {
	const scalarType = input.toolShape?.scalarType;
	if (scalarType === 'number') {
		return numberValueOf({
			propertyKey: 'value',
			seed: input.seed,
		});
	}
	if (scalarType === 'boolean') {
		return booleanValueOf(input.seed);
	}
	if (scalarType === 'string') {
		return stringValueOf({
			propertyKey: 'value',
			fixture: input.fixture,
			seed: input.seed,
		});
	}
	return (
		input.fixture.ids[
			stableIndexOf({
				seed: input.seed,
				length: input.fixture.ids.length,
				multiplier: HASH_MULTIPLIER,
			})
		] ?? input.fixture.ids[0]!
	);
};

const payloadOf = (input: {
	readonly fixture: SyntheticFixture;
	readonly toolShape: ISyntheticToolShape | undefined;
	readonly seed: string;
}): SafeScalar => {
	const rootKind = input.toolShape?.rootKind;
	if (rootKind === 'array') return input.fixture.list;
	if (rootKind === 'scalar') return scalarPayloadOf(input);
	return objectPayloadOf(input);
};

export const buildSyntheticExample = (
	input: IBuildSyntheticExampleInput,
): ISafeSyntheticExample => {
	const toolShape = toolShapeOf(input.toolSchema);
	const fixture = selectSyntheticFixture(input);
	const seed = [
		input.packageId,
		input.toolSeed ?? input.toolName,
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
