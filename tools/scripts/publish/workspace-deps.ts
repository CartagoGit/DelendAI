import { spawn } from 'node:child_process';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

export interface IWorkspaceDepsPlan {
	readonly targetVersion: string;
	readonly mcpVertexPackages: ReadonlySet<string>;
}

export interface IRewriteResult {
	readonly rewritten: Readonly<Record<string, unknown>>;
	readonly changedKeys: readonly string[];
}

const DEP_SECTIONS = [
	'dependencies',
	'devDependencies',
	'peerDependencies',
	'optionalDependencies',
] as const;

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
		| 'ERR_WORKSPACE_DEPS_PACK',
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
			if (!plan.mcpVertexPackages.has(name)) continue;
			if (typeof range !== 'string' || !range.startsWith('workspace:'))
				continue;
			(deps as Record<string, string>)[name] = plan.targetVersion;
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

export const rewriteWorkspaceDeps = async (
	pkgDir: string,
	plan: IWorkspaceDepsPlan,
): Promise<IRewriteResult> => {
	const originalText = await readPackageJsonText(pkgDir);
	const original = parsePackageJson(originalText, pkgDir);
	const { rewritten, changedKeys } = collectChangedKeys(original, plan);
	await writePackageJsonAtomic(packageJsonPath(pkgDir), toJson(rewritten));
	return { rewritten, changedKeys };
};

const hasMatchingWorkspaceDeps = (
	pkg: Record<string, unknown>,
	mcpVertexPackages: ReadonlySet<string>,
): boolean => {
	for (const section of DEP_SECTIONS) {
		const deps = pkg[section];
		if (typeof deps !== 'object' || deps === null) continue;
		for (const [name, range] of Object.entries(
			deps as Record<string, unknown>,
		)) {
			if (!mcpVertexPackages.has(name)) continue;
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
	mcpVertexPackages: ReadonlySet<string>,
): Promise<readonly string[]> => {
	const packageJsons = await walkPackageJsonFiles(rootDir);
	const consumers: string[] = [];
	for (const pkgPath of packageJsons) {
		const pkgDir = dirname(pkgPath);
		const text = await readPackageJsonText(pkgDir);
		const pkg = parsePackageJson(text, pkgDir);
		if (hasMatchingWorkspaceDeps(pkg, mcpVertexPackages)) {
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
