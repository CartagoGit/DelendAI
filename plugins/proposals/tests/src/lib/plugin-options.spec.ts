/**
 * plugin-options.spec.ts — r00003 S9 (F9) + S7.
 *
 * The proposals plugin's `optionsSchema` now declares `proposalFolders`
 * and `proposalNarrativePatterns` as typed fields (previously read via a
 * `ctx.options.X as Y` cast). These specs pin that the schema validates
 * the new fields and rejects malformed values.
 */
import { describe, expect, it } from 'vitest';

import plugin from '../../../src/index';

describe('@mcp-vertex/proposals optionsSchema (S9 F9 + S7)', () => {
	it('exposes an optionsSchema', () => {
		expect(plugin.optionsSchema).toBeDefined();
	});

	it('accepts proposalFolders as a string array', () => {
		const r = plugin.optionsSchema?.safeParse({
			proposalFolders: ['paused/demos'],
		});
		expect(r?.success).toBe(true);
	});

	it('accepts proposalNarrativePatterns as [heading, canonical] tuples', () => {
		const r = plugin.optionsSchema?.safeParse({
			proposalNarrativePatterns: [['qué se hizo', 'notes']],
		});
		expect(r?.success).toBe(true);
	});

	it('rejects proposalFolders with a non-string element', () => {
		const r = plugin.optionsSchema?.safeParse({ proposalFolders: [42] });
		expect(r?.success).toBe(false);
	});

	it('rejects a malformed proposalNarrativePatterns tuple', () => {
		const r = plugin.optionsSchema?.safeParse({
			proposalNarrativePatterns: [['only-one-element']],
		});
		expect(r?.success).toBe(false);
	});
});
