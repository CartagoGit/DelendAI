/**
 * Compile-only smoke check for the SOLID refactor. The plugin's
 * typecheck step runs every `.ts` file; this spec exists so a
 * single `import` here forces the new modules through tsc. If
 * the SOLID refactor breaks (a type drift in a contract, a
 * missing re-export in the barrel), the typecheck fails and
 * this spec's existence forces the failure to be visible.
 *
 * Single Responsibility: prove the SOLID modules link. No
 * assertions; no runtime checks. The actual semantic coverage
 * lives in `tests/src/lib/frameworks/registry/*`.
 */
import { describe, it, expect } from 'vitest';

import {
	// contracts layer (the public surface of SOLID)
	PresetRegistry,
	DogmaRegistry,
	PresetDetector,
} from './lib/frameworks/registry';
import type {
	ILanguageAdapter,
	IRulePreset,
	IDogmaAdapter,
	ICommandSet,
} from './lib/frameworks/contracts';
import { rustAdapter } from './lib/frameworks/languages/rust/rust.adapter';
import { rustCommandSetProvider } from './lib/frameworks/languages/rust/rust-command.provider';
import { eslintCommandSetProvider } from './lib/frameworks/languages/base/eslint-base.provider';
import { RUST_PRESET } from './lib/frameworks/presets/data/rust';
import { RUST_DOGMA } from './lib/frameworks/dogmas/rust.dogma';
import { ALL_PRESET_DATA } from './lib/frameworks/presets/data';
import { DEFAULT_DOGMA_ADAPTERS } from './lib/frameworks/dogmas';
import { fallbackCommandSetProvider } from './lib/tools/command-resolver';
import { toAreaRulesLite } from './lib/frameworks/legacy-shape/adapter';

describe('SOLID refactor: compile + link', () => {
	it('exposes the expected public symbols', () => {
		// Registry classes (DIP — constructed with their deps)
		expect(typeof PresetRegistry).toBe('function');
		expect(typeof DogmaRegistry).toBe('function');
		expect(typeof PresetDetector).toBe('function');

		// Rust adapter (OCP — one file per language)
		expect(rustAdapter.id).toBe('rs');
		expect(rustAdapter.priority).toBe(20);
		expect(rustAdapter.commands).toBe(rustCommandSetProvider);

		// Shared ESLint provider (reused by every JS/TS adapter)
		expect(typeof eslintCommandSetProvider.buildCommandSet).toBe(
			'function',
		);

		// DATA: the Rust preset + the Rust dogma
		expect(RUST_PRESET.id).toBe('rust-clippy');
		expect(RUST_PRESET.language).toBe('rs');
		expect(RUST_PRESET.linter).toBe('clippy');
		expect(RUST_PRESET.requiredLinterDeps).toEqual(['cargo']);
		expect(RUST_DOGMA.language).toBe('rs');
		expect(RUST_DOGMA.ownership).toBe('borrow-checker');
		expect(RUST_DOGMA.errorModel).toBe('result');
		expect(RUST_DOGMA.bullets.length).toBeGreaterThanOrEqual(3);

		// Composition roots
		expect(ALL_PRESET_DATA).toContain(RUST_PRESET);
		expect(DEFAULT_DOGMA_ADAPTERS).toContain(RUST_DOGMA);

		// Fallback command provider (last-resort command emitter)
		expect(typeof fallbackCommandSetProvider.buildCommandSet).toBe(
			'function',
		);
		expect(typeof toAreaRulesLite).toBe('function');
	});

	it('composes a PresetRegistry + DogmaRegistry end-to-end (SOLID wiring)', () => {
		// Single Responsibility: the registry composes presets + adapters;
		// the DogmaRegistry composes dogmas. They are independent.
		const presets: readonly IRulePreset[] = [RUST_PRESET];
		const adapters: readonly ILanguageAdapter[] = [rustAdapter];
		const dogmas: readonly IDogmaAdapter[] = [RUST_DOGMA];

		const registry = new PresetRegistry({
			presets,
			adapters,
			defaultCommandSetProvider: (areaDir, rules) =>
				eslintCommandSetProvider.buildCommandSet(areaDir, rules),
		});
		const dogmas_ = new DogmaRegistry(dogmas);
		const detector = new PresetDetector(registry);

		// Liskov: every adapter is substitutable; the registry
		// resolves the preset by id and the commands by language.
		expect(registry.resolvePreset('rust-clippy')?.id).toBe('rust-clippy');
		expect(registry.supportedIds).toContain('rust-clippy');
		expect(dogmas_.resolve('rs')?.language).toBe('rs');
		expect(
			detector.detect(
				// Synthetic reader: Cargo.toml present
				{
					readFile: (p: string) =>
						p.endsWith('package.json') ? undefined : undefined,
					exists: (p: string) => p.endsWith('Cargo.toml'),
					listDir: () => [],
				},
				'',
			)?.presetId,
		).toBe('rust-clippy');

		// Command resolution through the registry: the Rust adapter
		// brings its own provider, so the default is bypassed.
		const cmds = registry.commandsFor(
			'',
			{ linterConfigs: ['apps/foo/Cargo.toml'], typecheckConfigs: [] },
			'rs',
		);
		expect(cmds.checkCommand).toContain('cargo clippy');
		expect(cmds.fixCommand).toContain('--fix');
		expect(cmds.typecheckCommand).toContain('cargo check');
	});

	it('respects the priority order (Open/Closed)', () => {
		// Two adapters at different priorities: detector must
		// pick the higher-priority one when both claim the area.
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
			adapters: [low, high], // intentional: registration order is low → high; sort must put high first
		});
		const d = new PresetDetector(reg);
		expect(
			d.detect(
				{
					readFile: () => undefined,
					exists: () => true,
					listDir: () => [],
				},
				'',
			)?.presetId,
		).toBe('high-preset');
	});

	it('renders the ICommandSet contract (one place that knows the tuple shape)', () => {
		// S: ICommandSet is the single source of truth for the
		// 3-field tuple. Every ICommandSetProvider returns it.
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
});
