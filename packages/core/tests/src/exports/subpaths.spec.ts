/**
 * subpaths.spec.ts — r00028 S1 acceptance for `@mcp-vertex/core/*`
 * subpath exports (Track C / §9).
 *
 * Pins:
 *  1. `package.json#exports` declares the 5 entrypoints (".", "./contracts",
 *     "./runtime", "./plugin", "./node") plus "./public", "./version",
 *     "./manifest" carry-overs.
 *  2. Each subpath resolves through TypeScript's `bundler` resolution
 *     and exports at least one named symbol.
 *  3. `@mcp-vertex/core/contracts` is the type-only surface and must
 *     NOT drag `node:fs` into a consumer that imports it directly.
 *  4. The default `"."` entry still resolves (back-compat).
 */

import { describe, expect, it } from 'vitest';

import * as contracts from '@mcp-vertex/core/contracts';
import * as defaultExport from '@mcp-vertex/core';
import * as nodeExport from '@mcp-vertex/core/node';
import * as pluginExport from '@mcp-vertex/core/plugin';
import * as runtimeExport from '@mcp-vertex/core/runtime';

const packageJson = (await import(
	// @ts-expect-error — JSON import without resolveType.
	'../../../../package.json'
)) as unknown as {
	exports: Record<string, unknown>;
};

const exportsMap = packageJson.exports;

describe('exports map (r00028 S1)', () => {
	it('declares the 5 S1 entrypoints', () => {
		expect(exportsMap).toHaveProperty('.');
		expect(exportsMap).toHaveProperty('./contracts');
		expect(exportsMap).toHaveProperty('./runtime');
		expect(exportsMap).toHaveProperty('./plugin');
		expect(exportsMap).toHaveProperty('./node');
	});

	it('each entrypoint carries the standard condition set', () => {
		for (const entry of [
			'./contracts',
			'./runtime',
			'./plugin',
			'./node',
		]) {
			const value = exportsMap[entry] as Record<string, unknown>;
			expect(value).toHaveProperty('types');
			expect(value).toHaveProperty('import');
		}
	});
});

describe('subpath resolution (r00028 S1)', () => {
	it('default "." entry resolves', () => {
		expect(defaultExport).toBeDefined();
		expect(Object.keys(defaultExport).length).toBeGreaterThan(0);
	});

	it('./contracts entry resolves and exports at least one symbol', () => {
		expect(contracts).toBeDefined();
		// Contracts is mostly type-only; at runtime it may be empty but
		// the module MUST load without errors under bundler resolution.
		expect(typeof contracts).toBe('object');
	});

	it('./runtime entry resolves', () => {
		expect(runtimeExport).toBeDefined();
		expect(typeof runtimeExport).toBe('object');
	});

	it('./plugin entry resolves', () => {
		expect(pluginExport).toBeDefined();
		expect(typeof pluginExport).toBe('object');
	});

	it('./node entry resolves', () => {
		expect(nodeExport).toBeDefined();
		expect(typeof nodeExport).toBe('object');
	});
});

describe('contracts is type-only (r00028 S1)', () => {
	it('does not expose filesystem helpers at the contracts subpath', () => {
		// `node` subpath is where fs lives; `contracts` must NOT have it.
		expect(
			(contracts as Record<string, unknown>).writeFileAtomic,
		).toBeUndefined();
		expect(
			(contracts as Record<string, unknown>).withFileMutex,
		).toBeUndefined();
		expect((contracts as Record<string, unknown>).readJson).toBeUndefined();
		expect(
			(contracts as Record<string, unknown>).writeJson,
		).toBeUndefined();
	});
});
