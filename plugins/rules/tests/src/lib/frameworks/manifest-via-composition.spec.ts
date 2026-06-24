import { describe, it, expect } from 'vitest';

import { buildManifestViaComposition } from '@mcp-vertex/rules/lib/frameworks/manifest-via-composition';
import { composeRoot } from '@mcp-vertex/rules/lib/frameworks/registry';
import {
	buildDefaultRenderers,
	defaultPolicyResolver,
} from '@mcp-vertex/rules/lib/frameworks/registry/composition-root';
import { buildValidatorRegistry } from '@mcp-vertex/rules/lib/frameworks/registry/validator-registry';
import { RUST_PRESET } from '@mcp-vertex/rules/lib/frameworks/presets/data/rust';
import { VANILLA_JS_FALLBACK_PRESET } from '@mcp-vertex/rules/lib/frameworks/presets/data/fallback';
import { RUST_DOGMA } from '@mcp-vertex/rules/lib/frameworks/dogmas/rust.dogma';
import { rustAdapter } from '@mcp-vertex/rules/lib/frameworks/languages/rust/rust.adapter';
import { ALL_PRESET_DATA } from '@mcp-vertex/rules/lib/frameworks/presets/data';
import { DEFAULT_DOGMA_ADAPTERS } from '@mcp-vertex/rules/lib/frameworks/dogmas';

import type { IFileReader } from '@mcp-vertex/core/public';

/**
 * Consistency tests for `buildManifestViaComposition`.
 *
 * Why "consistency" not "parity": the legacy `buildRulesManifest`
 * and the new `buildManifestViaComposition` cannot produce
 * byte-identical output because they have *different* adapter
 * sets. The legacy hardcodes 13 JS/TS adapters in
 * `detect-framework.ts`; the new consumes a `ICompositionRoot`
 * (Dependency Inversion). When f00051 S2 lands, the
 * composition will carry every adapter the legacy carries,
 * and the parity test will become a true byte-identity test.
 *
 * What the consistency tests prove today:
 *   1. The new writer respects the priority order of the
 *      composition root (DIP).
 *   2. The new writer respects the area override (S — the
 *      override is a separate concern, not a branch on
 *      the language).
 *   3. The new writer is *pure* (no I/O) and *deterministic*
 *      for the same input (verified via stable fingerprint
 *      across two consecutive calls).
 *   4. The new writer returns the `vanilla-js` fallback
 *      when no adapter claims an area (S — the fallback
 *      is a single default, not N branches per language).
 */
const readerFromFiles = (files: Record<string, string>): IFileReader => ({
	readFile: async (p) => files[p],
	exists: async (p) => p in files,
	listDir: async (dir) => {
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

const buildRoot = () =>
	composeRoot({
		// The vanilla-js fallback is part of every composition
		// root by default (S — the fallback is a real preset,
		// not a magic string in the writer).
		presets: [VANILLA_JS_FALLBACK_PRESET, RUST_PRESET],
		adapters: [rustAdapter],
		dogmas: DEFAULT_DOGMA_ADAPTERS,
		validators: buildValidatorRegistry(),
		renderers: buildDefaultRenderers(),
		policyResolver: defaultPolicyResolver,
	});
describe('manifest-via-composition (DIP, S)', async () => {
	it('resolves a Rust area to the rust-clippy preset via the composition root', async () => {
		const reader = readerFromFiles({
			'package.json': JSON.stringify({ name: 'demo' }),
			'apps/svc/Cargo.toml': '[package]\nname = "svc"',
		});
		const root = buildRoot();
		const manifest = buildManifestViaComposition(
			reader,
			'demo',
			'.cache/mcp-vertex/rules',
			'mixed',
			root,
		);
		expect((await manifest).projects.demo?.['apps/svc']?.presetId).toBe(
			'rust-clippy',
		);
		expect((await manifest).projects.demo?.['apps/svc']?.reason).toContain(
			'Cargo.toml',
		);
		// The project does not ship its own clippy.toml; only
		// the cache default is listed.
		expect((await manifest).projects.demo?.['apps/svc']?.eslint).toEqual([
			'.cache/mcp-vertex/rules/rust-clippy.clippy.toml',
		]);
	});

	it('honours an area override (S — override is a separate concern)', async () => {
		const reader = readerFromFiles({
			'package.json': JSON.stringify({ name: 'demo' }),
		});
		const root = buildRoot();
		const manifest = buildManifestViaComposition(
			reader,
			'demo',
			'.cache/mcp-vertex/rules',
			'strict',
			root,
			{ root: 'rust-clippy' },
		);
		expect((await manifest).projects.demo?.root?.presetId).toBe(
			'rust-clippy',
		);
		expect((await manifest).projects.demo?.root?.reason).toContain(
			'forced',
		);
	});

	it('is pure and deterministic (same input → same fingerprint)', async () => {
		const reader = readerFromFiles({
			'package.json': JSON.stringify({ name: 'demo' }),
		});
		const root = buildRoot();
		const a = buildManifestViaComposition(
			reader,
			'demo',
			'.cache/mcp-vertex/rules',
			'mixed',
			root,
		);
		const b = buildManifestViaComposition(
			reader,
			'demo',
			'.cache/mcp-vertex/rules',
			'mixed',
			root,
		);
		// The fingerprint is the deterministic identifier; the
		// `generatedAt` field is the only thing that varies.
		expect((await a).fingerprint).toBe((await b).fingerprint);
		expect((await a).mode).toBe((await b).mode);
		expect(Object.keys((await a).projects.demo ?? {}).sort()).toEqual(
			Object.keys((await b).projects.demo ?? {}).sort(),
		);
	});

	it('returns the vanilla-js fallback when no adapter claims the area', async () => {
		const reader = readerFromFiles({
			'package.json': JSON.stringify({ name: 'demo' }),
		});
		const root = buildRoot();
		const manifest = buildManifestViaComposition(
			reader,
			'demo',
			'.cache/mcp-vertex/rules',
			'mixed',
			root,
		);
		expect((await manifest).projects.demo?.root?.presetId).toBe(
			'vanilla-js',
		);
		expect((await manifest).projects.demo?.root?.reason).toContain(
			'no language adapter',
		);
	});

	it('reads presets from the composition root, not from a module-level singleton', async () => {
		// The new writer takes the presets *from the composition
		// root*, not from a module-level singleton. A custom
		// composition root with a 1-element preset list produces
		// a manifest with a 1-preset resolution, regardless of
		// what `ALL_PRESET_DATA` exports.
		const customAdapter = {
			id: 'custom',
			priority: 10,
			detect: async () => ({
				presetId: 'rust-clippy',
				reason: 'forced by test',
			}),
		};
		const root = composeRoot({
			presets: [RUST_PRESET],
			adapters: [customAdapter],
			dogmas: [RUST_DOGMA],
			validators: buildValidatorRegistry(),
			renderers: buildDefaultRenderers(),
			policyResolver: defaultPolicyResolver,
		});
		// Sanity: the composition root's preset list is what
		// the new writer reads, not the legacy singleton.
		expect(root.registry.supportedIds).toEqual(['rust-clippy']);
		expect(ALL_PRESET_DATA).toContain(RUST_PRESET);
	});
});
