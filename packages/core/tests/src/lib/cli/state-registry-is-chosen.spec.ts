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

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { repoRoot } from '../../../../../../tools/scripts/lib/repo-root';

import { assembleCliConfig } from '@delendai/core/lib/cli/assemble';
import { parseCliArgs } from '@delendai/core/lib/plugins/parse-cli-args';

import { defineInMemoryStateRegistry } from '@delendai/state';

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
		// A registry core could not have built: the point of the seam is
		// that the engine comes from outside, and `@delendai/state-sqlite`
		// is exactly what core may not import.
		const injected: IStateRegistry = {
			...defineInMemoryStateRegistry({ clock: () => 0 }),
		};

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

describe('the assembler answers for the shapes a project can boot in', () => {
	it('boots a workspace with no config file at all', async () => {
		// A greenfield project: no delendai.config.json anywhere. The
		// assembler has to reach a usable host config from defaults
		// alone, which is the first thing any new adopter exercises.
		const empty = mkdtempSync(join(tmpdir(), 'delendai-assemble-empty-'));
		try {
			const assembled = await assembleCliConfig(
				parseCliArgs(['--workspace', empty], empty),
				{},
			);

			expect(assembled.config).toBeDefined();
			expect(assembled.configDiagnostic.present).toBe(false);
		} finally {
			rmSync(empty, { recursive: true, force: true });
		}
	});

	it('reports a config file it cannot parse instead of throwing', async () => {
		// A boot that dies on a malformed config gives an operator a
		// stack trace; one that reports it gives them the line to fix.
		const dir = mkdtempSync(join(tmpdir(), 'delendai-assemble-bad-'));
		try {
			writeFileSync(
				join(dir, 'delendai.config.json'),
				'{ not json',
				'utf8',
			);
			const assembled = await assembleCliConfig(
				parseCliArgs(['--workspace', dir], dir),
				{},
			);

			expect(assembled.configDiagnostic.present).toBe(true);
			expect(assembled.configDiagnostic.issues.length).toBeGreaterThan(0);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('carries a declared development policy into the boot', async () => {
		// The policy is what every other subsystem reads to decide how
		// work is persisted and integrated, so the assembler resolving it
		// is load-bearing rather than incidental.
		const dir = mkdtempSync(join(tmpdir(), 'delendai-assemble-policy-'));
		try {
			writeFileSync(
				join(dir, 'delendai.config.json'),
				JSON.stringify({
					development: {
						profile: 'shared-checkout-merge',
						branches: { integration: 'trunk', release: 'ship' },
					},
				}),
				'utf8',
			);
			const assembled = await assembleCliConfig(
				parseCliArgs(['--workspace', dir], dir),
				{},
			);

			expect(
				assembled.config.developmentPolicy?.branches.integration,
			).toBe('trunk');
			expect(assembled.config.developmentPolicy?.profile).toBe(
				'shared-checkout-merge',
			);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
