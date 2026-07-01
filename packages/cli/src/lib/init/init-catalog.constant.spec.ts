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

	it('substitutes PROP_ placeholders with the resolved namespace prefix', async () => {
		const descriptors = await loadAgentDescriptors('/no-catalog', {
			namespacePrefix: 'acme',
			locale: 'en',
		});
		const orchestrator = descriptors.find((d) => d.role === 'orchestrator');
		expect(orchestrator?.tools[0]).toBe('acme_proposals_auto_work');
		expect(orchestrator?.tools.every((t) => t.startsWith('acme_'))).toBe(true);
	});

	it('preserves tools that do not start with PROP_ (already-prefixed catalog entries)', async () => {
		const descriptors = await loadAgentDescriptors('/no-catalog', {
			namespacePrefix: 'acme',
		});
		const all = descriptors.flatMap((d) => d.tools);
		expect(all.every((t) => t.startsWith('acme_'))).toBe(true);
	});

	it('defaults namespacePrefix to mcp-vertex when none is supplied', async () => {
		const descriptors = await loadAgentDescriptors('/no-catalog');
		const orchestrator = descriptors.find((d) => d.role === 'orchestrator');
		expect(orchestrator?.tools[0]).toBe('mcp-vertex_proposals_auto_work');
	});
});