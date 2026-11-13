#!/usr/bin/env bun
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { repoRoot } from '../lib/monorepo-paths';

interface ITarget {
	readonly id: 'plugin-contract' | 'public' | 'cli';
	readonly relPath: string;
	readonly target: 'node' | 'bun';
}

interface IImportMeasurement {
	readonly coldStartMs: number;
	readonly rssDeltaBytes: number;
	readonly heapUsedDeltaBytes: number;
	readonly externalDeltaBytes: number;
}

interface ITargetMeasurement extends IImportMeasurement {
	readonly id: ITarget['id'];
	readonly relPath: string;
	readonly moduleCount: number;
	readonly bundleBytes: number;
}

interface IReport {
	readonly cwd: string;
	readonly measuredAt: string;
	readonly targets: readonly ITargetMeasurement[];
}

const ROOT = repoRoot();

const TARGETS: readonly ITarget[] = [
	{
		id: 'plugin-contract',
		relPath: 'packages/core/src/lib/plugins/plugin-contract.ts',
		target: 'node',
	},
	{
		id: 'public',
		relPath: 'packages/core/src/public/index.ts',
		target: 'node',
	},
	{
		id: 'cli',
		relPath: 'packages/core/src/cli.ts',
		target: 'bun',
	},
] as const;

const LOCAL_IMPORT_RE =
	/(?:import|export)\s+(?:type\s+)?(?:[^'"`]*?from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/gu;

const fileExists = (absPath: string): boolean => {
	try {
		return statSync(absPath).isFile();
	} catch {
		return false;
	}
};

const resolveLocalSpecifier = (
	baseFile: string,
	specifier: string,
): string | undefined => {
	if (!specifier.startsWith('.')) return undefined;
	const baseDir = dirname(baseFile);
	const baseResolved = resolve(baseDir, specifier);
	const candidates = [
		baseResolved,
		`${baseResolved}.ts`,
		`${baseResolved}.tsx`,
		`${baseResolved}.js`,
		join(baseResolved, 'index.ts'),
		join(baseResolved, 'index.tsx'),
		join(baseResolved, 'index.js'),
	];
	return candidates.find(fileExists);
};

const countReachableModules = (entryAbsPath: string): number => {
	const seen = new Set<string>();
	const stack = [entryAbsPath];
	while (stack.length > 0) {
		const current = stack.pop();
		if (!current || seen.has(current)) continue;
		seen.add(current);
		const source = readFileSync(current, 'utf8');
		for (const match of source.matchAll(LOCAL_IMPORT_RE)) {
			const specifier = match[1] ?? match[2];
			if (!specifier) continue;
			const resolved = resolveLocalSpecifier(current, specifier);
			if (resolved && !seen.has(resolved)) stack.push(resolved);
		}
	}
	return seen.size;
};

const formatChildScript = (): string => `
const specifier = process.env.DELENDAI_COLD_START_SPECIFIER;
if (!specifier) throw new Error('Missing module specifier');
const before = process.memoryUsage();
const start = performance.now();
await import(specifier);
const coldStartMs = performance.now() - start;
const after = process.memoryUsage();
console.log(JSON.stringify({
  coldStartMs,
  rssDeltaBytes: after.rss - before.rss,
  heapUsedDeltaBytes: after.heapUsed - before.heapUsed,
  externalDeltaBytes: after.external - before.external,
}));
`;

const measureDynamicImport = (entryAbsPath: string): IImportMeasurement => {
	const child = Bun.spawnSync({
		cmd: [process.execPath, '-e', formatChildScript()],
		cwd: ROOT,
		stdout: 'pipe',
		stderr: 'pipe',
		env: {
			...process.env,
			DELENDAI_COLD_START_SPECIFIER: pathToFileURL(entryAbsPath).href,
		},
	});
	if (child.exitCode !== 0) {
		throw new Error(
			`cold-start import failed for ${entryAbsPath}: ${child.stderr.toString()}`,
		);
	}
	return JSON.parse(child.stdout.toString()) as IImportMeasurement;
};

const buildBundleBytes = async (
	target: ITarget,
	entryAbsPath: string,
): Promise<number> => {
	const outdir = mkdtempSync(join(tmpdir(), 'delendai-cold-start-'));
	try {
		const result = await Bun.build({
			entrypoints: [entryAbsPath],
			target: target.target,
			format: 'esm',
			packages: 'external',
			root: resolve(ROOT, 'packages/core/src'),
			outdir,
		});
		if (!result.success) {
			throw new Error(
				result.logs.map((log) => log.message).join('\n') ||
					`bun build failed for ${target.relPath}`,
			);
		}
		const outFile = join(outdir, `${target.id}.js`);
		const fallbackFile = join(
			outdir,
			target.relPath
				.replace('packages/core/src/', '')
				.replace(/\.ts$/u, '.js'),
		);
		const builtFile = fileExists(outFile) ? outFile : fallbackFile;
		return statSync(builtFile).size;
	} finally {
		rmSync(outdir, { recursive: true, force: true });
	}
};

const measureTarget = async (target: ITarget): Promise<ITargetMeasurement> => {
	const entryAbsPath = resolve(ROOT, target.relPath);
	const [importMeasurement, bundleBytes] = await Promise.all([
		Promise.resolve(measureDynamicImport(entryAbsPath)),
		buildBundleBytes(target, entryAbsPath),
	]);
	return {
		id: target.id,
		relPath: target.relPath,
		moduleCount: countReachableModules(entryAbsPath),
		bundleBytes,
		...importMeasurement,
	};
};

const bytesToKiB = (bytes: number): string =>
	`${(bytes / 1024).toFixed(1)} KiB`;
const bytesToMiB = (bytes: number): string =>
	`${(bytes / (1024 * 1024)).toFixed(2)} MiB`;

const printHumanReport = (report: IReport): void => {
	console.log('Core cold-start report');
	for (const target of report.targets) {
		console.log(
			[
				`${target.id}: ${target.relPath}`,
				`coldStart=${target.coldStartMs.toFixed(2)}ms`,
				`modules=${target.moduleCount}`,
				`rssDelta=${bytesToMiB(target.rssDeltaBytes)}`,
				`heapDelta=${bytesToMiB(target.heapUsedDeltaBytes)}`,
				`externalDelta=${bytesToMiB(target.externalDeltaBytes)}`,
				`bundle=${bytesToKiB(target.bundleBytes)}`,
			].join(' | '),
		);
	}
	console.log(JSON.stringify(report, null, 2));
};

const main = async (): Promise<void> => {
	const targets: ITargetMeasurement[] = [];
	for (const target of TARGETS) {
		targets.push(await measureTarget(target));
	}
	printHumanReport({
		cwd: ROOT,
		measuredAt: new Date().toISOString(),
		targets,
	});
};

await main();
