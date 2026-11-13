/**
 * host-packages.helper.ts — a user's plugin imports the host's own
 * `@delendai/*` packages.
 *
 * A plugin a project keeps in its own tree (`plugins.<id>.path`) imports
 * `@delendai/core/public` for `definePlugin` and the contracts. Resolved
 * from the plugin's file, that specifier needs `@delendai/core` installed
 * in the project, which a project that runs the server from a delendai
 * checkout does not have: the plugin failed to load with "Cannot find
 * package '@delendai/core'". Even when a copy is installed, it is a second
 * instance of the core beside the one that loads the plugin.
 *
 * Under Bun, the files of that plugin's package are loaded with their
 * `@delendai/*` imports pointed at what the host itself resolves, so the
 * plugin runs against the host that loads it. Bun's runtime plugins cannot
 * redirect a bare specifier in `onResolve`, so the import is rewritten when
 * the file loads. Other runtimes resolve as they always did.
 */
import { access } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** An `@delendai/*` specifier where an import, re-export or require names it. */
const HOST_IMPORT =
	/(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)(['"])(@delendai\/[^'"\s]+)\2/g;

type IBunLoader = 'ts' | 'tsx' | 'js' | 'jsx';

const LOADER_BY_EXTENSION: Readonly<Record<string, IBunLoader>> = {
	'.ts': 'ts',
	'.mts': 'ts',
	'.cts': 'ts',
	'.tsx': 'tsx',
	'.js': 'js',
	'.mjs': 'js',
	'.cjs': 'js',
	'.jsx': 'jsx',
};

interface IBunRuntime {
	readonly plugin: (definition: {
		readonly name: string;
		readonly setup: (build: {
			readonly onLoad: (
				options: { readonly filter: RegExp },
				load: (args: { readonly path: string }) => Promise<{
					readonly contents: string;
					readonly loader: IBunLoader;
				}>,
			) => void;
		}) => void;
	}) => void;
	readonly resolveSync: (specifier: string, from: string) => string;
	readonly file: (path: string) => { readonly text: () => Promise<string> };
}

/**
 * `source` with each `@delendai/*` import that `resolve` knows replaced by
 * the path it resolves to. An import it does not know is left as written.
 */
export const rewriteHostImports = (
	source: string,
	resolve: (specifier: string) => string | undefined,
): string =>
	source.replace(
		HOST_IMPORT,
		(whole: string, lead: string, quote: string, specifier: string) => {
			const target = resolve(specifier);
			return target === undefined
				? whole
				: `${lead}${quote}${target.replaceAll('\\', '/')}${quote}`;
		},
	);

const exists = async (path: string): Promise<boolean> =>
	access(path).then(
		() => true,
		() => false,
	);

/** The directory of the nearest `package.json` above `file`, else its own. */
export const packageRootOf = async (file: string): Promise<string> => {
	let dir = dirname(file);
	for (;;) {
		if (await exists(join(dir, 'package.json'))) return dir;
		const parent = dirname(dir);
		if (parent === dir) return dirname(file);
		dir = parent;
	}
};

const escapeRegExp = (text: string): string =>
	text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const HOST_DIR = dirname(fileURLToPath(import.meta.url));

const shared = new Set<string>();

/**
 * Loads the package holding `entry` against the host's `@delendai/*`
 * packages. Once per package; nothing outside Bun.
 */
export const shareHostPackages = async (
	entry: string,
	bun: IBunRuntime | undefined = (globalThis as { Bun?: IBunRuntime }).Bun,
): Promise<void> => {
	if (bun === undefined) return;
	const root = await packageRootOf(entry);
	if (shared.has(root)) return;
	shared.add(root);
	const fromHost = (specifier: string): string | undefined => {
		try {
			return bun.resolveSync(specifier, HOST_DIR);
		} catch {
			return undefined;
		}
	};
	bun.plugin({
		name: `delendai-host-packages:${root}`,
		setup: (build) => {
			build.onLoad(
				{
					filter: new RegExp(
						`^${escapeRegExp(root)}[\\\\/].*\\.[cm]?[jt]sx?$`,
					),
				},
				async (args) => {
					const source = await bun.file(args.path).text();
					// The package's own dependencies keep what they import.
					const own = !/[\\/]node_modules[\\/]/.test(
						args.path.slice(root.length),
					);
					return {
						contents: own
							? rewriteHostImports(source, fromHost)
							: source,
						loader: LOADER_BY_EXTENSION[extname(args.path)] ?? 'js',
					};
				},
			);
		},
	});
};
