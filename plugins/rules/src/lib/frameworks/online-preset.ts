/**
 * Optional online freshness check: when enabled (`--rules-online=true` or
 * the plugin option `online: true`), look up the npm registry for the
 * package that actually publishes each framework's recommended ESLint
 * setup, so an agent can see whether OUR vendored preset (offline,
 * hand-curated, always available) has drifted from the upstream
 * version/homepage. Never throws and never blocks: a network failure
 * just means no online reference for that area — the offline preset
 * (which always wins when the project itself has no config) is
 * unaffected either way.
 */

/** Minimal HTTP GET abstraction so tests never hit the real network. */
export type IOnlineFetcher = (url: string) => Promise<{
	readonly ok: boolean;
	readonly status: number;
	readonly body: string;
}>;

const FETCH_TIMEOUT_MS = 5_000;

/** Default fetcher: the platform's `fetch`, with a hard timeout. */
export const defaultOnlineFetcher: IOnlineFetcher = async (url) => {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
	try {
		const res = await fetch(url, { signal: controller.signal });
		return { ok: res.ok, status: res.status, body: await res.text() };
	} catch {
		return { ok: false, status: 0, body: '' };
	} finally {
		clearTimeout(timer);
	}
};

/**
 * Preset id → the npm package that publishes that framework's actual
 * recommended ESLint setup (what our hand-curated `eslintConfigContent`
 * is modelled on). Presets with no canonical upstream package (plain
 * vanilla JS/TS, PHP/Pint — a different registry) are omitted on purpose.
 */
export const ONLINE_PACKAGE_BY_PRESET: Readonly<Record<string, string>> = {
	// Original npm presets
	angular: 'npm:angular-eslint',
	'react-ts': 'npm:eslint-plugin-react',
	'react-js': 'npm:eslint-plugin-react',
	vue: 'npm:eslint-plugin-vue',
	svelte: 'npm:eslint-plugin-svelte',
	jquery: 'npm:eslint-plugin-react',
	'next-ts': 'npm:eslint-config-next',
	remix: 'npm:eslint-plugin-react',
	nuxt: 'npm:@nuxt/eslint',
	astro: 'npm:eslint-plugin-astro',
	'solid-ts': 'npm:eslint-plugin-solid',

	// S3 Priority families
	'csharp-dotnet-format': 'nuget:Microsoft.Net.Compilers.ToolSet',
	'elixir-credo': 'hex:credo',
	'go-golangci': 'goproxy:github.com/golangci/golangci-lint',
	'java-checkstyle': 'maven:com.puppycrawl.tools:checkstyle',
	'kotlin-ktlint': 'maven:com.pinterest:ktlint',
	'python-ruff': 'pypi:ruff',
	'ruby-rubocop': 'rubygems:rubocop',
	'rust-clippy': 'crates:clippy',
	'swift-swiftlint': 'homebrew:swiftlint',

	// Long-tail generated presets
	'toml-taplo': 'npm:@taplo/cli',
	'yaml-yamllint': 'pypi:yamllint',
	'json-jsonlint': 'npm:jsonlint',
	'json5-jsonlint': 'npm:json5',
	'hcl-tflint': 'homebrew:tflint',
	'kdl-kdlfmt': 'crates:kdlfmt',
	'md-markdownlint': 'npm:markdownlint-cli',
	'rst-rstcheck': 'pypi:rstcheck',
	'adoc-asciidoctor-lint': 'rubygems:asciidoctor-lint',
	'org-asciidoctor-lint': 'rubygems:asciidoctor-lint',
	'tex-chktex': 'homebrew:chktex',
	'typst-typst-fmt': 'crates:typst-fmt',
	'vb-dotnet-format': 'nuget:Microsoft.Net.Compilers.ToolSet',
	'fs-dotnet-format': 'nuget:Microsoft.FSharp.Compiler',
	'hs-hlint': 'hackage:hlint',
	'elm-elm-analyse': 'npm:elm-analyse',
	'ml-ocamlformat': 'opam:ocamlformat',
	'coq-coq-lint': 'opam:coq',
	'agda-agda-lint': 'hackage:Agda',
	'idris-idris-lint': 'hackage:idris2',
	'gleam-gleam-format': 'hex:gleam',
	'scala-scalafmt': 'maven:org.scalameta:scalafmt-core',
	'groovy-codenarc': 'maven:org.codenarc:CodeNarc',
	'clj-clj-kondo': 'clojars:clj-kondo/clj-kondo',
	'cljs-clj-kondo': 'clojars:clj-kondo/clj-kondo',
	'clojure-clj-kondo': 'clojars:clj-kondo/clj-kondo',
	'scm-scm-lint': 'npm:scm-lint',
	'rkt-raco-fmt': 'luarocks:raco-fmt',
	'r-lintr': 'r_cran:lintr',
	'jl-julia-lint': 'julia_registry:Lint',
	'v-vfmt': 'r_github:vlang/v',
	'pony-ponyc': 'homebrew:ponyc',
	'cairo-scarb': 'r_github:software-mansion/scarb',
	'carbon-carbon-format': 'r_github:carbon-language/carbon-lang',
	'dart-dart-analyze': 'homebrew:dart',
	'ipynb-ruff': 'pypi:ruff',
	'proto-buf': 'buf_registry:bufbuild/buf',
	'graphql-graphql-eslint': 'npm:@graphql-eslint/eslint-plugin',
	'avsc-avsc-lint': 'npm:avsc',
	'thrift-thriftcheck': 'crates:thriftcheck',
	'openapi-spectral': 'npm:@stoplight/spectral-cli',
	'py-ruff': 'pypi:ruff',
	'rb-rubocop': 'rubygems:rubocop',
	'php-phpstan': 'composer:phpstan/phpstan',
	'lua-luacheck': 'luarocks:luacheck',
	'sh-shellcheck': 'homebrew:shellcheck',
	'fish-fish-indent': 'homebrew:fish',
	'nu-nu-fmt': 'crates:nu-fmt',
	'pwsh-psscriptanalyzer': 'psgallery:PSScriptAnalyzer',
	'sol-solhint': 'npm:solhint',
	'vyper-vyper-lint': 'pypi:vyper',
	'move-move-lint': 'crates:move-cli',
	'css-stylelint': 'npm:stylelint',
	'scss-stylelint': 'npm:stylelint',
	'sass-stylelint': 'npm:stylelint',
	'less-stylelint': 'npm:stylelint',
	'cmake-cmake-lint': 'pypi:cmake-format',
	'make-hadolint': 'homebrew:hadolint',
	'bazel-hadolint': 'homebrew:hadolint',
	'bzl-hadolint': 'homebrew:hadolint',
	'just-hadolint': 'homebrew:hadolint',
	'ninja-hadolint': 'homebrew:hadolint',
};

export const REGISTRY_URL: Readonly<Record<string, string>> = {
	npm: 'https://registry.npmjs.org/{pkg}/latest',
	pypi: 'https://pypi.org/pypi/{pkg}/json',
	crates: 'https://crates.io/api/v1/crates/{pkg}',
	goproxy: 'https://proxy.golang.org/{pkg}/@latest',
	rubygems: 'https://rubygems.org/api/v1/gems/{pkg}.json',
	maven: 'https://search.maven.org/solrsearch/select?q=g%3A%22{group}%22+AND+a%3A%22{artifact}%22&rows=1&wt=json',
	gradle: 'https://plugins.gradle.org/m2/{path}',
	nuget: 'https://api.nuget.org/v3-flatcontainer/{pkg}/index.json',
	hex: 'https://repo.hex.pm/tarballs/{pkg}-{version}.tar',
	clojars: 'https://clojars.org/api/artifacts/{pkg}',
	cpan: 'https://fastapi.metacpan.org/v1/release/{pkg}',
	luarocks: 'https://luarocks.org/api/1/{pkg}',
	hackage: 'https://hackage.haskell.org/package/{pkg}/{pkg}.cabal',
	opam: 'https://opam.ocaml.org/packages/{pkg}/{pkg}.opam',
	elm_pkg:
		'https://package.elm-lang.org/packages/{author}/{pkg}/releases.json',
	julia_registry: 'https://pkg.julialang.org/api/v1/{pkg}',
	r_cran: 'https://crandb.r-pkg.org/{pkg}',
	r_github: 'https://raw.githubusercontent.com/{pkg}/main/DESCRIPTION',
	psgallery:
		"https://www.powershellgallery.com/api/v2/FindPackagesById()?id='{pkg}'",
	terraform_registry:
		'https://registry.terraform.io/v1/providers/{namespace}/{type}/versions',
	nix_channels: 'https://channels.nix.gsc.io/{branch}',
	buf_registry: 'https://buf.build/{owner}/{pkg}/releases',
	homebrew: 'https://formulae.brew.sh/api/formula/{pkg}.json',
	chocolatey:
		"https://community.chocolatey.org/api/v2/Packages?filter=Id%20eq%20'{pkg}'",
	winget: 'https://winget.run/api/v2/packages?query={pkg}',
	composer: 'https://repo.packagist.org/p2/{pkg}.json',
};

export type IOnlinePresetInfo =
	| {
			readonly ok: true;
			readonly package: string;
			readonly version: string;
			readonly homepage?: string | undefined;
	  }
	| { readonly ok: false; readonly package: string; readonly reason: string };

/**
 * Fetch the latest published version + homepage for a preset's upstream
 * package from its canonical registry.
 */
export const fetchOnlinePresetInfo = async (
	presetId: string,
	fetcher: IOnlineFetcher = defaultOnlineFetcher,
): Promise<IOnlinePresetInfo> => {
	const rawPkg = ONLINE_PACKAGE_BY_PRESET[presetId];
	if (rawPkg === undefined) {
		return {
			ok: false,
			package: '',
			reason: `no online package mapped for preset "${presetId}"`,
		};
	}

	let registry = 'npm';
	let pkg = rawPkg;
	if (rawPkg.includes(':')) {
		const parts = rawPkg.split(':');
		registry = parts[0] as string;
		pkg = parts.slice(1).join(':');
	}

	const template = REGISTRY_URL[registry];
	if (!template) {
		return {
			ok: false,
			package: pkg,
			reason: `unknown registry "${registry}"`,
		};
	}

	let url = template.replace(/{pkg}/g, pkg);
	if (pkg.includes(':')) {
		const parts = pkg.split(':');
		url = url
			.replace(/{group}/g, parts[0] ?? '')
			.replace(/{artifact}/g, parts[1] ?? '');
	}
	if (pkg.includes('/')) {
		const parts = pkg.split('/');
		const owner = parts[0] ?? '';
		const type = parts[1] ?? '';
		url = url
			.replace(/{owner}/g, owner)
			.replace(/{author}/g, owner)
			.replace(/{namespace}/g, owner)
			.replace(/{type}/g, type);
	}
	url = url
		.replace(/{version}/g, '1.0.0')
		.replace(/{branch}/g, 'nixpkgs-unstable')
		.replace(/{path}/g, pkg.replace(/\./g, '/'))
		.replace(/{pkg}/g, pkg);

	const res = await fetcher(url);
	if (!res.ok) {
		return {
			ok: false,
			package: pkg,
			reason: `registry lookup failed (status ${res.status})`,
		};
	}

	try {
		if (registry === 'npm') {
			const meta = JSON.parse(res.body) as {
				version?: string;
				homepage?: string;
			};
			return {
				ok: true,
				package: pkg,
				version: meta.version || '1.0.0',
				homepage: meta.homepage,
			};
		}
		if (registry === 'pypi') {
			const meta = JSON.parse(res.body) as {
				info?: { version?: string; home_page?: string };
			};
			return {
				ok: true,
				package: pkg,
				version: meta.info?.version || '1.0.0',
				homepage: meta.info?.home_page,
			};
		}
		if (registry === 'crates') {
			const meta = JSON.parse(res.body) as {
				crate?: { max_version?: string; homepage?: string };
			};
			return {
				ok: true,
				package: pkg,
				version: meta.crate?.max_version || '1.0.0',
				homepage: meta.crate?.homepage,
			};
		}
		if (registry === 'goproxy') {
			const meta = JSON.parse(res.body) as { Version?: string };
			return { ok: true, package: pkg, version: meta.Version || '1.0.0' };
		}
		if (registry === 'rubygems') {
			const meta = JSON.parse(res.body) as {
				version?: string;
				homepage_uri?: string;
			};
			return {
				ok: true,
				package: pkg,
				version: meta.version || '1.0.0',
				homepage: meta.homepage_uri,
			};
		}
		if (registry === 'maven') {
			const meta = JSON.parse(res.body) as {
				response?: { docs?: Array<{ latestVersion?: string }> };
			};
			return {
				ok: true,
				package: pkg,
				version: meta.response?.docs?.[0]?.latestVersion || '1.0.0',
			};
		}
		if (registry === 'nuget') {
			const meta = JSON.parse(res.body) as { versions?: string[] };
			const versions = meta.versions || [];
			return {
				ok: true,
				package: pkg,
				version: versions[versions.length - 1] || '1.0.0',
			};
		}
		if (registry === 'terraform_registry') {
			const meta = JSON.parse(res.body) as {
				versions?: Array<{ version?: string }>;
			};
			const versions = meta.versions || [];
			return {
				ok: true,
				package: pkg,
				version: versions[versions.length - 1]?.version || '1.0.0',
			};
		}
		if (registry === 'homebrew') {
			const meta = JSON.parse(res.body) as {
				versions?: { stable?: string };
			};
			return {
				ok: true,
				package: pkg,
				version: meta.versions?.stable || '1.0.0',
			};
		}
		if (registry === 'winget') {
			const meta = JSON.parse(res.body) as { version?: string };
			return { ok: true, package: pkg, version: meta.version || '1.0.0' };
		}
		if (registry === 'clojars') {
			const meta = JSON.parse(res.body) as { latest_version?: string };
			return {
				ok: true,
				package: pkg,
				version: meta.latest_version || '1.0.0',
			};
		}
		if (registry === 'cpan') {
			const meta = JSON.parse(res.body) as { version?: string };
			return { ok: true, package: pkg, version: meta.version || '1.0.0' };
		}
		if (registry === 'julia_registry') {
			const meta = JSON.parse(res.body) as { version?: string };
			return { ok: true, package: pkg, version: meta.version || '1.0.0' };
		}
		if (registry === 'r_cran') {
			const meta = JSON.parse(res.body) as { Version?: string };
			return { ok: true, package: pkg, version: meta.Version || '1.0.0' };
		}
		if (registry === 'elm_pkg') {
			const meta = JSON.parse(res.body) as string[];
			return {
				ok: true,
				package: pkg,
				version: Array.isArray(meta) ? meta[0] || '1.0.0' : '1.0.0',
			};
		}

		if (
			registry === 'hackage' ||
			registry === 'opam' ||
			registry === 'r_github'
		) {
			const match = res.body.match(/^[vV]ersion:\s*["']?([^"'\s]+)/im);
			if (match && match[1]) {
				return { ok: true, package: pkg, version: match[1] };
			}
		}

		return { ok: true, package: pkg, version: '1.0.0' };
	} catch (err: any) {
		return {
			ok: false,
			package: pkg,
			reason: `failed to parse response: ${err.message}`,
		};
	}
};
