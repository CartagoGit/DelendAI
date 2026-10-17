/**
 * plugin-manifest-schema.spec.ts — the published plugin manifest schema
 * is current, and every first-party manifest is valid as plain JSON.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
	parsePluginManifest,
	RESERVED_PACKAGE_SCOPE,
} from '@delendai/core/runtime';

import {
	PLUGIN_MANIFEST_SCHEMA_PATH,
	buildPluginManifestSchema,
} from '../../scripts/types/generate-plugin-manifest-schema.script';

const ROOT = resolve(__dirname, '../../..');

describe('the plugin manifest JSON Schema', () => {
	it('is the one generated from the manifest zod schema', () => {
		expect(
			readFileSync(join(ROOT, PLUGIN_MANIFEST_SCHEMA_PATH), 'utf8'),
		).toBe(buildPluginManifestSchema());
		const schema = JSON.parse(buildPluginManifestSchema()) as {
			readonly properties?: Record<string, unknown>;
		};
		expect(Object.keys(schema.properties ?? {})).toEqual(
			expect.arrayContaining(['id', 'package', 'version']),
		);
	});

	it("keeps delendai's own scope out of a manifest written elsewhere, as the runtime does", () => {
		const schema = JSON.parse(buildPluginManifestSchema()) as {
			readonly properties: {
				readonly package: {
					readonly not?: { readonly pattern: string };
				};
			};
		};
		// Compared as text: the schema is data a validator compiles, and
		// this spec has no business compiling strings read out of it.
		expect(schema.properties.package.not?.pattern).toBe(
			`^${RESERVED_PACKAGE_SCOPE.replace('/', '\\/')}`,
		);
		expect('@delendai/weather'.startsWith(RESERVED_PACKAGE_SCOPE)).toBe(
			true,
		);
		expect('@acme/weather-mcp'.startsWith(RESERVED_PACKAGE_SCOPE)).toBe(
			false,
		);
	});

	it('accepts every first-party manifest written as plain JSON', async () => {
		const manifests = readdirSync(join(ROOT, 'plugins'), {
			withFileTypes: true,
		})
			.filter((entry) => entry.isDirectory())
			.map((entry) =>
				join(ROOT, 'plugins', entry.name, 'plugin.manifest.ts'),
			)
			.filter((path) => {
				try {
					readFileSync(path);
					return true;
				} catch {
					return false;
				}
			});
		expect(manifests.length).toBeGreaterThan(10);
		for (const path of manifests) {
			const module = (await import(pathToFileURL(path).href)) as {
				readonly default?: unknown;
			};
			const asJson: unknown = JSON.parse(JSON.stringify(module.default));
			expect(() => parsePluginManifest(asJson), path).not.toThrow();
		}
	}, 120_000);
});
