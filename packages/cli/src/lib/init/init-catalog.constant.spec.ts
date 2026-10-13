/**
 * init-catalog.spec.ts — f00088 S3.
 *
 * Verifies the locale-aware fallback + namespace prefix propagation.
 * The catalog file is absent in these specs, so every test exercises
 * the fallback path.
 */
import { describe, expect, it } from 'vitest';

import { loadAgentDescriptors } from './init-catalog.constant';

describe('loadAgentDescriptors (f00088 S3)', () => {
	it('returns the English fallback for locale=en', async () => {
		const descriptors = await loadAgentDescriptors('/no-catalog', {
			locale: 'en',
		});
		const orchestrator = descriptors.find((d) => d.role === 'orchestrator');
		expect(orchestrator).toBeDefined();
		expect(orchestrator?.description).toMatch(/orchestrator/i);
	});

	it('returns the Spanish fallback for locale=es', async () => {
		const descriptors = await loadAgentDescriptors('/no-catalog', {
			locale: 'es',
		});
		const orchestrator = descriptors.find((d) => d.role === 'orchestrator');
		expect(orchestrator?.description).toMatch(/orquestador/i);
	});

	it('falls back to English for an unknown locale', async () => {
		const descriptors = await loadAgentDescriptors('/no-catalog', {
			locale: 'klingon',
		});
		const orchestrator = descriptors.find((d) => d.role === 'orchestrator');
		expect(orchestrator?.description).toMatch(/orchestrator/i);
	});

	it('substitutes the {PREFIX} placeholder with the resolved namespace prefix', async () => {
		const descriptors = await loadAgentDescriptors('/no-catalog', {
			namespacePrefix: 'acme',
			locale: 'en',
		});
		const orchestrator = descriptors.find((d) => d.role === 'orchestrator');
		expect(orchestrator?.body).toContain('acme_overview');
		expect(orchestrator?.body).not.toContain('{PREFIX}');
	});

	it('substitutes {PREFIX} in every fallback role, not just the orchestrator', async () => {
		const descriptors = await loadAgentDescriptors('/no-catalog', {
			namespacePrefix: 'acme',
		});
		expect(descriptors.length).toBeGreaterThan(0);
		for (const d of descriptors) {
			expect(d.body).toContain('acme_overview');
			expect(d.body).not.toContain('{PREFIX}');
		}
	});

	it('defaults namespacePrefix to delendai when none is supplied', async () => {
		const descriptors = await loadAgentDescriptors('/no-catalog');
		const orchestrator = descriptors.find((d) => d.role === 'orchestrator');
		expect(orchestrator?.body).toContain('delendai_overview');
	});

	// x00202 S1: the fallback used to hardcode plugin-specific tool names
	// (auto_work, fs_write, search_search, quality_run_quality, …) in a
	// `tools` array AND in the body prose. At least one had already
	// rotted (search_search is not a real tool; search is) and this
	// shipped to every delendai init adopter silently, because the "read the
	// live catalog" branch is dead code (nothing in this repo ever writes
	// an `agents` array into agent-catalog.generated.json). Pin that no
	// plugin-specific tool name survives anywhere in the fallback bodies
	// — the only tool name a body may ever contain is `overview`, a core
	// contract every delendai server guarantees.
	it('never hardcodes a plugin-specific tool name in any fallback body (either locale)', async () => {
		const rottenNames = [
			'auto_work',
			'compact_status',
			'proposal_board',
			'fs_write',
			'fs_read',
			'search_search',
			'proposal_adopt',
			'quality_run_quality',
			'proposal_review',
			'docs_read',
		];
		for (const locale of ['en', 'es']) {
			const descriptors = await loadAgentDescriptors('/no-catalog', {
				locale,
			});
			for (const d of descriptors) {
				for (const name of rottenNames) {
					expect(d.body).not.toContain(name);
				}
			}
		}
	});
});
