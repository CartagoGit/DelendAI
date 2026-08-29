import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { nodeDynamicImport as deprecatedPublicNodeDynamicImport } from '@mcp-vertex/core';
import { nodeDynamicImport as nodeSubpathDynamicImport } from '@mcp-vertex/core/node';
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(
	fileURLToPath(new URL('.', import.meta.url)),
	'../../../../..',
);
const PUBLIC_BARREL = resolve(REPO_ROOT, 'packages/core/src/public/index.ts');
const NODE_BARREL = resolve(REPO_ROOT, 'packages/core/src/node/index.ts');
const NODE_SHIM = resolve(
	REPO_ROOT,
	'packages/core/src/node/dynamic-import.ts',
);

describe('nodeDynamicImport deprecation surface (b00237 S1)', () => {
	it('keeps the deprecated public shim wired to the node subpath export', () => {
		expect(deprecatedPublicNodeDynamicImport).toBe(
			nodeSubpathDynamicImport,
		);
	});

	it('documents the root re-export as deprecated and points it at the node shim', () => {
		const barrel = readFileSync(PUBLIC_BARREL, 'utf8');
		expect(barrel).toContain('@deprecated r00028 / b00237');
		expect(barrel).toContain('use `@mcp-vertex/core/node` instead.');
		expect(barrel).toContain(
			"export { nodeDynamicImport } from '../node/dynamic-import';",
		);
	});

	it('keeps the node subpath as the non-deprecated canonical owner', () => {
		const nodeBarrel = readFileSync(NODE_BARREL, 'utf8');
		const nodeShim = readFileSync(NODE_SHIM, 'utf8');
		expect(nodeBarrel).toContain(
			"export { nodeDynamicImport } from './dynamic-import';",
		);
		expect(nodeShim).toContain(
			"export { nodeDynamicImport } from '../lib/plugins/load-plugins';",
		);
		expect(nodeShim).not.toContain('@deprecated');
	});
});
