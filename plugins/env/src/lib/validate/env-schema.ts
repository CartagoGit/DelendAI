/**
 * env-schema.ts — f00135 S1: declarative schema for `.env` validation.
 *
 * Minimal subset of JSON-Schema: `required` keys + per-key `type`
 * (`string` | `number` | `boolean` | `enum`) + optional `enum` array
 * for closed value sets. The same shape is used by `env_check` to
 * report missing / extra / mistyped variables; values are NEVER
 * included in the output (only the key name + the inferred type).
 */
import { z } from 'zod';

/** Supported value types — kept small on purpose. */
export type EnvType = 'string' | 'number' | 'boolean' | 'enum';

/** One declared variable in the schema. */
export interface IEnvVarSchema {
	readonly type: EnvType;
	/** Closed set of legal values — only meaningful when `type === 'enum'`. */
	readonly enum?: readonly string[];
	/** When true, the variable must be present (and non-empty). */
	readonly required?: boolean;
	/** One-line rationale surfaced in the findings. */
	readonly description?: string;
}

/** The full `.env` schema declaration. */
export interface IEnvSchema {
	readonly vars: Readonly<Record<string, IEnvVarSchema>>;
}

const VAR_SCHEMA = z
	.object({
		type: z.enum(['string', 'number', 'boolean', 'enum']),
		enum: z.array(z.string()).optional(),
		required: z.boolean().optional(),
		description: z.string().optional(),
	})
	.refine(
		(v) =>
			v.type === 'enum'
				? v.enum !== undefined && v.enum.length > 0
				: true,
		{
			message: 'enum type requires a non-empty enum array',
			path: ['enum'],
		},
	);

export const ENV_SCHEMA = z.object({
	vars: z.record(z.string(), VAR_SCHEMA),
});

/** Stable list of declared variable names, sorted for deterministic output. */
export const schemaKeys = (schema: IEnvSchema): readonly string[] =>
	Object.keys(schema.vars).sort();

/** Stable list of declared required variable names. */
export const schemaRequired = (schema: IEnvSchema): readonly string[] =>
	schemaKeys(schema).filter((key) => schema.vars[key]?.required === true);
