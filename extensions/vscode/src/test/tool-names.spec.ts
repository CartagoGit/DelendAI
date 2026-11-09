/**
 * tool-names.spec.ts — every tool the extension asks for exists.
 *
 * The specs drive a fake client, which answers any name, so a renamed tool
 * left a panel empty with every test green. The generated catalog is the
 * source of truth for what a server registers.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(HERE, '..');
const CATALOG = join(
	HERE,
	'../../../../docs/delendai/agent-catalog.generated.json',
);

/** Registered by plugins outside the catalog's preset. */
const OUTSIDE_THE_PRESET = /^external-mcps_/u;

const sourceFiles = (
	readdirSync(SOURCE, { recursive: true }) as readonly string[]
).filter(
	(file) =>
		file.endsWith('.ts') &&
		!file.endsWith('.spec.ts') &&
		!file.startsWith('test'),
);

const names = sourceFiles.flatMap((file) =>
	[
		...readFileSync(join(SOURCE, file), 'utf8').matchAll(
			/formatToolName\(\s*[\w.]+,\s*'([a-z][\w-]*)'/gu,
		),
	].map((match) => match[1] ?? ''),
);

describe('the tools the extension calls', () => {
	const catalog = readFileSync(CATALOG, 'utf8');

	it('finds them', () => {
		expect(names.length).toBeGreaterThan(10);
	});

	it.each([...new Set(names)])('%s is registered', (name) => {
		if (OUTSIDE_THE_PRESET.test(name)) return;
		expect(catalog).toContain(`"delendai_${name}"`);
	});
});
