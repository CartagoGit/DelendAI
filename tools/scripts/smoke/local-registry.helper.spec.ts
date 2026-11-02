import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { serveLocalRegistry } from './local-registry.helper.ts';

describe('serveLocalRegistry', () => {
	const stops: (() => void)[] = [];
	const dirs: string[] = [];
	afterEach(() => {
		for (const stop of stops.splice(0)) stop();
		for (const dir of dirs.splice(0))
			rmSync(dir, { recursive: true, force: true });
	});

	it('answers a packument whose tarball it serves, and 404 for any other package', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'registry-spec-'));
		dirs.push(dir);
		const tarball = join(dir, 'delendai-x-1.0.0.tgz');
		writeFileSync(tarball, 'bytes');
		const registry = await serveLocalRegistry([
			{
				name: '@delendai/x',
				version: '1.0.0',
				tarball,
				manifest: { name: '@delendai/x' },
			},
		]);
		stops.push(registry.stop);

		const packument = (await (
			await fetch(`${registry.url}@delendai%2fx`)
		).json()) as {
			'dist-tags': { latest: string };
			versions: Record<
				string,
				{ dist: { tarball: string; integrity: string } }
			>;
		};
		expect(packument['dist-tags'].latest).toBe('1.0.0');
		const dist = packument.versions['1.0.0']?.dist;
		expect(dist?.integrity).toMatch(/^sha512-/u);
		expect(await (await fetch(dist?.tarball ?? '')).text()).toBe('bytes');
		expect((await fetch(`${registry.url}left-pad`)).status).toBe(404);
	});
});
