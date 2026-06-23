/**
 * Compile + link smoke check for the SOLID refactor.
 *
 * Single Responsibility: prove that the new SOLID modules
 * (contracts/, registry/, languages/, dogmas/, presets/data/)
 * link together and the public symbols behave as documented.
 *
 * Why "compile + link" rather than "test every branch": the
 * SOLID refactor's value is in the **structural** contracts
 * (constructor injection, interface composition, priority
 * ordering). One spec that exercises the composition root
 * (`new PresetRegistry({...})` + `new DogmaRegistry([...])` +
 * `new PresetDetector(registry)`) is the smallest proof that
 * the OCP/DIP wiring is correct. The pre-existing rules.spec.ts
 * still covers the legacy `detectPresetForArea` facade.
 */
import { describe, it, expect } from 'vitest';

import {
	PresetRegistry,
	DogmaRegistry,
	PresetDetector,
} from '@mcp-vertex/rules/lib/frameworks/registry';
import type {
	ILanguageAdapter,
	IRulePreset,
	IDogmaAdapter,
	ICommandSet,
} from '@mcp-vertex/rules/lib/frameworks/contracts';
import { rustAdapter } from '@mcp-vertex/rules/lib/frameworks/languages/rust/rust.adapter';
import { rustCommandSetProvider } from '@mcp-vertex/rules/lib/frameworks/languages/rust/rust-command.provider';
import { eslintCommandSetProvider } from '@mcp-vertex/rules/lib/frameworks/languages/base/eslint-base.provider';
import { RUST_PRESET } from '@mcp-vertex/rules/lib/frameworks/presets/data/rust';
import { RUST_DOGMA } from '@mcp-vertex/rules/lib/frameworks/dogmas/rust.dogma';
import { ALL_PRESET_DATA } from '@mcp-vertex/rules/lib/frameworks/presets/data';
import { DEFAULT_DOGMA_ADAPTERS } from '@mcp-vertex/rules/lib/frameworks/dogmas';
import {
	fallbackCommandSetProvider,
	toAreaRulesLite,
} from '@mcp-vertex/rules/lib/tools/command-resolver';

const makeReader = (files: Record<string, string>) => ({
	readFile: (p: string) => files[p],
	exists: (p: string) => p in files,
	listDir: () => [] as string[],
});

describe('SOLID refactor: compile + link', () => {
	it('exposes the expected public symbols', () => {
		expect(typeof PresetRegistry).toBe('function');
		expect(typeof DogmaRegistry).toBe('function');
		expect(typeof PresetDetector).toBe('function');

		expect(rustAdapter.id).toBe('rs');
		expect(rustAdapter.priority).toBe(20);
		expect(rustAdapter.commands).toBe(rustCommandSetProvider);

		expect(typeof eslintCommandSetProvider.buildCommandSet).toBe(
			'function',
		);

		expect(RUST_PRESET.id).toBe('rust-clippy');
		expect(RUST_PRESET.language).toBe('rs');
		expect(RUST_PRESET.linter).toBe('clippy');
		expect(RUST_PRESET.requiredLinterDeps).toEqual(['cargo']);

		expect(RUST_DOGMA.language).toBe('rs');
		expect(RUST_DOGMA.ownership).toBe('borrow-checker');
		expect(RUST_DOGMA.errorModel).toBe('result');
		expect(RUST_DOGMA.bullets.length).toBeGreaterThanOrEqual(3);

		expect(ALL_PRESET_DATA).toContain(RUST_PRESET);
		expect(DEFAULT_DOGMA_ADAPTERS).toContain(RUST_DOGMA);

		expect(typeof fallbackCommandSetProvider.buildCommandSet).toBe(
			'function',
		);
		expect(typeof toAreaRulesLite).toBe('function');
	});

	it('composes a PresetRegistry + DogmaRegistry end-to-end (SOLID wiring)', () => {
		// S: registries are independent (PresetRegistry ≠ DogmaRegistry).
		const registry = new PresetRegistry({
			presets: [RUST_PRESET],
			adapters: [rustAdapter],
			defaultCommandSetProvider: (areaDir, rules) =>
				eslintCommandSetProvider.buildCommandSet(areaDir, rules),
		});
		const dogmas = new DogmaRegistry([RUST_DOGMA]);
		const detector = new PresetDetector(registry);

		// L: registry resolves by id; detector picks the priority winner.
		expect(registry.resolvePreset('rust-clippy')?.id).toBe('rust-clippy');
		expect(registry.supportedIds).toContain('rust-clippy');
		expect(dogmas.resolve('rs')?.language).toBe('rs');
		expect(
			detector.detect(
				makeReader({ 'Cargo.toml': '[package]\nname="x"' }),
				'',
			)?.presetId,
		).toBe('rust-clippy');

		// D: registry dispatches the per-language provider (Rust
		// adapter brings its own; the default ESLint one is bypassed).
		const cmds: ICommandSet = registry.commandsFor(
			'',
			{ linterConfigs: ['apps/foo/Cargo.toml'], typecheckConfigs: [] },
			'rs',
		);
		expect(cmds.checkCommand).toContain('cargo clippy');
		expect(cmds.fixCommand).toContain('--fix');
		expect(cmds.typecheckCommand).toContain('cargo check');
	});

	it('respects the priority order (Open/Closed)', () => {
		const high: ILanguageAdapter = {
			id: 'high',
			priority: 5,
			detect: () => ({ presetId: 'high-preset', reason: 'high' }),
		};
		const low: ILanguageAdapter = {
			id: 'low',
			priority: 50,
			detect: () => ({ presetId: 'low-preset', reason: 'low' }),
		};
		const reg = new PresetRegistry({
			presets: [
				{
					id: 'high-preset',
					framework: 'high',
					language: 'js',
					linter: 'eslint',
					linterConfigFile: 'h.config.mjs',
					linterConfigContent: '',
					conventions: [],
				},
				{
					id: 'low-preset',
					framework: 'low',
					language: 'js',
					linter: 'eslint',
					linterConfigFile: 'l.config.mjs',
					linterConfigContent: '',
					conventions: [],
				},
			],
			// intentional: registration order is low → high; sort must put high first
			adapters: [low, high],
		});
		const d = new PresetDetector(reg);
		expect(d.detect(makeReader({ 'a.txt': '' }), '')?.presetId).toBe(
			'high-preset',
		);
	});

	it('exposes the ICommandSet contract (one tuple, every provider returns it)', () => {
		const cs: ICommandSet = rustCommandSetProvider.buildCommandSet(
			'apps/foo',
			{
				linterConfigs: ['apps/foo/Cargo.toml'],
				typecheckConfigs: [],
			},
		);
		expect(cs.checkCommand).toBeDefined();
		expect(cs.fixCommand).toBeDefined();
		expect(cs.typecheckCommand).toBeDefined();
	});

	it('isolates the dogmas (S — Single Responsibility of the DogmaRegistry)', () => {
		// A DogmaRegistry is independent of PresetRegistry: a
		// future "ownership checker" tool can depend on
		// DogmaRegistry without dragging in the linter presets.
		const dogmas = new DogmaRegistry<IDogmaAdapter>([RUST_DOGMA]);
		expect(dogmas.supportedLanguages).toEqual(['rs']);
		expect(dogmas.resolve('rs')?.packageManager).toBe('cargo');
	});
});
