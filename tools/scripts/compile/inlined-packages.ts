/**
 * inlined-packages.ts — which workspace packages a published package
 * carries inside its own bundle.
 *
 * A package that is `"private": true` is never on the registry, so a
 * published package that imported one could not be installed. The answer
 * used to be "publish it", which made every feature built on an internal
 * package cost the user one more thing to install and to version. The
 * build bundles it instead: a private package is an implementation
 * detail of the package that ships it.
 *
 * What is inlined is what the published package declares in its
 * `devDependencies` (never `dependencies`: an installer must not look
 * for it) and that is private, plus the private packages those depend
 * on in turn. Whatever PUBLIC package an inlined one imports stays an
 * import, so the publisher has to declare it as its own dependency.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface IWorkspaceManifest {
	readonly name: string;
	readonly private?: boolean | undefined;
	readonly dependencies?: Readonly<Record<string, string>> | undefined;
	readonly devDependencies?: Readonly<Record<string, string>> | undefined;
	readonly peerDependencies?: Readonly<Record<string, string>> | undefined;
}

/** The private workspace packages `manifest` bundles, in name order. */
export const inlinedPackagesOf = (
	manifest: IWorkspaceManifest,
	workspace: ReadonlyMap<string, IWorkspaceManifest>,
): readonly string[] => {
	// A private package is not shipped at all: it bundles nothing.
	if (manifest.private === true) return [];
	const inlined = new Set<string>();
	const visit = (names: readonly string[]): void => {
		for (const name of names) {
			const dependency = workspace.get(name);
			if (dependency?.private !== true || inlined.has(name)) continue;
			inlined.add(name);
			visit(Object.keys(dependency.dependencies ?? {}));
		}
	};
	visit(Object.keys(manifest.devDependencies ?? {}));
	return [...inlined].sort((left, right) => left.localeCompare(right));
};

/**
 * The public workspace packages the inlined ones import, which the
 * publisher must declare itself: its bundle now holds those imports.
 */
export const undeclaredByPublisher = (
	manifest: IWorkspaceManifest,
	workspace: ReadonlyMap<string, IWorkspaceManifest>,
): readonly string[] => {
	const declared = new Set([
		...Object.keys(manifest.dependencies ?? {}),
		...Object.keys(manifest.peerDependencies ?? {}),
	]);
	const needed = new Set<string>();
	for (const name of inlinedPackagesOf(manifest, workspace)) {
		for (const dependency of Object.keys(
			workspace.get(name)?.dependencies ?? {},
		)) {
			const target = workspace.get(dependency);
			if (target === undefined || target.private === true) continue;
			if (dependency !== manifest.name && !declared.has(dependency)) {
				needed.add(dependency);
			}
		}
	}
	return [...needed].sort((left, right) => left.localeCompare(right));
};

/**
 * Every workspace manifest under `root`, by package name, with the
 * directory it was read from.
 */
export const readWorkspaceManifests = (
	root: string,
	groups: readonly string[] = ['packages', 'plugins'],
): ReadonlyMap<string, IWorkspaceManifest & { readonly rel: string }> => {
	const manifests = new Map<
		string,
		IWorkspaceManifest & { readonly rel: string }
	>();
	for (const group of groups) {
		const groupDir = join(root, group);
		if (!existsSync(groupDir)) continue;
		for (const entry of readdirSync(groupDir).sort()) {
			const path = join(groupDir, entry, 'package.json');
			if (!existsSync(path)) continue;
			const manifest = JSON.parse(
				readFileSync(path, 'utf8'),
			) as Partial<IWorkspaceManifest>;
			if (typeof manifest.name !== 'string') continue;
			manifests.set(manifest.name, {
				...manifest,
				name: manifest.name,
				rel: `${group}/${entry}`,
			});
		}
	}
	return manifests;
};

const sourceFilesUnder = (dir: string): readonly string[] => {
	if (!existsSync(dir)) return [];
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return sourceFilesUnder(path);
		return /\.(?:ts|tsx|mts)$/u.test(entry.name) &&
			!/\.(?:spec|test)\.[a-z]+$/u.test(entry.name)
			? [path]
			: [];
	});
};

/**
 * The names among `candidates` that the shipped sources under `srcDir`
 * import. A private package named in `devDependencies` for the tests
 * alone (a test kit) is not part of what ships, and saying it is bundled
 * would be wrong.
 */
export const importedBySources = (
	srcDir: string,
	candidates: readonly string[],
): readonly string[] => {
	if (candidates.length === 0) return [];
	const sources = sourceFilesUnder(srcDir).map((path) =>
		readFileSync(path, 'utf8'),
	);
	return candidates.filter((name) => {
		const imported = new RegExp(
			`(?:from|import|require)\\s*\\(?\\s*['"]${name.replace(/[.*+?^${}()|[\]\\/]/gu, '\\$&')}(?:/[^'"]*)?['"]`,
			'u',
		);
		return sources.some((source) => imported.test(source));
	});
};
