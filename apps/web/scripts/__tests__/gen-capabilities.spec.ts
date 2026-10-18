/**
 * gen-capabilities.spec.ts — the site's registry of tools is the registry
 * the server serves.
 *
 * The generator named 13 of the 61 first-party plugins by hand, so the
 * site listed 142 of 280 tools and nothing failed. It now loads every
 * plugin under `plugins/`; this harvests for real and holds it to that.
 */
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	assembleCapabilities,
	collectTools,
	formatHarvestError,
	loadAllPlugins,
	main,
	withRegistrationEnglish,
	writeStub,
} from '../gen-capabilities';

const ROOT = join(import.meta.dirname, '..', '..', '..', '..');

describe('the site capabilities harvest', () => {
	it('lists the tools of plugins the old hand-written list left out, each documented', async () => {
		await loadAllPlugins();
		const { tools } = await collectTools();
		const namespaces = new Set(tools.map((tool) => tool.namespace));
		for (const plugin of [
			'orchestrator-runner',
			'agent-orchestrator',
			'external-mcps',
		])
			expect(namespaces).toContain(plugin);
		expect(tools.length).toBeGreaterThan(200);
		expect(
			tools.filter((tool) => tool.description.trim().length === 0),
		).toEqual([]);
		expect(readdirSync(join(ROOT, 'plugins')).length).toBeGreaterThan(50);

		const document = assembleCapabilities(
			{
				staleTranslations: [],
				tools,
				prompts: [],
				resources: [],
				knowledge: [],
				benchmarks: [],
			},
			'9.9.9',
		);
		expect(document.coreVersion).toBe('9.9.9');
		expect(document.counts.tools).toBe(tools.length);
		expect(document.packages.length).toBeGreaterThan(50);
		expect(document.tutorials.length).toBeGreaterThan(0);
	}, 240_000);

	it('says why a harvest failed, and writes an empty, marked document instead', () => {
		expect(
			formatHarvestError(new Error("Cannot find module '@delendai/x'")),
		).toBe('missing dist for @delendai/x (run `bun run build` first)');
		expect(formatHarvestError('x'.repeat(300)).endsWith('…')).toBe(true);
		const out = join(
			mkdtempSync(join(tmpdir(), 'gen-capabilities-')),
			'capabilities.json',
		);
		writeStub('1.0.0', 'no dist', out);
		expect(JSON.parse(readFileSync(out, 'utf8'))).toMatchObject({
			stub: true,
			stubReason: 'no dist',
			tools: [],
		});
	});

	it('writes the whole document where it is told, in strict mode', async () => {
		const out = join(
			mkdtempSync(join(tmpdir(), 'gen-capabilities-')),
			'capabilities.json',
		);
		await main(true, out);
		const written = JSON.parse(readFileSync(out, 'utf8')) as {
			counts: { tools: number };
		};
		expect(written.counts.tools).toBeGreaterThan(200);
	}, 240_000);
});

describe('the English a tool page shows', () => {
	it("is the registration's, and translations from another English are stale", () => {
		expect(
			withRegistrationEnglish({ en: 'old', es: 'viejo' }, 'new'),
		).toEqual({
			i18n: { en: 'new', es: 'viejo' },
			stale: true,
		});
		expect(
			withRegistrationEnglish({ en: 'same', es: 'igual' }, 'same').stale,
		).toBe(false);
		expect(withRegistrationEnglish(undefined, 'new')).toEqual({
			stale: false,
		});
		expect(withRegistrationEnglish({ en: 'kept' }, undefined)).toEqual({
			i18n: { en: 'kept' },
			stale: false,
		});
	});
});
