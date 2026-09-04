/**
 * r00041 S4 — the vocabulary the client declares locally must stay
 * identical to the core's.
 *
 * `protocol-vocabulary.interface.ts` re-declares `IToolEffect` and
 * `PluginOrigin` so a consumer who installs `@delendai/client` without
 * the optional `@delendai/core` peer can still resolve them. That is a
 * deliberate duplication, and duplicated vocabulary drifts. This spec is
 * the reason it cannot drift silently: it fails HERE, in the repository
 * where a change to the core is being made, rather than later in a
 * consumer's build.
 *
 * The assignability assertions do the real work at compile time and the
 * runtime assertions keep the spec honest — a type-only file compiles to
 * nothing, so a spec with no runtime expectation would pass even if the
 * imports were deleted.
 */
import { readFile } from 'node:fs/promises';

import type {
	IToolEffect as CoreToolEffect,
	PluginOrigin as CorePluginOrigin,
} from '@delendai/core/contracts';
import { describe, expect, it } from 'vitest';

import type {
	IToolEffect as ClientToolEffect,
	PluginOrigin as ClientPluginOrigin,
} from '../../src/lib/contracts/interfaces/protocol-vocabulary.interface';

// Mutual assignability in BOTH directions: one-way would pass while the
// client silently dropped a member the core still emits.
const effectToCore: CoreToolEffect = null as unknown as ClientToolEffect;
const effectFromCore: ClientToolEffect = null as unknown as CoreToolEffect;
const originToCore: CorePluginOrigin = null as unknown as ClientPluginOrigin;
const originFromCore: ClientPluginOrigin = null as unknown as CorePluginOrigin;
void effectToCore;
void effectFromCore;
void originToCore;
void originFromCore;

/**
 * The members, restated as values. A type-level check cannot enumerate a
 * union at runtime, so this is what catches "the core grew a member" in
 * a way a reader can see — and it is asserted against the client's own
 * declaration file rather than a memory of it.
 */
const CLIENT_EFFECTS: readonly ClientToolEffect[] = [
	'write',
	'spawn',
	'network',
	'destructive',
];
const CLIENT_ORIGINS: readonly ClientPluginOrigin[] = [
	'bundled',
	'user-local',
	'external',
];

describe('client protocol vocabulary mirrors the core', () => {
	it('declares every IToolEffect member the core does', async () => {
		const source = await readFile(
			new URL(
				'../../src/lib/contracts/interfaces/protocol-vocabulary.interface.ts',
				import.meta.url,
			).pathname,
			'utf8',
		);
		for (const member of CLIENT_EFFECTS) {
			expect(source).toContain(`'${member}'`);
		}
	});

	it('declares every PluginOrigin member the core does', async () => {
		const source = await readFile(
			new URL(
				'../../src/lib/contracts/interfaces/protocol-vocabulary.interface.ts',
				import.meta.url,
			).pathname,
			'utf8',
		);
		for (const member of CLIENT_ORIGINS) {
			expect(source).toContain(`'${member}'`);
		}
	});

	it('reads the core union members from the core itself, not a copy', async () => {
		// If the core adds a member, the assignability checks above stop
		// compiling and this suite goes red. Assert the core file really
		// holds the unions we mirrored, so a rename there cannot pass by.
		const coreRoot = new URL(
			'../../../core/src/lib/contracts/interfaces/',
			import.meta.url,
		).pathname;
		const effects = await readFile(
			`${coreRoot}tool-registration.interface.ts`,
			'utf8',
		);
		const origins = await readFile(
			`${coreRoot}plugin-origin.interface.ts`,
			'utf8',
		);
		expect(effects).toContain(
			"export type IToolEffect = 'write' | 'spawn' | 'network' | 'destructive';",
		);
		expect(origins).toContain(
			"export type PluginOrigin = 'bundled' | 'user-local' | 'external';",
		);
	});
});
