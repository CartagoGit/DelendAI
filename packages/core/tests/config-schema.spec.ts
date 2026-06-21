import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	CONFIG_SCHEMA_PATH,
	buildConfigSchema,
} from '../../../tools/scripts/types/generate-config-schema.script';

describe('mcp-vertex.config.json JSON Schema (drift guard)', () => {
	it('the committed schema matches the Zod source of truth', () => {
		// vitest runs from the repo root, so the path resolves directly.
		const committed = readFileSync(
			join(process.cwd(), CONFIG_SCHEMA_PATH),
			'utf8',
		);
		expect(committed).toBe(buildConfigSchema());
	});
});
