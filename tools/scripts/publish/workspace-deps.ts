import { spawn } from 'node:child_process';
import {
	cp,
	mkdir,
	readdir,
	readFile,
	rename,
	rm,
	writeFile,
} from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

/**
 * Maps each rewritable `@delendai/*` package name to the version its OWN
 * `package.json` currently declares. A `workspace:` range always resolves
 * against the target package's own version — never a single version
 * borrowed from the root manifest or any other package — because packages
 * in this monorepo are not guaranteed to share a version outside a lockstep
 * release (and even then, resolving per-package is what actually keeps that
 * guarantee, rather than assuming it).
 */
export interface IWorkspaceDepsPlan {
	readonly packageVersions: ReadonlyMap<string, string>;
}

export interface IRewriteResult {
	readonly rewritten: Readonly<Record<string, unknown>>;
	readonly changedKeys: readonly string[];
}

/**
 * Stage the centralized build output under the package-local `dist/` path
 * required by npm package exports. The source package is never modified.
 */
export const stageBuildForPublish = async (
	pkgDir: string,
	buildDir: string,
	stageDir: string,
): Promise<void> => {
	await cp(pkgDir, stageDir, {
		recursive: true,
		filter: (source) => !SKIP_DIRS.has(basename(source)),
	});
	await rm(join(stageDir, 'dist'), { recursive: true, force: true });
	await mkdir(join(stageDir, 'dist'), { recursive: true });
	await cp(buildDir, join(stageDir, 'dist'), { recursive: true });
};

const DEP_SECTIONS = [
	'dependencies',
	'devDependencies',
	'peerDependencies',
	'optionalDependencies',
] as const;

const WORKSPACE_PROTOCOL_PREFIX = 'workspace:';

/**
 * The dependency sections an `npm install` of the published package
 * actually resolves. `devDependencies` is deliberately absent.
 */
const CONSUMER_FACING_SECTIONS = [
	'dependencies',
	'peerDependencies',
	'optionalDependencies',
] as const;

/**
 * Resolvers for the `workspace:` range forms this repo's tooling must
 * support (npm/pnpm's workspace protocol). `*` pins the exact version;
 * `^`/`~` carry the target's own version under the matching semver
 * operator, exactly as a real publish of that range would.
 */
const WORKSPACE_PROTOCOL_RESOLVERS: Readonly<
	Record<string, (targetVersion: string) => string>
> = {
	'*': (targetVersion) => targetVersion,
	'^': (targetVersion) => `^${targetVersion}`,
	'~': (targetVersion) => `~${targetVersion}`,
};

const resolveWorkspaceRange = (
	depName: string,
	range: string,
	targetVersion: string,
): string => {
	const protocol = range.slice(WORKSPACE_PROTOCOL_PREFIX.length);
	const resolver = WORKSPACE_PROTOCOL_RESOLVERS[protocol];
	if (resolver === undefined) {
		throw createWorkspaceDepsError(
			'ERR_WORKSPACE_DEPS_PARSE',
			`unsupported workspace protocol "${range}" for dependency "${depName}"`,
		);
	}
	return resolver(targetVersion);
};

const SKIP_DIRS = new Set([
	'.git',
	'.cache',
	'node_modules',
	'dist',
	'build',
	'coverage',
]);

const createWorkspaceDepsError = (
	code:
		| 'ERR_WORKSPACE_DEPS_IO'
		| 'ERR_WORKSPACE_DEPS_PARSE'
		| 'ERR_WORKSPACE_DEPS_PACK'
		| 'ERR_WORKSPACE_DEPS_UNRESOLVED',
	message: string,
): Error & { readonly code: string } => {
	const error = new Error(message) as Error & { readonly code: string };
	Object.defineProperty(error, 'code', {
		value: code,
		enumerable: true,
		configurable: true,
	});
	return error;
};

const packageJsonPath = (pkgDir: string): string =>
	join(pkgDir, 'package.json');

const readPackageJsonText = async (pkgDir: string): Promise<string> => {
	try {
		return await readFile(packageJsonPath(pkgDir), 'utf8');
	} catch {
		throw createWorkspaceDepsError(
			'ERR_WORKSPACE_DEPS_IO',
			`cannot read package.json for publish rewrite in ${pkgDir}`,
		);
	}
};

const parsePackageJson = (
	text: string,
	pkgDir: string,
): Record<string, unknown> => {
	try {
		return JSON.parse(text) as Record<string, unknown>;
	} catch {
		throw createWorkspaceDepsError(
			'ERR_WORKSPACE_DEPS_PARSE',
			`invalid package.json for publish rewrite in ${pkgDir}`,
		);
	}
};

const clonePackageJson = (
	pkg: Record<string, unknown>,
): Record<string, unknown> =>
	JSON.parse(JSON.stringify(pkg)) as Record<string, unknown>;

const collectChangedKeys = (
	pkg: Record<string, unknown>,
	plan: IWorkspaceDepsPlan,
): {
	readonly rewritten: Record<string, unknown>;
	readonly changedKeys: readonly string[];
} => {
	const rewritten = clonePackageJson(pkg);
	const changedKeys = new Set<string>();
	for (const section of DEP_SECTIONS) {
		const deps = rewritten[section];
		if (typeof deps !== 'object' || deps === null) continue;
		for (const [name, range] of Object.entries(
			deps as Record<string, unknown>,
		)) {
			const targetVersion = plan.packageVersions.get(name);
			if (targetVersion === undefined) continue;
			if (
				typeof range !== 'string' ||
				!range.startsWith(WORKSPACE_PROTOCOL_PREFIX)
			)
				continue;
			(deps as Record<string, string>)[name] = resolveWorkspaceRange(
				name,
				range,
				targetVersion,
			);
			changedKeys.add(name);
		}
	}
	return {
		rewritten,
		changedKeys: [...changedKeys].sort((a, b) => a.localeCompare(b)),
	};
};

const writePackageJsonAtomic = async (
	pkgPath: string,
	payload: string,
): Promise<void> => {
	const tempPath = `${pkgPath}.tmp-${process.pid}-${Date.now()}`;
	await writeFile(tempPath, payload, 'utf8').catch(() => {
		throw createWorkspaceDepsError(
			'ERR_WORKSPACE_DEPS_IO',
			`cannot write package.json for publish rewrite at ${pkgPath}`,
		);
	});
	await rename(tempPath, pkgPath).catch(async () => {
		await writeFile(pkgPath, payload, 'utf8').catch(() => {
			throw createWorkspaceDepsError(
				'ERR_WORKSPACE_DEPS_IO',
				`cannot replace package.json for publish rewrite at ${pkgPath}`,
			);
		});
	});
};

const toJson = (pkg: Readonly<Record<string, unknown>>): string =>
	`${JSON.stringify(pkg, null, '\t')}\n`;

/**
 * x00530 S4 — fail closed on any surviving `workspace:` range.
 *
 * `collectChangedKeys` skips a dependency whose name is absent from
 * `plan.packageVersions` (`targetVersion === undefined`). That is the
 * exact hole through which a `workspace:*` reaches a published tarball:
 * the dependency is a real `@delendai` package, but it is not in
 * `PUBLISH_ORDER`, so the plan has no version for it and the range is
 * copied through verbatim. npm then hands the consumer a manifest with
 * a range it cannot resolve, and the failure surfaces at
 * `npm install` time in someone else's project.
 *
 * The check below runs AFTER the rewrite and names both the package and
 * the dependency, so the operator can tell immediately whether the fix
 * is "add it to PUBLISH_ORDER" or "stop depending on it".
 */
export const findUnresolvedWorkspaceRanges = (
	pkg: Readonly<Record<string, unknown>>,
): readonly {
	readonly section: string;
	readonly name: string;
	readonly range: string;
}[] => {
	const found: {
		readonly section: string;
		readonly name: string;
		readonly range: string;
	}[] = [];
	// `devDependencies` are published but never installed by a consumer,
	// so a `workspace:` range there cannot break an `npm install`. Only
	// the three sections npm actually resolves are fatal.
	for (const section of CONSUMER_FACING_SECTIONS) {
		const deps = pkg[section];
		if (typeof deps !== 'object' || deps === null) continue;
		for (const [name, range] of Object.entries(
			deps as Record<string, unknown>,
		)) {
			if (
				typeof range === 'string' &&
				range.startsWith(WORKSPACE_PROTOCOL_PREFIX)
			) {
				found.push({ section, name, range });
			}
		}
	}
	return found;
};

/**
 * Throw `ERR_WORKSPACE_DEPS_UNRESOLVED` when a staged manifest still
 * carries a `workspace:` range. `pkgName` is the package being staged.
 */
export const assertNoWorkspaceRangesRemain = (
	pkgName: string,
	pkg: Readonly<Record<string, unknown>>,
): void => {
	const remaining = findUnresolvedWorkspaceRanges(pkg);
	if (remaining.length === 0) return;
	const detail = remaining
		.map(
			(entry) =>
				`  ${pkgName} -> ${entry.section}.${entry.name} = "${entry.range}"`,
		)
		.join('\n');
	throw createWorkspaceDepsError(
		'ERR_WORKSPACE_DEPS_UNRESOLVED',
		`unresolved workspace ranges survived the publish rewrite:\n${detail}\n` +
			'Every dependency listed above must either be added to PUBLISH_ORDER ' +
			'(so the rewrite knows its version) or dropped from the package.',
	);
};

export const rewriteWorkspaceDeps = async (
	pkgDir: string,
	plan: IWorkspaceDepsPlan,
): Promise<IRewriteResult> => {
	const originalText = await readPackageJsonText(pkgDir);
	const original = parsePackageJson(originalText, pkgDir);
	const { rewritten, changedKeys } = collectChangedKeys(original, plan);
	assertNoWorkspaceRangesRemain(
		typeof original.name === 'string' ? original.name : pkgDir,
		rewritten,
	);
	await writePackageJsonAtomic(packageJsonPath(pkgDir), toJson(rewritten));
	return { rewritten, changedKeys };
};

const hasMatchingWorkspaceDeps = (
	pkg: Record<string, unknown>,
	delendaiPackages: ReadonlySet<string>,
): boolean => {
	for (const section of DEP_SECTIONS) {
		const deps = pkg[section];
		if (typeof deps !== 'object' || deps === null) continue;
		for (const [name, range] of Object.entries(
			deps as Record<string, unknown>,
		)) {
			if (!delendaiPackages.has(name)) continue;
			if (typeof range === 'string' && range.startsWith('workspace:')) {
				return true;
			}
		}
	}
	return false;
};

const walkPackageJsonFiles = async (
	rootDir: string,
): Promise<readonly string[]> => {
	const out: string[] = [];
	const stack = [resolve(rootDir)];
	while (stack.length > 0) {
		const current = stack.pop();
		if (current === undefined) continue;
		const entries = await readdir(current, { withFileTypes: true }).catch(
			() => [],
		);
		for (const entry of entries) {
			if (entry.isDirectory()) {
				if (SKIP_DIRS.has(entry.name)) continue;
				stack.push(join(current, entry.name));
				continue;
			}
			if (entry.isFile() && entry.name === 'package.json') {
				out.push(join(current, entry.name));
			}
		}
	}
	return out.sort((a, b) => a.localeCompare(b));
};

export const findWorkspaceConsumers = async (
	rootDir: string,
	delendaiPackages: ReadonlySet<string>,
): Promise<readonly string[]> => {
	const packageJsons = await walkPackageJsonFiles(rootDir);
	const consumers: string[] = [];
	for (const pkgPath of packageJsons) {
		const pkgDir = dirname(pkgPath);
		const text = await readPackageJsonText(pkgDir);
		const pkg = parsePackageJson(text, pkgDir);
		if (hasMatchingWorkspaceDeps(pkg, delendaiPackages)) {
			consumers.push(pkgPath);
		}
	}
	return consumers;
};

const runNpmPack = async (pkgDir: string, outDir: string): Promise<string> =>
	new Promise((resolvePack, rejectPack) => {
		const child = spawn(
			'npm',
			['pack', resolve(pkgDir), '--pack-destination', outDir],
			{
				cwd: outDir,
				stdio: ['ignore', 'pipe', 'inherit'],
			},
		);
		let stdout = '';
		child.stdout.setEncoding('utf8');
		child.stdout.on('data', (chunk: string) => {
			stdout += chunk;
		});
		child.on('error', () => {
			rejectPack(
				createWorkspaceDepsError(
					'ERR_WORKSPACE_DEPS_PACK',
					`npm pack failed for ${pkgDir}`,
				),
			);
		});
		child.on('close', (code) => {
			if (code !== 0) {
				rejectPack(
					createWorkspaceDepsError(
						'ERR_WORKSPACE_DEPS_PACK',
						`npm pack failed for ${pkgDir}`,
					),
				);
				return;
			}
			const tarballName = stdout
				.trim()
				.split('\n')
				.map((line) => line.trim())
				.filter((line) => line.length > 0)
				.pop();
			if (tarballName === undefined) {
				rejectPack(
					createWorkspaceDepsError(
						'ERR_WORKSPACE_DEPS_PACK',
						`npm pack produced no tarball for ${pkgDir}`,
					),
				);
				return;
			}
			resolvePack(join(outDir, tarballName));
		});
	});

export const packRewrittenTarball = async (
	pkgDir: string,
	plan: IWorkspaceDepsPlan,
	options?: { readonly outDir?: string | undefined },
): Promise<string> => {
	const pkgPath = packageJsonPath(pkgDir);
	const originalText = await readPackageJsonText(pkgDir);
	const outDir = options?.outDir ?? pkgDir;
	await mkdir(outDir, { recursive: true });
	try {
		await rewriteWorkspaceDeps(pkgDir, plan);
		return await runNpmPack(pkgDir, outDir);
	} finally {
		await writePackageJsonAtomic(pkgPath, originalText).catch(
			() => undefined,
		);
	}
};
