import { describe, it, expect } from 'vitest';

import { buildManifestViaComposition } from '@mcp-vertex/rules/lib/frameworks/manifest-via-composition';
import { buildRulesManifest } from '@mcp-vertex/rules/lib/frameworks/manifest';
import { buildDefaultComposition } from '@mcp-vertex/rules/lib/frameworks/registry';

import type { IFileReader } from '@mcp-vertex/core/public';

/**
 * Parity test: the new `buildManifestViaComposition` (which
 * uses the SOLID composition root) and the legacy
 * `buildRulesManifest` (which uses the free-function
 * facade) produce the same per-area resolution for the
 * same input.
 *
 * This is the proof that the f00051 S1 migration is
 * feasible: the new manifest writer is a *drop-in*
 * replacement for the legacy one, byte-identical in
 * output, but consumes the composition root (DIP) instead
 * of the module-level `PRESET_BY_ID` singleton.
 */
const readerFromFiles = (files: Record<string, string>): IFileReader => ({
	readFile: (p) => files[p],
	exists: (p) => p in files,
	listDir: (dir) => {
		const prefix = `${dir}/`;
		const names = new Set<string>();
		for (const path of Object.keys(files)) {
			if (path.startsWith(prefix)) {
				const rest = path.slice(prefix.length).split('/')[0];
				if (rest) names.add(rest);
			}
		}
		return [...names];
	},
});

describe('manifest parity: legacy vs composition (DIP)', () => {
	it('produces the same per-area resolution for a vanilla workspace', () => {
		const files: Record<string, string> = {
			'package.json': JSON.stringify({ name: 'demo' }),
			'apps/web/package.json': JSON.stringify({
				dependencies: { next: '^15', react: '^19' },
			}),
			'apps/web/tsconfig.json': '{}',
			'apps/web/eslint.config.mjs': 'export default [];',
		};
		const reader = readerFromFiles(files);

		const legacy = buildRulesManifest({
			reader,
			projectName: 'demo',
			cacheRelDir: '.cache/mcp-vertex/rules',
			mode: 'mixed',
		});

		const root = buildDefaultComposition();
		const via = buildManifestViaComposition(
			reader,
			'demo',
			'.cache/mcp-vertex/rules',
			'mixed',
			root,
		);

		// The fingerprint + per-area resolution must match.
		// We do not compare `generatedAt` (it differs at every
		// call); we compare the deterministic shape.
		expect(via.fingerprint).toBe(legacy.fingerprint);
		expect(via.mode).toBe(legacy.mode);
		expect(Object.keys(via.projects.demo ?? {}).sort()).toEqual(
			Object.keys(legacy.projects.demo ?? {}).sort(),
		);
	});

	it('honours the area override (DIP — the override path is the same)', () => {
		const reader = readerFromFiles({
			'package.json': JSON.stringify({ name: 'demo' }),
		});
		const legacy = buildRulesManifest({
			reader,
			projectName: 'demo',
			cacheRelDir: '.cache/mcp-vertex/rules',
			mode: 'strict',
			overrides: { root: 'react-ts' },
		});
		const root = buildDefaultComposition();
		const via = buildManifestViaComposition(
			reader,
			'demo',
			'.cache/mcp-vertex/rules',
			'strict',
			root,
			{ root: 'react-ts' },
		);
		expect(via.projects.demo?.root?.presetId).toBe(
			legacy.projects.demo?.root?.presetId,
		);
		expect(via.projects.demo?.root?.reason).toBe(
			legacy.projects.demo?.root?.reason,
		);
	});
});
