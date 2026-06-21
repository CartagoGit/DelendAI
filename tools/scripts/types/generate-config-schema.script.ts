#!/usr/bin/env bun
/**
 * generate-config-schema.ts — emit the JSON Schema for `mcp-vertex.config.json`
 * from the single source of truth (the Zod `CONFIG_FILE_SCHEMA`), so editors
 * get autocomplete + validation and the schema never drifts from the code.
 *
 *   bun run config:schema           # write packages/core/schema/...
 *   bun run config:schema --check   # fail if the committed schema is stale
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { CONFIG_FILE_SCHEMA } from '../../../packages/core/src/lib/plugins/load-config-file';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Path of the committed schema, relative to the repo root. */
export const CONFIG_SCHEMA_PATH =
	'packages/core/schema/mcp-vertex.config.schema.json';

/** Build the JSON Schema text (the exact bytes written to disk). */
export const buildConfigSchema = (): string => {
	const body = z.toJSONSchema(CONFIG_FILE_SCHEMA);
	const schema = {
		...body,
		$schema: 'http://json-schema.org/draft-07/schema#',
		$id: 'https://cartagogit.github.io/mcp-vertex/mcp-vertex.config.schema.json',
		title: 'mcp-vertex.config.json',
		description:
			'Configuration for @mcp-vertex/core: cache/docs roots, the quality-gate validation matrix, and per-plugin prefix/options.',
	};
	return `${JSON.stringify(schema, null, '\t')}\n`;
};

if (import.meta.main) {
	const out = join(ROOT, CONFIG_SCHEMA_PATH);
	const content = buildConfigSchema();
	if (process.argv.includes('--check')) {
		if (readFileSync(out, 'utf8') !== content) {
			console.error(
				'✖ config schema is stale — run `bun run config:schema` and commit.',
			);
			process.exit(1);
		}
		console.log('config schema up to date.');
	} else {
		mkdirSync(dirname(out), { recursive: true });
		writeFileSync(out, content);
		console.log(`wrote ${out}`);
	}
}
