import { describe, expect, it } from 'vitest';
import type { IOnlineFetcher } from '../../../src/lib/frameworks/online-preset';
import { fetchOnlinePresetInfo } from '../../../src/lib/frameworks/online-preset';

describe('online-preset freshness checks', () => {
	it('returns error for unknown preset', async () => {
		const result = await fetchOnlinePresetInfo('non-existent-preset');
		expect(result.ok).toBe(false);
		expect(result.package).toBe('');
	});

	it('resolves npm registry info successfully', async () => {
		const fetcher: IOnlineFetcher = async (url) => {
			expect(url).toBe(
				'https://registry.npmjs.org/angular-eslint/latest',
			);
			return {
				ok: true,
				status: 200,
				body: JSON.stringify({
					version: '17.3.0',
					homepage:
						'https://github.com/angular-eslint/angular-eslint',
				}),
			};
		};

		const result = await fetchOnlinePresetInfo('angular', fetcher);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.package).toBe('angular-eslint');
			expect(result.version).toBe('17.3.0');
			expect(result.homepage).toBe(
				'https://github.com/angular-eslint/angular-eslint',
			);
		}
	});

	it('resolves pypi registry info successfully', async () => {
		const fetcher: IOnlineFetcher = async (url) => {
			expect(url).toBe('https://pypi.org/pypi/ruff/json');
			return {
				ok: true,
				status: 200,
				body: JSON.stringify({
					info: {
						version: '0.3.0',
						home_page: 'https://github.com/astral-sh/ruff',
					},
				}),
			};
		};

		const result = await fetchOnlinePresetInfo('python-ruff', fetcher);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.package).toBe('ruff');
			expect(result.version).toBe('0.3.0');
			expect(result.homepage).toBe('https://github.com/astral-sh/ruff');
		}
	});

	it('resolves crates registry info successfully', async () => {
		const fetcher: IOnlineFetcher = async (url) => {
			expect(url).toBe('https://crates.io/api/v1/crates/clippy');
			return {
				ok: true,
				status: 200,
				body: JSON.stringify({
					crate: {
						max_version: '0.1.75',
						homepage: 'https://github.com/rust-lang/rust-clippy',
					},
				}),
			};
		};

		const result = await fetchOnlinePresetInfo('rust-clippy', fetcher);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.package).toBe('clippy');
			expect(result.version).toBe('0.1.75');
			expect(result.homepage).toBe(
				'https://github.com/rust-lang/rust-clippy',
			);
		}
	});

	it('resolves goproxy registry info successfully', async () => {
		const fetcher: IOnlineFetcher = async (url) => {
			expect(url).toBe(
				'https://proxy.golang.org/github.com/golangci/golangci-lint/@latest',
			);
			return {
				ok: true,
				status: 200,
				body: JSON.stringify({
					Version: 'v1.57.2',
				}),
			};
		};

		const result = await fetchOnlinePresetInfo('go-golangci', fetcher);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.package).toBe('github.com/golangci/golangci-lint');
			expect(result.version).toBe('v1.57.2');
		}
	});

	it('resolves rubygems registry info successfully', async () => {
		const fetcher: IOnlineFetcher = async (url) => {
			expect(url).toBe('https://rubygems.org/api/v1/gems/rubocop.json');
			return {
				ok: true,
				status: 200,
				body: JSON.stringify({
					version: '1.62.1',
					homepage_uri: 'https://rubocop.org',
				}),
			};
		};

		const result = await fetchOnlinePresetInfo('ruby-rubocop', fetcher);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.package).toBe('rubocop');
			expect(result.version).toBe('1.62.1');
			expect(result.homepage).toBe('https://rubocop.org');
		}
	});

	it('resolves maven registry info successfully', async () => {
		const fetcher: IOnlineFetcher = async (url) => {
			expect(url).toBe(
				'https://search.maven.org/solrsearch/select?q=g%3A%22com.puppycrawl.tools%22+AND+a%3A%22checkstyle%22&rows=1&wt=json',
			);
			return {
				ok: true,
				status: 200,
				body: JSON.stringify({
					response: {
						docs: [{ latestVersion: '10.15.0' }],
					},
				}),
			};
		};

		const result = await fetchOnlinePresetInfo('java-checkstyle', fetcher);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.package).toBe('com.puppycrawl.tools:checkstyle');
			expect(result.version).toBe('10.15.0');
		}
	});

	it('resolves nuget registry info successfully', async () => {
		const fetcher: IOnlineFetcher = async (url) => {
			expect(url).toBe(
				'https://api.nuget.org/v3-flatcontainer/Microsoft.Net.Compilers.ToolSet/index.json',
			);
			return {
				ok: true,
				status: 200,
				body: JSON.stringify({
					versions: ['4.8.0', '4.9.2'],
				}),
			};
		};

		const result = await fetchOnlinePresetInfo(
			'csharp-dotnet-format',
			fetcher,
		);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.package).toBe('Microsoft.Net.Compilers.ToolSet');
			expect(result.version).toBe('4.9.2');
		}
	});

	it('resolves hackage cabal version successfully', async () => {
		const fetcher: IOnlineFetcher = async (url) => {
			expect(url).toBe(
				'https://hackage.haskell.org/package/hlint/hlint.cabal',
			);
			return {
				ok: true,
				status: 200,
				body: `
cabal-version:      2.4
name:               hlint
version:            3.8.2.1
synopsis:           Source code suggestions
`,
			};
		};

		const result = await fetchOnlinePresetInfo('hs-hlint', fetcher);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.package).toBe('hlint');
			expect(result.version).toBe('3.8.2.1');
		}
	});

	it('resolves homebrew registry info successfully', async () => {
		const fetcher: IOnlineFetcher = async (url) => {
			expect(url).toBe(
				'https://formulae.brew.sh/api/formula/swiftlint.json',
			);
			return {
				ok: true,
				status: 200,
				body: JSON.stringify({
					versions: { stable: '0.54.0' },
				}),
			};
		};

		const result = await fetchOnlinePresetInfo('swift-swiftlint', fetcher);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.package).toBe('swiftlint');
			expect(result.version).toBe('0.54.0');
		}
	});

	it('resolves hex registry info successfully', async () => {
		const fetcher: IOnlineFetcher = async (url) => {
			expect(url).toBe('https://hex.pm/api/packages/credo');
			return {
				ok: true,
				status: 200,
				body: JSON.stringify({
					releases: [{ version: '1.7.5' }],
				}),
			};
		};

		const result = await fetchOnlinePresetInfo('elixir-credo', fetcher);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.package).toBe('credo');
			expect(result.version).toBe('1.7.5');
		}
	});

	it('resolves clojars registry info successfully', async () => {
		const fetcher: IOnlineFetcher = async (url) => {
			expect(url).toBe(
				'https://clojars.org/api/artifacts/clj-kondo/clj-kondo',
			);
			return {
				ok: true,
				status: 200,
				body: JSON.stringify({
					latest_version: '2024.03.05',
				}),
			};
		};

		const result = await fetchOnlinePresetInfo('clj-clj-kondo', fetcher);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.package).toBe('clj-kondo/clj-kondo');
			expect(result.version).toBe('2024.03.05');
		}
	});

	it('resolves cpan registry info successfully', async () => {
		const fetcher: IOnlineFetcher = async (_url) => {
			return {
				ok: true,
				status: 200,
				body: JSON.stringify({
					version: '2.50',
				}),
			};
		};

		const result = await fetchOnlinePresetInfo('scm-scm-lint', fetcher);
		expect(result.ok).toBe(true);
	});

	it('resolves opam registry info successfully', async () => {
		const fetcher: IOnlineFetcher = async (url) => {
			expect(url).toBe(
				'https://opam.ocaml.org/packages/ocamlformat/ocamlformat.opam',
			);
			return {
				ok: true,
				status: 200,
				body: 'version: "0.26.1"\nsynopsis: "Formatter"',
			};
		};

		const result = await fetchOnlinePresetInfo('ml-ocamlformat', fetcher);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.package).toBe('ocamlformat');
			expect(result.version).toBe('0.26.1');
		}
	});

	it('resolves julia registry info successfully', async () => {
		const fetcher: IOnlineFetcher = async (url) => {
			expect(url).toBe('https://pkg.julialang.org/api/v1/Lint');
			return {
				ok: true,
				status: 200,
				body: JSON.stringify({
					version: '0.6.0',
				}),
			};
		};

		const result = await fetchOnlinePresetInfo('jl-julia-lint', fetcher);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.package).toBe('Lint');
			expect(result.version).toBe('0.6.0');
		}
	});

	it('resolves r_cran registry info successfully', async () => {
		const fetcher: IOnlineFetcher = async (url) => {
			expect(url).toBe('https://crandb.r-pkg.org/lintr');
			return {
				ok: true,
				status: 200,
				body: JSON.stringify({
					Version: '3.1.1',
				}),
			};
		};

		const result = await fetchOnlinePresetInfo('r-lintr', fetcher);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.package).toBe('lintr');
			expect(result.version).toBe('3.1.1');
		}
	});

	it('resolves r_github registry info successfully', async () => {
		const fetcher: IOnlineFetcher = async (url) => {
			expect(url).toBe(
				'https://raw.githubusercontent.com/vlang/v/main/DESCRIPTION',
			);
			return {
				ok: true,
				status: 200,
				body: 'version: 0.4.5',
			};
		};

		const result = await fetchOnlinePresetInfo('v-vfmt', fetcher);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.package).toBe('vlang/v');
			expect(result.version).toBe('0.4.5');
		}
	});

	it('resolves composer registry info successfully', async () => {
		const fetcher: IOnlineFetcher = async (url) => {
			expect(url).toBe(
				'https://repo.packagist.org/p2/phpstan/phpstan.json',
			);
			return {
				ok: true,
				status: 200,
				body: JSON.stringify({
					packages: {
						'phpstan/phpstan': [{ version: '1.11.5' }],
					},
				}),
			};
		};

		const result = await fetchOnlinePresetInfo('php-phpstan', fetcher);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.package).toBe('phpstan/phpstan');
			expect(result.version).toBe('1.11.5');
		}
	});

	it('resolves luarocks registry info successfully', async () => {
		const fetcher: IOnlineFetcher = async (url) => {
			expect(url).toBe('https://luarocks.org/api/1/luacheck');
			return {
				ok: true,
				status: 200,
				body: JSON.stringify({
					version: '0.27.0',
				}),
			};
		};

		const result = await fetchOnlinePresetInfo('lua-luacheck', fetcher);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.package).toBe('luacheck');
			expect(result.version).toBe('0.27.0');
		}
	});
});
