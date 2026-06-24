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
