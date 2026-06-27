import type { IFileReader } from '@mcp-vertex/core/public';

import type { IDetectResult } from '../contracts/language-adapter.interface';

import { buildDefaultRegistry } from './registry/default-registry';

export type { IDetectResult } from '../contracts/language-adapter.interface';

const DEFAULT_DETECTOR = buildDefaultRegistry().detector;

const readDeps = async (
	reader: IFileReader,
	areaDir: string,
): Promise<Record<string, string>> => {
	const packageJson =
		areaDir === '' || areaDir === 'root'
			? 'package.json'
			: `${areaDir}/package.json`;
	const raw = await reader.readFile(packageJson);
	if (raw === undefined) return {};
	try {
		const parsed = JSON.parse(raw) as {
			dependencies?: Record<string, string>;
			devDependencies?: Record<string, string>;
		};
		return {
			...(parsed.dependencies ?? {}),
			...(parsed.devDependencies ?? {}),
		};
	} catch {
		return {};
	}
};

const hasTypeScript = async (
	reader: IFileReader,
	areaDir: string,
	deps: Readonly<Record<string, string>>,
): Promise<boolean> => {
	for (const name of ['tsconfig.json', 'tsconfig.app.json']) {
		const rel =
			areaDir === '' || areaDir === 'root' ? name : `${areaDir}/${name}`;
		if (await reader.exists(rel)) return true;
	}
	return 'typescript' in deps;
};

const hasConfig = async (
	reader: IFileReader,
	areaDir: string,
	name: string,
): Promise<boolean> => {
	for (const extension of ['js', 'mjs', 'ts', 'cjs']) {
		const rel =
			areaDir === '' || areaDir === 'root'
				? `${name}.${extension}`
				: `${areaDir}/${name}.${extension}`;
		if (await reader.exists(rel)) return true;
	}
	return false;
};

const detectJsTsFacadePreset = async (
	reader: IFileReader,
	areaDir: string,
	deps: Readonly<Record<string, string>>,
	hasTs: boolean,
): Promise<IDetectResult | undefined> => {
	if ('next' in deps || (await hasConfig(reader, areaDir, 'next.config'))) {
		return hasTs
			? {
					presetId: 'next-ts',
					reason: 'Next.js (next dep / next.config)',
				}
			: { presetId: 'react-js', reason: 'Next.js (JS) → react-js base' };
	}
	if (
		'@remix-run/react' in deps ||
		'@remix-run/node' in deps ||
		(await hasConfig(reader, areaDir, 'remix.config'))
	) {
		return hasTs
			? { presetId: 'remix', reason: 'Remix (@remix-run/*)' }
			: { presetId: 'react-js', reason: 'Remix (JS) → react-js base' };
	}
	if ('nuxt' in deps || (await hasConfig(reader, areaDir, 'nuxt.config'))) {
		return { presetId: 'nuxt', reason: 'Nuxt (nuxt dep / nuxt.config)' };
	}
	if ('astro' in deps || (await hasConfig(reader, areaDir, 'astro.config'))) {
		return hasTs
			? { presetId: 'astro', reason: 'Astro (astro dep / astro.config)' }
			: {
					presetId: 'vanilla-js',
					reason: 'Astro (JS) → vanilla-js base',
				};
	}
	if ('solid-js' in deps) {
		return hasTs
			? { presetId: 'solid-ts', reason: 'SolidJS (solid-js)' }
			: {
					presetId: 'vanilla-js',
					reason: 'SolidJS (JS) → vanilla-js base',
				};
	}
	return undefined;
};

export const detectPresetForArea = async (
	reader: IFileReader,
	areaDir: string,
): Promise<IDetectResult> => {
	const deps = await readDeps(reader, areaDir);
	const hasTs = await hasTypeScript(reader, areaDir, deps);
	const facadeHit = await detectJsTsFacadePreset(
		reader,
		areaDir,
		deps,
		hasTs,
	);
	if (facadeHit !== undefined) {
		return facadeHit;
	}
	const detected = await DEFAULT_DETECTOR.detect(reader, areaDir);
	if (detected !== undefined) {
		return detected;
	}
	return {
		presetId: hasTs ? 'vanilla-ts' : 'vanilla-js',
		reason: hasTs
			? 'tsconfig/typescript present'
			: 'no framework or TS detected',
	};
};
