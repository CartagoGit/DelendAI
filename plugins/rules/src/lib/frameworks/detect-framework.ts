import type { IFileReader } from '@mcp-vertex/core/public';
import { joinRel } from '@mcp-vertex/core/public';

export interface IDetectResult {
	readonly presetId: string;
	readonly reason: string;
}

const readDeps = async (
	reader: IFileReader,
	areaDir: string,
): Promise<Record<string, string>> => {
	const raw = await reader.readFile(joinRel(areaDir, 'package.json'));
	if (raw === undefined) return {};
	try {
		const pkg = JSON.parse(raw) as {
			dependencies?: Record<string, string>;
			devDependencies?: Record<string, string>;
		};
		return { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
	} catch {
		return {};
	}
};

const hasTypeScript = async (
	reader: IFileReader,
	areaDir: string,
	deps: Record<string, string>,
): Promise<boolean> =>
	(await reader.exists(joinRel(areaDir, 'tsconfig.json'))) ||
	(await reader.exists(joinRel(areaDir, 'tsconfig.app.json'))) ||
	'typescript' in deps;

const fileExists = (
	reader: IFileReader,
	areaDir: string,
	name: string,
): Promise<boolean> => reader.exists(joinRel(areaDir, name));

/** Does the area contain any file matching the given suffix? (f00051 S2) */
const hasFileWithSuffix = async (
	reader: IFileReader,
	areaDir: string,
	suffix: string,
): Promise<boolean> => {
	for (const name of await reader.listDir(areaDir)) {
		if (name.endsWith(suffix)) return true;
	}
	return false;
};

/**
 * Per-language manifest/lockfile detection (f00051 S2).
 *
 * Each entry is an *exclusive* signal: a `pyproject.toml` / `go.mod` /
 * `Cargo.toml` / … beats the JS/TS catch-all because no polyglot repo
 * ships one of these by accident. Probed BEFORE the JS/TS branches so a
 * Python backend that also carries a `package.json` (for its JS frontend
 * tooling) still resolves to Python. The project's own config always
 * layers on top via the manifest's project-config-first ordering.
 *
 * Returns the resolved detection or `undefined` if no exclusive language
 * manifest is present in the area.
 */
const detectLanguageManifest = async (
	reader: IFileReader,
	areaDir: string,
): Promise<IDetectResult | undefined> => {
	if (await fileExists(reader, areaDir, 'pyproject.toml')) {
		return { presetId: 'python-ruff', reason: 'Python (pyproject.toml)' };
	}
	if (await fileExists(reader, areaDir, 'go.mod')) {
		return { presetId: 'go-golangci', reason: 'Go (go.mod)' };
	}
	if (await fileExists(reader, areaDir, 'Cargo.toml')) {
		return { presetId: 'rust-clippy', reason: 'Rust (Cargo.toml)' };
	}
	if (await fileExists(reader, areaDir, 'Gemfile')) {
		return { presetId: 'ruby-rubocop', reason: 'Ruby (Gemfile)' };
	}
	if (await fileExists(reader, areaDir, 'mix.exs')) {
		return { presetId: 'elixir-credo', reason: 'Elixir (mix.exs)' };
	}
	if (await fileExists(reader, areaDir, 'build.gradle.kts')) {
		return {
			presetId: 'kotlin-ktlint',
			reason: 'Kotlin (build.gradle.kts)',
		};
	}
	if (await fileExists(reader, areaDir, 'pom.xml')) {
		return { presetId: 'java-checkstyle', reason: 'Java (pom.xml)' };
	}
	if (await fileExists(reader, areaDir, 'Package.swift')) {
		return { presetId: 'swift-swiftlint', reason: 'Swift (Package.swift)' };
	}
	if (
		(await fileExists(reader, areaDir, '*.sln')) ||
		(await hasFileWithSuffix(reader, areaDir, '.csproj')) ||
		(await hasFileWithSuffix(reader, areaDir, '.sln'))
	) {
		return {
			presetId: 'csharp-dotnet',
			reason: 'C#/.NET (*.csproj / *.sln)',
		};
	}
	if (await fileExists(reader, areaDir, 'pubspec.yaml')) {
		return { presetId: 'dart-analyze', reason: 'Dart (pubspec.yaml)' };
	}
	if (await fileExists(reader, areaDir, 'build.sbt')) {
		return { presetId: 'scala-scalafmt', reason: 'Scala (build.sbt)' };
	}
	if (
		(await fileExists(reader, areaDir, 'stack.yaml')) ||
		(await hasFileWithSuffix(reader, areaDir, '.cabal'))
	) {
		return {
			presetId: 'haskell-hlint',
			reason: 'Haskell (stack.yaml / *.cabal)',
		};
	}
	if (await fileExists(reader, areaDir, 'build.zig')) {
		return { presetId: 'zig-fmt', reason: 'Zig (build.zig)' };
	}
	if (await fileExists(reader, areaDir, 'CMakeLists.txt')) {
		return { presetId: 'cpp-clang', reason: 'C++ (CMakeLists.txt)' };
	}
	return undefined;
};

/**
 * Resolve which preset applies to one area, by its deps + TS presence.
 * Framework wins over language; falls back to vanilla-ts/js. Pure over
 * the injected reader so it is fully testable.
 */
export const detectPresetForArea = async (
	reader: IFileReader,
	areaDir: string,
): Promise<IDetectResult> => {
	const deps = await readDeps(reader, areaDir);
	const ts = await hasTypeScript(reader, areaDir, deps);
	// f00051 S2 — exclusive per-language manifests win over both the
	// JS/TS catch-all and the PHP/Laravel branch (a Laravel area never
	// also ships a Cargo.toml/go.mod/pyproject.toml).
	const languageManifest = await detectLanguageManifest(reader, areaDir);
	if (languageManifest !== undefined) return languageManifest;
	if (
		(await reader.exists(joinRel(areaDir, 'artisan'))) ||
		(await reader.exists(joinRel(areaDir, 'composer.json')))
	) {
		return {
			presetId: 'laravel',
			reason: 'PHP/Laravel (composer.json/artisan)',
		};
	}
	if ('@angular/core' in deps) {
		return { presetId: 'angular', reason: 'dependency @angular/core' };
	}
	// Meta-frameworks first: they ship react/vue transitively, so the generic
	// `react`/`vue` checks below would misclassify them (H6).
	const hasConfig = async (name: string): Promise<boolean> => {
		for (const e of ['js', 'mjs', 'ts', 'cjs']) {
			if (await reader.exists(joinRel(areaDir, `${name}.${e}`)))
				return true;
		}
		return false;
	};
	if ('next' in deps || (await hasConfig('next.config'))) {
		return ts
			? {
					presetId: 'next-ts',
					reason: 'Next.js (next dep / next.config)',
				}
			: { presetId: 'react-js', reason: 'Next.js (JS) → react-js base' };
	}
	if (
		'@remix-run/react' in deps ||
		'@remix-run/node' in deps ||
		(await hasConfig('remix.config'))
	) {
		return ts
			? { presetId: 'remix', reason: 'Remix (@remix-run/*)' }
			: { presetId: 'react-js', reason: 'Remix (JS) → react-js base' };
	}
	if ('nuxt' in deps || (await hasConfig('nuxt.config'))) {
		return { presetId: 'nuxt', reason: 'Nuxt (nuxt dep / nuxt.config)' };
	}
	if ('astro' in deps || (await hasConfig('astro.config'))) {
		return ts
			? { presetId: 'astro', reason: 'Astro (astro dep / astro.config)' }
			: {
					presetId: 'vanilla-js',
					reason: 'Astro (JS) → vanilla-js base',
				};
	}
	if ('solid-js' in deps) {
		return ts
			? { presetId: 'solid-ts', reason: 'SolidJS (solid-js)' }
			: {
					presetId: 'vanilla-js',
					reason: 'SolidJS (JS) → vanilla-js base',
				};
	}
	if ('react' in deps) {
		return {
			presetId: ts ? 'react-ts' : 'react-js',
			reason: `dependency react (${ts ? 'ts' : 'js'})`,
		};
	}
	if ('vue' in deps) return { presetId: 'vue', reason: 'dependency vue' };
	if ('svelte' in deps) {
		return { presetId: 'svelte', reason: 'dependency svelte' };
	}
	if ('jquery' in deps) {
		return { presetId: 'jquery', reason: 'dependency jquery' };
	}
	return {
		presetId: ts ? 'vanilla-ts' : 'vanilla-js',
		reason: ts
			? 'tsconfig/typescript present'
			: 'no framework or TS detected',
	};
};
