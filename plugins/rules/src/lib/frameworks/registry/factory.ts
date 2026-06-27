import { eslintCommandSetProvider } from '../languages/base/eslint-base.provider';
import { rustAdapter } from '../languages/rust/rust.adapter';
import { DEFAULT_DOGMA_ADAPTERS } from '../dogmas';
import { ALL_PRESET_DATA } from '../presets/data';
import { VANILLA_JS_FALLBACK_PRESET } from '../presets/data/fallback';
import { RULE_PRESETS } from '../presets';
import type { IFileReader } from '@mcp-vertex/core/public';

import type {
	ILanguageAdapter,
	IDogmaAdapter,
	IRulePreset,
	ICommandSetProvider,
	ICommandSet,
} from '../../contracts';
import type { IAreaRulesLite } from './preset-registry';
import type { IPresetValidator } from './validator';
import type { IPolicyResolver } from '../../tools/policy-resolver';

import {
	buildDefaultRenderers,
	composeRoot,
	defaultPolicyResolver,
	type ICompositionRoot,
} from './composition-root';
import { DogmaRegistry } from './dogma-registry';
import { PresetDetector } from './detector';
import { PresetRegistry } from './preset-registry';
import { buildValidatorRegistry } from './validator-registry';

/**
 * Re-export the amplified composition root shape so callers
 * that import `ICompositionRoot` from `factory.ts` get the
 * full SOLID surface (registry + detector + validators +
 * renderers + policyResolver).
 */
export type { ICompositionRoot };

/**
 * The composition root (DIP — the single place that knows how
 * to wire every concrete adapter, preset, dogma, validator,
 * renderer, and policy resolver into a single object).
 * Consumers (tools, tests) call this once and pass the
 * resulting `ICompositionRoot` around via constructor
 * injection; they never rebuild the wiring themselves.
 *
 * Single Responsibility: this file's only job is to declare
 * the default wiring. It does not contain detection, command
 * logic, dogma rendering, or validation — those live in
 * their respective layers.
 *
 * Open/Closed: adding a new language = adding one entry to
 * the arrays below (and the adapter/data/dogma files they
 * point at). Adding a new SOLID seam (e.g. an auditor) is
 * adding one field to `ICompositionRoot` and one parameter
 * to `composeRoot` — no other file changes.
 */
const pythonAdapter: ILanguageAdapter = {
	id: 'python-adapter',
	priority: 30,
	detect: async (reader: IFileReader, areaDir: string) => {
		const rel =
			areaDir === '' || areaDir === 'root'
				? 'pyproject.toml'
				: `${areaDir}/pyproject.toml`;
		if (await reader.exists(rel)) {
			return {
				presetId: 'python-ruff',
				reason: 'Python (pyproject.toml)',
			};
		}
		return undefined;
	},
};

const goAdapter: ILanguageAdapter = {
	id: 'go-adapter',
	priority: 30,
	detect: async (reader: IFileReader, areaDir: string) => {
		const rel =
			areaDir === '' || areaDir === 'root'
				? 'go.mod'
				: `${areaDir}/go.mod`;
		if (await reader.exists(rel)) {
			return { presetId: 'go-golangci', reason: 'Go (go.mod)' };
		}
		return undefined;
	},
};

const rubyAdapter: ILanguageAdapter = {
	id: 'ruby-adapter',
	priority: 30,
	detect: async (reader: IFileReader, areaDir: string) => {
		const rel =
			areaDir === '' || areaDir === 'root'
				? 'Gemfile'
				: `${areaDir}/Gemfile`;
		if (await reader.exists(rel)) {
			return { presetId: 'ruby-rubocop', reason: 'Ruby (Gemfile)' };
		}
		return undefined;
	},
};

const elixirAdapter: ILanguageAdapter = {
	id: 'elixir-adapter',
	priority: 30,
	detect: async (reader: IFileReader, areaDir: string) => {
		const rel =
			areaDir === '' || areaDir === 'root'
				? 'mix.exs'
				: `${areaDir}/mix.exs`;
		if (await reader.exists(rel)) {
			return { presetId: 'elixir-credo', reason: 'Elixir (mix.exs)' };
		}
		return undefined;
	},
};

const kotlinAdapter: ILanguageAdapter = {
	id: 'kotlin-adapter',
	priority: 30,
	detect: async (reader: IFileReader, areaDir: string) => {
		const rel =
			areaDir === '' || areaDir === 'root'
				? 'build.gradle.kts'
				: `${areaDir}/build.gradle.kts`;
		if (await reader.exists(rel)) {
			return {
				presetId: 'kotlin-ktlint',
				reason: 'Kotlin (build.gradle.kts)',
			};
		}
		return undefined;
	},
};

const javaAdapter: ILanguageAdapter = {
	id: 'java-adapter',
	priority: 30,
	detect: async (reader: IFileReader, areaDir: string) => {
		const rel =
			areaDir === '' || areaDir === 'root'
				? 'pom.xml'
				: `${areaDir}/pom.xml`;
		if (await reader.exists(rel)) {
			return { presetId: 'java-checkstyle', reason: 'Java (pom.xml)' };
		}
		return undefined;
	},
};

const swiftAdapter: ILanguageAdapter = {
	id: 'swift-adapter',
	priority: 30,
	detect: async (reader: IFileReader, areaDir: string) => {
		const rel =
			areaDir === '' || areaDir === 'root'
				? 'Package.swift'
				: `${areaDir}/Package.swift`;
		if (await reader.exists(rel)) {
			return {
				presetId: 'swift-swiftlint',
				reason: 'Swift (Package.swift)',
			};
		}
		return undefined;
	},
};

const csharpAdapter: ILanguageAdapter = {
	id: 'csharp-adapter',
	priority: 30,
	detect: async (reader: IFileReader, areaDir: string) => {
		try {
			const files = await reader.listDir(
				areaDir === 'root' ? '' : areaDir,
			);
			if (
				files.some((f) => f.endsWith('.csproj') || f.endsWith('.sln'))
			) {
				return {
					presetId: 'csharp-dotnet',
					reason: 'C#/.NET (*.csproj / *.sln)',
				};
			}
		} catch {
			// ignore
		}
		return undefined;
	},
};

const phpAdapter: ILanguageAdapter = {
	id: 'php-adapter',
	priority: 40,
	detect: async (reader: IFileReader, areaDir: string) => {
		const composerRel =
			areaDir === '' || areaDir === 'root'
				? 'composer.json'
				: `${areaDir}/composer.json`;
		const artisanRel =
			areaDir === '' || areaDir === 'root'
				? 'artisan'
				: `${areaDir}/artisan`;
		if (
			(await reader.exists(composerRel)) ||
			(await reader.exists(artisanRel))
		) {
			return {
				presetId: 'laravel',
				reason: 'PHP/Laravel (composer.json/artisan)',
			};
		}
		return undefined;
	},
};

const jsTsAdapter: ILanguageAdapter = {
	id: 'js-ts-adapter',
	priority: 50,
	detect: async (
		reader: IFileReader,
		areaDir: string,
		deps: Readonly<Record<string, string>>,
	) => {
		if ('@angular/core' in deps) {
			return { presetId: 'angular', reason: 'dependency @angular/core' };
		}
		const nextConfig =
			areaDir === '' || areaDir === 'root'
				? 'next.config.js'
				: `${areaDir}/next.config.js`;
		const hasTs =
			(await reader.exists(
				areaDir === '' || areaDir === 'root'
					? 'tsconfig.json'
					: `${areaDir}/tsconfig.json`,
			)) || 'typescript' in deps;
		if ('next' in deps || (await reader.exists(nextConfig))) {
			return hasTs
				? {
						presetId: 'next-ts',
						reason: 'Next.js (next dep / next.config)',
					}
				: {
						presetId: 'react-js',
						reason: 'Next.js (JS) → react-js base',
					};
		}
		if ('react' in deps) {
			return {
				presetId: hasTs ? 'react-ts' : 'react-js',
				reason: `dependency react (${hasTs ? 'ts' : 'js'})`,
			};
		}
		if ('vue' in deps) {
			return { presetId: 'vue', reason: 'dependency vue' };
		}
		if ('svelte' in deps) {
			return { presetId: 'svelte', reason: 'dependency svelte' };
		}
		const hasPackageJson = await reader.exists(
			areaDir === '' || areaDir === 'root'
				? 'package.json'
				: `${areaDir}/package.json`,
		);
		if (hasPackageJson || hasTs) {
			return {
				presetId: hasTs ? 'vanilla-ts' : 'vanilla-js',
				reason: hasTs
					? 'tsconfig/typescript present'
					: 'package.json present',
			};
		}
		return undefined;
	},
};

const dartAdapter: ILanguageAdapter = {
	id: 'dart-adapter',
	priority: 30,
	detect: async (reader: IFileReader, areaDir: string) => {
		const rel =
			areaDir === '' || areaDir === 'root'
				? 'pubspec.yaml'
				: `${areaDir}/pubspec.yaml`;
		if (await reader.exists(rel)) {
			return { presetId: 'dart-analyze', reason: 'Dart (pubspec.yaml)' };
		}
		return undefined;
	},
};

const scalaAdapter: ILanguageAdapter = {
	id: 'scala-adapter',
	priority: 30,
	detect: async (reader: IFileReader, areaDir: string) => {
		const rel =
			areaDir === '' || areaDir === 'root'
				? 'build.sbt'
				: `${areaDir}/build.sbt`;
		if (await reader.exists(rel)) {
			return { presetId: 'scala-scalafmt', reason: 'Scala (build.sbt)' };
		}
		return undefined;
	},
};

const haskellAdapter: ILanguageAdapter = {
	id: 'haskell-adapter',
	priority: 30,
	detect: async (reader: IFileReader, areaDir: string) => {
		const stackRel =
			areaDir === '' || areaDir === 'root'
				? 'stack.yaml'
				: `${areaDir}/stack.yaml`;
		if (await reader.exists(stackRel)) {
			return {
				presetId: 'haskell-hlint',
				reason: 'Haskell (stack.yaml)',
			};
		}
		try {
			const files = await reader.listDir(
				areaDir === 'root' ? '' : areaDir,
			);
			if (files.some((f: string) => f.endsWith('.cabal'))) {
				return {
					presetId: 'haskell-hlint',
					reason: 'Haskell (*.cabal)',
				};
			}
		} catch {
			// ignore
		}
		return undefined;
	},
};

const zigAdapter: ILanguageAdapter = {
	id: 'zig-adapter',
	priority: 30,
	detect: async (reader: IFileReader, areaDir: string) => {
		const rel =
			areaDir === '' || areaDir === 'root'
				? 'build.zig'
				: `${areaDir}/build.zig`;
		if (await reader.exists(rel)) {
			return { presetId: 'zig-fmt', reason: 'Zig (build.zig)' };
		}
		return undefined;
	},
};

const cppAdapter: ILanguageAdapter = {
	id: 'cpp-adapter',
	priority: 30,
	detect: async (reader: IFileReader, areaDir: string) => {
		const rel =
			areaDir === '' || areaDir === 'root'
				? 'CMakeLists.txt'
				: `${areaDir}/CMakeLists.txt`;
		if (await reader.exists(rel)) {
			return { presetId: 'cpp-clang', reason: 'C++ (CMakeLists.txt)' };
		}
		return undefined;
	},
};

export const buildDefaultComposition = (
	overrides: {
		readonly presets?: readonly IRulePreset[];
		readonly adapters?: readonly ILanguageAdapter[];
		readonly dogmas?: readonly IDogmaAdapter[];
		/**
		 * Optional override for the default `ICommandSetProvider`
		 * used by adapters that do not bring their own. Today
		 * every adapter that ships brings its own provider; this
		 * exists for testability (a test can pass a deterministic
		 * stub).
		 */
		readonly defaultCommandSetProvider?: ICommandSetProvider;
		/**
		 * Optional override for the validators list. Defaults to
		 * `[defaultPresetValidator]`. A test can pass an empty
		 * list to disable validation.
		 */
		readonly validators?: readonly IPresetValidator[];
		/**
		 * Optional override for the policy resolver. Defaults to
		 * `PROJECT_OVER_DOGMA_OVER_DEFAULT`. A host that wants
		 * a different priority order (e.g. "treat dogma as
		 * advisory only") can pass a different implementation.
		 */
		readonly policyResolver?: IPolicyResolver;
	} = {},
): ICompositionRoot => {
	// The vanilla-js fallback is always present (S — the
	// fallback is a real preset, not a magic string).
	const presets = overrides.presets ?? [
		VANILLA_JS_FALLBACK_PRESET,
		...RULE_PRESETS,
		...ALL_PRESET_DATA,
	];
	const adapters = overrides.adapters ?? [
		rustAdapter,
		pythonAdapter,
		goAdapter,
		rubyAdapter,
		elixirAdapter,
		kotlinAdapter,
		javaAdapter,
		swiftAdapter,
		csharpAdapter,
		phpAdapter,
		jsTsAdapter,
		dartAdapter,
		scalaAdapter,
		haskellAdapter,
		zigAdapter,
		cppAdapter,
	];
	const dogmas = overrides.dogmas ?? DEFAULT_DOGMA_ADAPTERS;
	const provider: ICommandSetProvider =
		overrides.defaultCommandSetProvider ?? eslintCommandSetProvider;
	// PresetRegistry takes a plain callback; ICommandSetProvider is an
	// object with a `buildCommandSet` method (DIP seam). The adapter
	// below bridges the two so the public override surface stays the
	// ICommandSetProvider contract callers already use.
	const defaultProvider = (
		areaDir: string,
		rules: IAreaRulesLite,
	): ICommandSet => provider.buildCommandSet(areaDir, rules);
	const validators = buildValidatorRegistry(overrides.validators);
	const renderers = buildDefaultRenderers();
	const policyResolver = overrides.policyResolver ?? defaultPolicyResolver;

	// Single Responsibility: the composition root (a *shape*)
	// is assembled by `composeRoot`. The factory (this file)
	// is the *wiring* of defaults. The two are decoupled so
	// tests can call `composeRoot` directly with a synthetic
	// set of seams (no defaults needed).
	const root = composeRoot({
		presets,
		adapters,
		dogmas,
		validators,
		renderers,
		policyResolver,
	});

	// The public factory overrides the registry/detector/dogmas
	// with instances wired to the caller's `defaultCommandSetProvider`,
	// so the legacy smoke test that asserts
	// `root.registry.commandsFor(...)` uses the caller-supplied
	// default (when an adapter does not bring its own).
	const registry = new PresetRegistry({
		presets,
		adapters,
		defaultCommandSetProvider: defaultProvider,
	});
	const detector = new PresetDetector(registry);
	const dogmasRegistry = new DogmaRegistry(dogmas);

	return {
		...root,
		registry,
		detector,
		dogmas: dogmasRegistry,
	};
};
