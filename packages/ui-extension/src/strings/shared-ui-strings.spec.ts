import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { BRAND_TOKENS, SHARED_UI_STRINGS } from './shared-ui-strings';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, 'shared-ui-strings.ts'), 'utf8');

/**
 * f00053 S7 — the shared strings module must be the single, host-agnostic
 * source both the web and the extension can consume. The purity test
 * guarantees it never grows a host-specific dependency.
 */
describe('shared-ui-strings', () => {
	it('exposes the brand/UI keys both surfaces need, all non-empty', () => {
		for (const value of Object.values(SHARED_UI_STRINGS)) {
			expect(typeof value).toBe('string');
			expect(value.length).toBeGreaterThan(0);
		}
		expect(SHARED_UI_STRINGS.productName).toContain('mcp-vertex');
		expect(SHARED_UI_STRINGS.serverName).toBe('mcp-vertex');
		expect(SHARED_UI_STRINGS.repoUrl.startsWith('https://')).toBe(true);
		expect(SHARED_UI_STRINGS.docsUrl.startsWith('https://')).toBe(true);
		expect(BRAND_TOKENS.blue.startsWith('--')).toBe(true);
		expect(BRAND_TOKENS.purple.startsWith('--')).toBe(true);
	});

	it('is PURE — no host-specific import (web alias, vscode, astro, DOM, node)', () => {
		const importLines = source
			.split('\n')
			.filter((line) => /^\s*import\b/.test(line));
		// Plain data: zero imports is the strongest guarantee that neither
		// surface drags in a host dependency by consuming it.
		expect(importLines).toHaveLength(0);
		for (const forbidden of [
			"from 'vscode'",
			"from 'astro'",
			"from '#",
			"from '@mcp-vertex/client'",
			"from 'node:",
		]) {
			expect(source.includes(forbidden)).toBe(false);
		}
	});
});
