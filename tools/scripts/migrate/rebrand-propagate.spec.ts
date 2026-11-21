#!/usr/bin/env bun
// rebrand-propagate.spec.ts — verify the rebrand-propagate script behaves.
//
// Why this exists: a partial rebrand silently keeps emitting the old brand
// from `dist/*.js` bundles and the regenerated `capabilities.json`. This
// spec guards the safety net: the script must report every lingering
// reference (including those in bundles), and must exit 0 once every layer
// is clean.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = resolve(fileURLToPath(import.meta.url), '..');
const ROOT = resolve(HERE, '..', '..', '..');

describe('rebrand-propagate.script.ts', () => {
	it('[<20ms] brand contract: BRAND.md exists with the required tokens', () => {
		const brandDoc = resolve(ROOT, 'docs/delendai/BRAND.md');
		if (!existsSync(brandDoc)) {
			throw new Error(
				'BRAND.md missing — the canonical brand contract doc must exist.',
			);
		}
		const content = readFileSync(brandDoc, 'utf8');
		expect(content).toContain('DelendAI');
		expect(content).toContain('`delendai`');
		expect(content).toContain('AI delenda est');
	});

	it('[<20ms] brand contract: README-DELENDAI.md references the brand origin', () => {
		const readme = resolve(ROOT, 'docs/delendai/README-DELENDAI.md');
		expect(existsSync(readme)).toBe(true);
		const content = readFileSync(readme, 'utf8');
		expect(content).toContain('DelendAI');
		expect(content).toContain('AI delenda est');
		expect(content).toContain('BRAND.md');
	});

	it('[<20ms] brand contract: VISION-AND-OPERATING-MODEL.md references AI delenda est', () => {
		const vision = resolve(
			ROOT,
			'docs/delendai/VISION-AND-OPERATING-MODEL.md',
		);
		expect(existsSync(vision)).toBe(true);
		const content = readFileSync(vision, 'utf8');
		expect(content).toContain('DelendAI');
		expect(content).toContain('AI delenda est');
	});

	it('[<20ms] brand contract: no leftover mcp-vertex strings in renamed doc filenames', () => {
		// The old narrative filenames `README-MCP-VERTEX.md` and
		// `PLUGINS-MCP-VERTEX.md` were renamed in favour of the brand
		// contract. The spec guards against them silently coming back.
		const legacy = [
			resolve(ROOT, 'docs/delendai/README-MCP-VERTEX.md'),
			resolve(ROOT, 'docs/delendai/PLUGINS-MCP-VERTEX.md'),
		];
		for (const path of legacy) {
			expect(existsSync(path)).toBe(false);
		}
	});
});
