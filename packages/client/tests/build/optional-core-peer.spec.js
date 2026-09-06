/**
 * r00041 S4 — `@delendai/core` must be optional for a client consumer.
 *
 * A client that can only talk to a server you have already installed is
 * not much of a client. `AUD-E04` found the core sitting in this
 * package's `dependencies`, so `bun add @delendai/client` pulled the
 * whole server — 87,900 lines and `node:fs`/`node:child_process` with
 * it — on a consumer who only wanted to speak MCP.
 *
 * ## What this spec actually proves, and what it does not
 *
 * It does NOT install the package in a sandbox; that would be a slow,
 * network-shaped test for a property that is fully decidable from the
 * source. It proves the three things that together make the peer
 * genuinely optional:
 *
 *  1. the manifest declares the core as an OPTIONAL peer, not a
 *     dependency — so a package manager will not fetch it, and will not
 *     warn when it is absent;
 *  2. the subpaths a coreless consumer uses (`./contracts`,
 *     `./transport`) exist and are reachable; and
 *  3. nothing in the graph those subpaths reach names `@delendai/core`
 *     at all — not as a value import, which S1 already forbids, and not
 *     as a TYPE import either, which S1 permits and which would leave
 *     the consumer with code that runs but does not typecheck.
 *
 * Point 3 is the one that bites. Two type-only imports
 * (`IToolEffect`, `PluginOrigin`) survived every earlier check for
 * exactly that reason; they now live in
 * `protocol-vocabulary.interface.ts`, guarded by a conformance spec.
 */
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
const here = dirname(fileURLToPath(import.meta.url));
const clientRoot = resolve(here, '../..');
const readManifest = async () =>
	JSON.parse(await readFile(join(clientRoot, 'package.json'), 'utf8'));
/** Every `.ts` file under the given roots, recursively. */
const collectSources = async (roots) => {
	const files = [];
	const walk = async (dir) => {
		for (const entry of await readdir(dir, { withFileTypes: true })) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				await walk(full);
				continue;
			}
			if (
				entry.name.endsWith('.ts') &&
				!entry.name.endsWith('.spec.ts')
			) {
				files.push(full);
			}
		}
	};
	for (const root of roots) await walk(root);
	return files;
};
const CORE_SPECIFIER = /from\s+['"]@delendai\/core(?:\/[^'"]*)?['"]/u;
describe('@delendai/core is an optional peer of @delendai/client', () => {
	it('is declared as an optional peer, not a dependency', async () => {
		const manifest = await readManifest();
		expect(manifest.dependencies?.['@delendai/core']).toBeUndefined();
		expect(manifest.peerDependencies?.['@delendai/core']).toBeDefined();
		// Without the `optional` flag a package manager warns on every
		// install that omits the peer, which is the normal case here.
		expect(
			manifest.peerDependenciesMeta?.['@delendai/core']?.optional,
		).toBe(true);
	});
	it('exposes the subpaths a coreless consumer needs', async () => {
		const manifest = await readManifest();
		expect(Object.keys(manifest.exports)).toEqual(
			expect.arrayContaining(['./contracts', './transport']),
		);
	});
	it('never names @delendai/core in the contracts or transport graph', async () => {
		const sources = await collectSources([
			join(clientRoot, 'src/contracts'),
			join(clientRoot, 'src/transport'),
			join(clientRoot, 'src/lib/contracts'),
			join(clientRoot, 'src/lib/transport'),
		]);
		// Guard against the check silently scanning nothing.
		expect(sources.length).toBeGreaterThan(10);
		const offenders = [];
		for (const file of sources) {
			const text = await readFile(file, 'utf8');
			if (CORE_SPECIFIER.test(text)) {
				offenders.push(file.slice(clientRoot.length + 1));
			}
		}
		expect(offenders).toEqual([]);
	});
});
