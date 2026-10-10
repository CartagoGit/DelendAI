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
