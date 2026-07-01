import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
	CONFIG_SCHEMA_PATH,
	buildConfigSchema,
} from '../../../tools/scripts/types/generate-config-schema.script';

describe('mcp-vertex.config.json JSON Schema (drift guard)', async () => {
	it('the committed schema matches the Zod source of truth', async () => {
		const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
		const committed = readFileSync(
			join(repoRoot, CONFIG_SCHEMA_PATH),
			'utf8',
		);
		expect(committed).toBe(buildConfigSchema());
	});
});
