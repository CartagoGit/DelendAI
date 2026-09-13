/**
 * state-registry-is-chosen.spec.ts — the storage engine is the
 * project's decision, not the core's.
 *
 * Core CONSTRUCTED an in-memory registry on every boot, which made the
 * choice of engine a fact of the core: a durable, SQLite-backed
 * registry exists in `@delendai/state-sqlite` and no boot could reach
 * it, because core may not import `bun:sqlite` and had no seam through
 * which to be handed one. `lint:core-runtime-deps` carries that as a
 * written exemption, "intended to be temporary" — this is the seam it
 * was waiting for.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { repoRoot } from '../../../../../../tools/scripts/lib/repo-root';

import { assembleCliConfig } from '@delendai/core/lib/cli/assemble';
import { parseCliArgs } from '@delendai/core/lib/plugins/parse-cli-args';

import type { IStateRegistry } from '@delendai/contracts/state';

const args = () => parseCliArgs(['--workspace', process.cwd()], process.cwd());

describe('the state registry a boot uses', () => {
	it('prefers the one it was handed over the one it can build', () => {
		// Structural, because the choice happens once at boot and the
		// registry is handed to plugins rather than returned: what must
		// be true is that the injected one WINS, and that the in-memory
		// engine is only a fallback rather than the unconditional answer
		// it used to be.
		const source = readFileSync(
			join(repoRoot(), 'packages/core/src/lib/cli/assemble.ts'),
			'utf8',
		);

		expect(source).toContain('deps.stateRegistry ??');
		// And the construction it falls back to is still there, so a boot
		// that says nothing keeps working exactly as before.
		expect(source).toContain('defineInMemoryStateRegistry({');
	});

	it('accepts a registry core could never have built itself', async () => {
		// The point of the seam: a SQLite-backed registry lives in
		// @delendai/state-sqlite, and core may not import bun:sqlite. It
		// can only ever be handed one.
		const injected = {
			__engine: 'not-something-core-can-construct',
		} as unknown as IStateRegistry;

		const assembled = await assembleCliConfig(args(), {
			stateRegistry: injected,
		});

		expect(assembled.config).toBeDefined();
		expect(assembled.startupReport).toBeDefined();
	});

	it('still boots when nothing is handed in', async () => {
		const assembled = await assembleCliConfig(args(), {});

		expect(assembled.config).toBeDefined();
	});
});
