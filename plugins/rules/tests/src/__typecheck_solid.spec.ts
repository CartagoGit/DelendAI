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
	defaultPresetValidator,
	composeValidators,
} from '@mcp-vertex/rules/lib/frameworks/registry';
import { buildDefaultComposition } from '@mcp-vertex/rules/lib/frameworks/registry/factory';
import {
	stringDogmaRenderer,
	DogmaRendererRegistry,
} from '@mcp-vertex/rules/lib/frameworks/dogmas';
import { PROJECT_OVER_DOGMA_OVER_DEFAULT } from '@mcp-vertex/rules/lib/tools/policy-resolver';
import type {
	ILanguageAdapter,
	IRulePreset,
	ICommandSet,
	ICommandSetProvider,
	IPresetIdentity,
	IPresetConfigs,
	IPresetConventions,
	IPresetCommands,
	IPresetToolchain,
} from '@mcp-vertex/rules/lib/frameworks/contracts';
import { rustAdapter } from '@mcp-vertex/rules/lib/frameworks/languages/rust/rust.adapter';
import { rustCommandSetProvider } from '@mcp-vertex/rules/lib/frameworks/languages/rust/rust-command.provider';
import { eslintCommandSetProvider } from '@mcp-vertex/rules/lib/frameworks/languages/base/eslint-base.provider';
import { RUST_PRESET } from '@mcp-vertex/rules/lib/frameworks/presets/data/rust';
import { RUST_DOGMA } from '@mcp-vertex/rules/lib/frameworks/dogmas/rust.dogma';
import { ALL_PRESET_DATA } from '@mcp-vertex/rules/lib/frameworks/presets/data';
import { DEFAULT_DOGMA_ADAPTERS } from '@mcp-vertex/rules/lib/frameworks/dogmas';
import { fallbackCommandSetProvider } from '@mcp-vertex/rules/lib/tools/command-resolver';
import { toAreaRulesLite } from '@mcp-vertex/rules/lib/frameworks/legacy-shape/adapter';

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
		const dogmas = new DogmaRegistry([RUST_DOGMA]);
		expect(dogmas.supportedLanguages).toEqual(['rs']);
		expect(dogmas.resolve('rs')?.packageManager).toBe('cargo');
	});

	it('exposes a single composition root (DIP — buildDefaultComposition)', () => {
		// The factory is the only place that knows the default
		// wiring of presets + adapters + dogmas. A consumer
		// (tool, test) calls it once and passes the registries
		// around — no module-level singletons, no re-wiring.
		const root = buildDefaultComposition();
		expect(root.registry.supportedIds).toContain('rust-clippy');
		expect(root.dogmas.supportedLanguages).toContain('rs');
		expect(root.detector).toBeInstanceOf(PresetDetector);

		// The factory also accepts overrides (test-only seam,
		// never required in production). Confirms OCP: the
		// wiring is data, not code.
		const overridden = buildDefaultComposition({
			adapters: [],
			presets: [RUST_PRESET],
		});
		expect(overridden.registry.supportedIds).toEqual(['rust-clippy']);
	});

	it('encodes the project > dogma > default policy in one place (S11 stub)', () => {
		// The resolver is the SINGLE place the priority order is
		// encoded. The 3 tools will call this; they will not
		// branch on `fromProject` themselves. Today only the
		// *project* layer produces a non-default command set;
		// the dogma layer is a stub (S3 / S11 will fill it in
		// with the per-language bullets).
		const fallback: ICommandSet = {
			checkCommand: 'echo default',
		};
		const fromDogma: ICommandSet = { checkCommand: 'echo dogma' };
		const fromProject: ICommandSet = { checkCommand: 'echo project' };

		// project wins
		const a = PROJECT_OVER_DOGMA_OVER_DEFAULT.resolveCommand({
			areaDir: '',
			fromProject,
			fromDogma,
			fromDefault: fallback,
		});
		expect(a.effective).toBe('project');
		expect(a.command).toBe('echo project');
		expect(a.rationale).toContain('project wins');

		// dogma wins when no project
		const b = PROJECT_OVER_DOGMA_OVER_DEFAULT.resolveCommand({
			areaDir: '',
			fromDogma,
			fromDefault: fallback,
		});
		expect(b.effective).toBe('dogma');
		expect(b.command).toBe('echo dogma');

		// default wins when neither
		const c = PROJECT_OVER_DOGMA_OVER_DEFAULT.resolveCommand({
			areaDir: '',
			fromDefault: fallback,
		});
		expect(c.effective).toBe('default');
		expect(c.command).toBe('echo default');
	});

	it('guarantees IRulePreset Liskov (composition of 5 narrow contracts)', () => {
		// RUST_PRESET is *typed* as IRulePreset = intersection
		// of the 5 narrow segments. The `satisfies` checks
		// each segment independently — if any field is missing
		// from any segment, the test fails to compile.
		const identity: IPresetIdentity = RUST_PRESET;
		const configs: IPresetConfigs = RUST_PRESET;
		const conventions: IPresetConventions = RUST_PRESET;
		const commands: IPresetCommands = RUST_PRESET;
		const toolchain: IPresetToolchain = RUST_PRESET;
		expect(identity.id).toBe('rust-clippy');
		expect(configs.linterConfigFile).toContain('clippy');
		expect(conventions.conventions.length).toBeGreaterThan(0);
		expect(toolchain.requiredLinterDeps).toEqual(['cargo']);
		void commands; // optional fields; assert it satisfies the shape
	});

	it('keeps adapter commands + default provider substitutable (DIP)', () => {
		// A test can swap the default provider entirely; the
		// Rust adapter still uses its own (DIP — adapter wins
		// when it brings a provider).
		let calls = 0;
		const stubDefault: ICommandSetProvider = {
			buildCommandSet(): ICommandSet {
				calls += 1;
				return { checkCommand: 'stub-default' };
			},
		};
		// PresetRegistry takes a plain callback; wrap the provider as one
		// so the test exercises the same adapter shape the factory uses.
		const reg = new PresetRegistry({
			presets: [RUST_PRESET],
			adapters: [rustAdapter],
			defaultCommandSetProvider: (areaDir, rules) =>
				stubDefault.buildCommandSet(areaDir, rules),
		});
		// Rust adapter brings its own; the default is NOT called.
		const out = reg.commandsFor(
			'',
			{ linterConfigs: ['Cargo.toml'], typecheckConfigs: [] },
			'rs',
		);
		expect(out.checkCommand).toContain('cargo clippy');
		expect(calls).toBe(0);
	});

	it('validates a preset via the OCP `IPresetValidator` seam', () => {
		// A correct preset produces zero findings.
		expect(defaultPresetValidator.validate(RUST_PRESET)).toEqual([]);

		// A broken preset (empty linter content + empty conventions)
		// produces two findings with stable codes.
		const broken: IRulePreset = {
			...RUST_PRESET,
			id: 'broken-preset',
			linterConfigContent: '   ', // whitespace-only counts as empty
			conventions: [],
		};
		const findings = defaultPresetValidator.validate(broken);
		expect(findings.map((f) => f.code).sort()).toEqual([
			'empty-conventions',
			'empty-linter-config',
		]);
	});

	it('composes validators (OCP — adding a validator = appending, never editing)', () => {
		// A second validator that flags preset ids longer than 30 chars.
		const idLengthValidator = {
			validate(preset: IRulePreset) {
				if (preset.id.length > 30) {
					return [
						{
							code: 'linter-deps-mismatch' as const,
							message: `Preset id "${preset.id}" is too long (>30 chars).`,
							presetId: preset.id,
						},
					];
				}
				return [];
			},
		};
		const combined = composeValidators(
			defaultPresetValidator,
			idLengthValidator,
		);
		const longId: IRulePreset = {
			...RUST_PRESET,
			id: 'rust-clippy-with-a-very-long-id-that-exceeds-thirty',
		};
		const findings = combined.validate(longId);
		expect(findings.map((f) => f.code)).toContain('linter-deps-mismatch');
	});

	it('renders dogmas via the DIP `IDogmaRenderer` seam', () => {
		// The default renderer produces a one-line string that an
		// LLM can read as a single sentence.
		const out = stringDogmaRenderer.render(RUST_DOGMA);
		expect(out.rendererId).toBe('string');
		expect(out.payload).toContain('rust (cargo, rust-2024)');
		expect(out.payload).toContain('borrow-checker');
		expect(out.payload).toContain('Result');
		expect(out.payload).toContain('?');
		// The bullets are appended after the dimensions:
		expect(out.payload).toMatch(/Idioms:.*\?/);
	});

	it('looks up renderers by id (DIP — DogmaRendererRegistry)', () => {
		// Adding a second renderer (e.g. `markdown`) does not
		// touch the registry class; the registry looks up by id
		// and falls back to the default.
		const markdownRenderer = {
			id: 'markdown',
			render(d: typeof RUST_DOGMA) {
				return {
					payload: `## ${d.language} (${d.version})\n- ownership: ${d.ownership}\n- error: ${d.errorModel}\n`,
					rendererId: 'markdown',
				};
			},
		};
		const reg = new DogmaRendererRegistry(
			[stringDogmaRenderer, markdownRenderer],
			'string',
		);
		expect(reg.resolve('markdown').id).toBe('markdown');
		expect(reg.resolve('string').id).toBe('string');
		expect(reg.resolve('unknown-id').id).toBe('string'); // fallback
		expect(reg.resolve().id).toBe('string'); // default
	});

	it('factory accepts a fully custom preset (DIP override)', () => {
		// A test that wants to exercise a 1-element adapter list
		// AND a 1-element preset list does so without touching the
		// wiring code.
		const customAdapter: ILanguageAdapter = {
			id: 'custom',
			priority: 10,
			detect: () => ({ presetId: 'custom-preset', reason: 'custom' }),
		};
		const customPreset: IRulePreset = {
			id: 'custom-preset',
			framework: 'custom',
			language: 'rs',
			linter: 'clippy',
			linterConfigFile: 'custom.clippy.toml',
			linterConfigContent: '# custom',
			conventions: ['custom convention'],
		};
		const root = buildDefaultComposition({
			adapters: [customAdapter],
			presets: [customPreset],
		});
		expect(root.registry.supportedIds).toEqual(['custom-preset']);
		expect(
			root.detector.detect(makeReader({ 'a.txt': '' }), '')?.presetId,
		).toBe('custom-preset');
	});

	it('amplified composition root exposes validators + renderers + policyResolver (S — single face)', () => {
		// The composition root is the *single* face a tool
		// imports to access every SOLID seam. The three new
		// fields are mandatory — a tool that wants to validate
		// / render / resolve a policy reads them from `root`,
		// not from a module-level singleton.
		const root = buildDefaultComposition();
		expect(root.validators).toBeDefined();
		expect(root.renderers).toBeDefined();
		expect(root.policyResolver).toBeDefined();
		// Validators and renderers are pre-populated with their
		// defaults; the policy resolver is the one place the
		// priority order lives.
		expect(root.validators.validators.length).toBeGreaterThanOrEqual(1);
		expect(root.renderers.resolve('string').id).toBe('string');
	});

	it('validators run via the registry (OCP — composition over inheritance)', () => {
		// The validator-registry composes all validators; a
		// test can pass a custom list to exercise a specific
		// check in isolation.
		const root = buildDefaultComposition();
		const findings = root.validators.validate(RUST_PRESET);
		expect(findings).toEqual([]); // RUST_PRESET is well-formed
	});

	it('factory accepts a custom policy resolver (DIP override)', () => {
		// A host that wants a different priority order (e.g.
		// "treat dogma as advisory only") injects a different
		// IPolicyResolver via the factory. The composition root
		// never branches on the resolver type.
		const customPolicy = {
			resolveCommand({
				fromDefault,
			}: {
				areaDir: string;
				fromDefault: ICommandSet;
			}) {
				return {
					effective: 'default' as const,
					command: fromDefault.checkCommand,
					rationale:
						'Host policy: always default; project and dogma are advisory.',
					fromDefault,
				};
			},
		};
		const root = buildDefaultComposition({
			policyResolver: customPolicy,
		});
		const out = root.policyResolver.resolveCommand({
			areaDir: '',
			fromProject: { checkCommand: 'echo project' },
			fromDefault: { checkCommand: 'echo default' },
		});
		// Even when a project config is present, the host's
		// custom resolver returns `default`. This proves the
		// priority order is *encoded in the resolver*, not
		// in the tools.
		expect(out.effective).toBe('default');
		expect(out.rationale).toContain('Host policy');
	});
});
