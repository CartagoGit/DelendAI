/**
 * check-schema.ts — f00135 S1: pure `.env` schema validator.
 *
 * Diff an already-parsed `.env` file (entries + malformed lines)
 * against a declared schema. Returns normalized `IFinding` rows:
 *   - missing-required (high)   — schema-required key absent
 *   - missing-typed (medium)    — schema-declared key absent (even if not required)
 *   - extra-undeclared (low)    — present key not declared in the schema
 *   - mistyped-value (medium)   — present + declared + wrong type / not in enum
 *
 * Values are NEVER included in findings — only the key + the
 * inferred type mismatch.
 */
import type { IFinding } from '@delendai/core/public';

import type {
	IEnvEntry,
	IParsedEnv,
} from '../contracts/interfaces/env.interface';
import type { EnvType, IEnvSchema, IEnvVarSchema } from './env-schema';
import { schemaKeys, schemaRequired } from './env-schema';

const finding = (args: {
	readonly ruleId: string;
	readonly severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
	readonly message: string;
	readonly line?: number;
}): IFinding => ({
	ruleId: `env/${args.ruleId}`,
	severity: args.severity,
	message: args.message,
	...(args.line !== undefined
		? { location: { file: '.env', line: args.line } }
		: {}),
});

const describeType = (varSchema: IEnvVarSchema): string => {
	if (varSchema.type === 'enum') {
		return `enum (${varSchema.enum?.join(' | ') ?? '?'})`;
	}
	return varSchema.type;
};

/**
 * Best-effort value validator against a declared var schema — returns the
 * failure finding, or `undefined` if the value is valid.
 *
 * The value itself is NEVER included in the returned finding.
 */
export const validateValue = (
	value: string,
	varSchema: IEnvVarSchema,
): IFinding | undefined => {
	const trimmed = value.trim();
	if (trimmed === '' || trimmed === '""' || trimmed === "''") {
		return finding({
			ruleId: 'mistyped-value',
			severity: 'medium',
			message: `Value is empty but schema expects ${describeType(varSchema)}.`,
		});
	}
	const type: EnvType = varSchema.type;
	switch (type) {
		case 'string':
			return undefined;
		case 'number': {
			const n = Number(trimmed);
			if (!Number.isFinite(n)) {
				return finding({
					ruleId: 'mistyped-value',
					severity: 'medium',
					message: `Value cannot be parsed as a number.`,
				});
			}
			return undefined;
		}
		case 'boolean':
			if (
				trimmed === 'true' ||
				trimmed === 'false' ||
				trimmed === '1' ||
				trimmed === '0' ||
				trimmed === 'yes' ||
				trimmed === 'no'
			) {
				return undefined;
			}
			return finding({
				ruleId: 'mistyped-value',
				severity: 'medium',
				message: `Value cannot be parsed as a boolean.`,
			});
		case 'enum': {
			if (varSchema.enum === undefined || varSchema.enum.length === 0) {
				return finding({
					ruleId: 'mistyped-value',
					severity: 'medium',
					message: `Enum declared without values.`,
				});
			}
			if (!varSchema.enum.includes(trimmed)) {
				return finding({
					ruleId: 'mistyped-value',
					severity: 'medium',
					message: `Value "${trimmed}" is not in the allowed enum values.`,
				});
			}
			return undefined;
		}
	}
};

/**
 * Validate a single parsed entry against its declared schema. The variable
 * key is included in the failure message so callers can locate the bad
 * entry without seeing the value.
 */
export const validateEntry = (
	entry: IEnvEntry,
	varSchema: IEnvVarSchema,
): IFinding | undefined => {
	if (entry.empty) {
		return finding({
			ruleId: 'mistyped-value',
			severity: 'medium',
			message: `Variable "${entry.key}" is empty but schema expects ${describeType(varSchema)}.`,
			line: entry.line,
		});
	}
	const result = validateValue(entry.value, varSchema);
	if (result === undefined) return undefined;
	// Re-attach the line number + variable key to the finding.
	return finding({
		ruleId: result.ruleId.replace(/^env\//, ''),
		severity: result.severity,
		message: `Variable "${entry.key}": ${result.message}`,
		line: entry.line,
	});
};

/**
 * Validate parsed env against a schema. Returns one finding per
 * violation; values never appear in the output.
 */
export const checkSchema = (
	parsed: IParsedEnv,
	schema: IEnvSchema,
): readonly IFinding[] => {
	const findings: IFinding[] = [];
	const declaredRequired = new Set(schemaRequired(schema));
	const declaredKeys = new Set(schemaKeys(schema));
	const seen = new Set<string>();

	for (const entry of parsed.entries) {
		seen.add(entry.key);
		const varSchema: IEnvVarSchema | undefined = schema.vars[entry.key];
		if (varSchema === undefined) {
			findings.push(
				finding({
					ruleId: 'extra-undeclared',
					severity: 'low',
					message: `Variable "${entry.key}" is present in .env but not declared in the schema.`,
					line: entry.line,
				}),
			);
			continue;
		}
		const entryFinding = validateEntry(entry, varSchema);
		if (entryFinding !== undefined) {
			findings.push(entryFinding);
		}
	}

	// Detect missing declared keys.
	for (const key of declaredKeys) {
		if (seen.has(key)) continue;
		const isRequired = declaredRequired.has(key);
		findings.push(
			finding({
				ruleId: isRequired ? 'missing-required' : 'missing-typed',
				severity: isRequired ? 'high' : 'medium',
				message: isRequired
					? `Required variable "${key}" is missing from .env.`
					: `Variable "${key}" is declared in the schema but absent from .env.`,
			}),
		);
	}

	return findings;
};
