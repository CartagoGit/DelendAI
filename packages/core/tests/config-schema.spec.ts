import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
	CONFIG_SCHEMA_PATH,
	buildConfigSchema,
} from '../../../tools/scripts/types/generate-config-schema.script';

/** One property of the emitted schema, addressed by its dotted path. */
interface ISchemaProperty {
	readonly path: string;
	readonly description?: string;
	readonly enum?: readonly unknown[];
	readonly enumDescriptions?: Readonly<Record<string, string>>;
}

/**
 * Every named member the schema declares, with its dotted path.
 *
 * The walk is the same one a reader does: from the root object down
 * through `properties`, into `items` for an array, and into
 * `additionalProperties` for a map. A path uses `[]` for an array
 * element and `{}` for a map value, so `validationMatrix.scopes{}[].command`
 * names the one property it is.
 *
 * A DESCRIPTION is required of every named member — the thing a person
 * types in the file. The `items` of an array of plain strings is not a
 * named member: `hosts` is the member, and its `items` is just "a
 * string".
 *
 * An ENUM is required wherever it sits, including the `items` of an
 * array of enum — that is where a "list of permission categories" keeps
 * its legal values.
 */
const propertiesOf = (schema: unknown): readonly ISchemaProperty[] => {
	const found: ISchemaProperty[] = [];
	const walk = (node: unknown, path: string, named: boolean): void => {
		if (node === null || typeof node !== 'object') return;
		const record = node as {
			readonly properties?: Readonly<Record<string, unknown>>;
			readonly items?: unknown;
			readonly additionalProperties?: unknown;
			readonly description?: string;
			readonly enum?: readonly unknown[];
			readonly enumDescriptions?: Readonly<Record<string, string>>;
		};
		const hasEnum = record.enum !== undefined;
		if (named || hasEnum) {
			found.push({
				path,
				...(record.description === undefined
					? {}
					: { description: record.description }),
				...(record.enum === undefined ? {} : { enum: record.enum }),
				...(record.enumDescriptions === undefined
					? {}
					: { enumDescriptions: record.enumDescriptions }),
			});
		}
		if (record.properties !== undefined) {
			for (const [key, value] of Object.entries(record.properties)) {
				walk(value, path === '' ? key : `${path}.${key}`, true);
			}
		}
		if (record.items !== undefined) walk(record.items, `${path}[]`, false);
		if (
			record.additionalProperties !== undefined &&
			typeof record.additionalProperties === 'object'
		)
			walk(record.additionalProperties, `${path}{}`, false);
	};
	walk(schema, '', false);
	return found;
};

describe('delendai.config.json JSON Schema (drift guard)', async () => {
	it('the committed schema matches the Zod source of truth', async () => {
		const repoRoot = resolve(
			dirname(fileURLToPath(import.meta.url)),
			'../../..',
		);
		const committed = readFileSync(
			join(repoRoot, CONFIG_SCHEMA_PATH),
			'utf8',
		);
		expect(committed).toBe(buildConfigSchema());
	});

	/**
	 * A property nobody explained is a property nobody can use.
	 *
	 * The schema existed to tell an editor which values were legal. It
	 * did not say what any of them did, so the person who did not
	 * already know the project had no way to learn from the file
	 * itself. This is the guard that keeps the answer from rotting: a
	 * field added without a description fails here, in the same commit,
	 * instead of months later when somebody wonders what it does.
	 */
	it('every property says what it is for', () => {
		const properties = propertiesOf(JSON.parse(buildConfigSchema()));
		const undocumented = properties
			.filter((property) => property.description === undefined)
			.map((property) => property.path);
		expect(
			undocumented,
			`these properties have no description: ${undocumented.join(', ')}`,
		).toEqual([]);
	});

	/**
	 * An enum that lists legal values without saying what each one
	 * changes is a menu with no prices. The value is what the user
	 * picks; the sentence is what makes the pick informed.
	 */
	it('every enum value says what it applies to', () => {
		const properties = propertiesOf(JSON.parse(buildConfigSchema()));
		const problems: string[] = [];
		for (const property of properties) {
			if (property.enum === undefined) continue;
			const documented = property.enumDescriptions ?? {};
			for (const value of property.enum) {
				const key = String(value);
				if (documented[key] === undefined)
					problems.push(`${property.path} → ${key}`);
			}
		}
		expect(
			problems,
			`these enum values have no description: ${problems.join(', ')}`,
		).toEqual([]);
	});
});
