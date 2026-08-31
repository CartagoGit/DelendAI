/**
 * Release driver (N23 — semver + publish automation).
 *
 *   bun run release                      # dry-run: print current versions + publish plan
 *   bun run release --bump=patch         # plan a lockstep patch bump (dry-run)
 *   bun run release --bump=minor --write # apply the bump to every package.json
 *   bun run release --set=0.2.0 --write  # set an explicit lockstep version
 *   bun run release --publish            # validate + publish (current versions) in order
 *   bun run release --bump=patch --write --publish   # full release
 *
 * Flags:
 *   --bump=patch|minor|major   lockstep bump derived from the core version
 *   --set=X.Y.Z                explicit lockstep version (mutually exclusive with --bump)
 *   --write                    write version + peer changes to package.json (default: dry-run)
 *   --publish                  publish every package in dependency order
 *   --no-validate              skip `bun run validate` before publishing (NOT recommended)
 *   --tool=bun|npm             publish tool (default: bun — it rewrites workspace:* deps)
 *   --provenance               pass `--provenance` to `npm publish` (npm only; requires
 *                              OIDC, i.e. `id-token: write` permission in CI). Ignored
 *                              (with a warning) when --tool=bun, since bun does not
 *                              support provenance attestations.
 *
 * Note on `workspace:*` (corrected a00065 S4): the plugins reference
 * `@mcp-vertex/core` only via a resolved `peerDependency` range, BUT
 * `packages/client` and `packages/cli` carry intra-repo deps
 * (`@mcp-vertex/core`, `@mcp-vertex/client`) as `workspace:*` in real
 * `dependencies`. `bun publish` (the default `--tool=bun`) rewrites those
 * to the concrete version at publish time, so the default path is safe.
 * `npm publish` does NOT — it would ship an uninstallable `workspace:*`
 * dependency — so `--tool=npm` needs the same rewrite before it can
 * publish client/cli. The pack smoke (`tools/scripts/smoke/pack.script.ts`)
 * now proves the rewritten tarballs install under npm; run it before a
 * `--tool=npm` release.
 *
 * Side-effect free planning lives in ./release-plan.ts; this file is the thin
 * fs + spawn shell around it (so it is intentionally not unit-tested).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	CORE_PEER,
	PUBLISH_ORDER,
	computeReleasePlan,
	type BumpKind,
	type IReleasePkg,
	type IReleasePlan,
	type ReleaseTarget,
} from './release-plan';
import {
	createConsoleLogger,
	createQuietLogger,
	type IReleaseLogger,
} from './release-logger';
import {
	assertTarballsProvided,
	publishTarballs,
	type IPublishTarballsInput,
} from './publish-tarballs.ts';
import {
	packRewrittenTarball,
	rewriteWorkspaceDeps,
	stageBuildForPublish,
	type IWorkspaceDepsPlan,
} from '../publish/workspace-deps.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

interface IRawPackageJson {
	name: string;
	version: string;
	peerDependencies?: Record<string, string>;
	[key: string]: unknown;
}

function readPkg(dir: string): IRawPackageJson {
	const raw = readFileSync(join(ROOT, dir, 'package.json'), 'utf8');
	return JSON.parse(raw) as IRawPackageJson;
}

function toReleasePkg(dir: string, pkg: IRawPackageJson): IReleasePkg {
	const peer = pkg.peerDependencies?.[CORE_PEER];
	if (peer !== undefined) {
		return {
			dir,
			name: pkg.name,
			version: pkg.version,
			peerCoreRange: peer,
		};
	}
	return { dir, name: pkg.name, version: pkg.version };
}

/** Exported for unit testing only. */
export interface ICliFlags {
	target: ReleaseTarget | undefined;
	write: boolean;
	publish: boolean;
	validate: boolean;
	tool: 'bun' | 'npm';
	provenance: boolean;
	/** Audit-h2-fix: when true, suppress every progress banner so this
	 *  script stays quiet inside `bun run validate` and CI logs. The
	 *  plan + publish result still go to stderr so callers see what
	 *  happened if they pipe stdout to a file. */
	quiet: boolean;
}

/** Exported for unit testing only; `main()` is the production entry point. */
export function parseFlags(argv: readonly string[]): ICliFlags {
	let bump: BumpKind | undefined;
	let set: string | undefined;
	let write = false;
	let publish = false;
	let validate = true;
	let tool: 'bun' | 'npm' = 'bun';
	let provenance = false;
	let quiet = false;
	for (const arg of argv) {
		if (arg.startsWith('--bump=')) {
			const v = arg.slice('--bump='.length);
			if (v !== 'patch' && v !== 'minor' && v !== 'major') {
				throw new Error(`--bump must be patch|minor|major, got "${v}"`);
			}
			bump = v;
		} else if (arg.startsWith('--set=')) {
			set = arg.slice('--set='.length);
		} else if (arg === '--write') {
			write = true;
		} else if (arg === '--publish') {
			publish = true;
		} else if (arg === '--no-validate') {
			validate = false;
		} else if (arg.startsWith('--tool=')) {
			const v = arg.slice('--tool='.length);
			if (v !== 'bun' && v !== 'npm') {
				throw new Error(`--tool must be bun|npm, got "${v}"`);
			}
			tool = v;
		} else if (arg === '--provenance') {
			provenance = true;
		} else if (arg === '--quiet' || arg === '-q') {
			quiet = true;
		} else {
			throw new Error(`unknown flag: ${arg}`);
		}
	}
	if (bump !== undefined && set !== undefined) {
		throw new Error('--bump and --set are mutually exclusive');
	}
	const target: ReleaseTarget | undefined =
		set !== undefined
			? { set }
			: bump !== undefined
				? { kind: bump }
				: undefined;
	return { target, write, publish, validate, tool, provenance, quiet };
}

/**
 * Audit-h2-fix + Solid-OCP: every helper now depends on
 * `IReleaseLogger`, not on a `quiet: boolean`. The decision of whether
 * to suppress `info` (the `--quiet` flag) lives in the main entry
 * point, which instantiates the right logger. Each helper just
 * forwards to the interface.
 */

function printPlan(plan: IReleasePlan, logger: IReleaseLogger): void {
	logger.info(`\nLockstep target version: ${plan.to}\n`);
	for (const e of plan.entries) {
		const v = e.from === e.to ? e.to : `${e.from} → ${e.to}`;
		const peer =
			e.peerCoreFrom !== undefined && e.peerCoreFrom !== e.peerCoreTo
				? `  (peer ${CORE_PEER}: ${e.peerCoreFrom} → ${e.peerCoreTo})`
				: '';
		logger.info(`  ${e.name.padEnd(28)} ${v}${peer}`);
	}
	logger.info('');
}

/** Rewrite version + core peerDependency in place, preserving tab indentation. */
function applyPlan(plan: IReleasePlan, logger: IReleaseLogger): void {
	for (const e of plan.entries) {
		const pkg = readPkg(e.dir);
		pkg.version = e.to;
		if (
			e.peerCoreTo !== undefined &&
			pkg.peerDependencies?.[CORE_PEER] !== undefined
		) {
			pkg.peerDependencies[CORE_PEER] = e.peerCoreTo;
		}
		const out = `${JSON.stringify(pkg, null, '\t')}\n`;
		writeFileSync(join(ROOT, e.dir, 'package.json'), out);
		logger.info(`  wrote ${e.dir}/package.json → ${e.to}`);
	}
	logger.info('');
}

/**
 * f00152 S7: pure decision function — given the current config and a
 * new release version, return the next config. When the existing
 * pin is the `latest-published` sentinel or is absent, we leave it
 * (the sentinel tracks the latest tag and needs no bumping). When
 * the pin is a concrete semver that is now stale, we move it to the
 * new version — this keeps a self-host agent's CI green after the
 * upgrade. Exported for unit testing.
 */
export const resolveBumpCoreVersion = <T extends { coreVersion?: string }>(
	currentConfig: T,
	newVersion: string,
): T => {
	if (
		currentConfig.coreVersion === undefined ||
		currentConfig.coreVersion === 'latest-published'
	) {
		return currentConfig;
	}
	return { ...currentConfig, coreVersion: newVersion };
};

/**
 * f00152 S7: I/O wrapper around `resolveBumpCoreVersion`. Reads the
 * config, asks the pure function what to do, writes back when the
 * bump happened. Idempotent — when the pin is the sentinel or
 * absent, the file is not touched.
 */
function bumpConfigCoreVersion(
	newVersion: string,
	logger: IReleaseLogger,
): void {
	const configPath = join(ROOT, 'mcp-vertex.config.json');
	const raw = JSON.parse(readFileSync(configPath, 'utf8')) as {
		coreVersion?: string;
	};
	const next = resolveBumpCoreVersion(raw, newVersion);
	if (next === raw) {
		logger.info(
			`  mcp-vertex.config.json#coreVersion unchanged (${raw.coreVersion ?? 'unset'} tracks the latest tag).`,
		);
		return;
	}
	writeFileSync(configPath, `${JSON.stringify(next, null, '\t')}\n`);
	logger.info(`  bumped mcp-vertex.config.json#coreVersion → ${newVersion}`);
}

function run(cmd: string, args: readonly string[], cwd: string): void {
	execFileSync(cmd, args as string[], { cwd, stdio: 'inherit' });
}

const readRegistryOverride = (): string | undefined =>
	process.env.npm_config_registry ?? process.env.NPM_CONFIG_REGISTRY;

const inspectTarball = (tarballPath: string): void => {
	const packageJson = execFileSync(
		'tar',
		['-xOf', tarballPath, 'package/package.json'],
		{ encoding: 'utf8' },
	);
	if (packageJson.includes('workspace:')) {
		throw new Error(
			`verified tarball still contains workspace: dependency ranges: ${tarballPath}`,
		);
	}
};

/**
 * Every entry in a lockstep release plan is bumped to the SAME `plan.to`
 * (see `applyPlan`, which writes it into each package's own `package.json`
 * before this runs) — so resolving per-entry, from `entry.to`, is both the
 * general-purpose rule (never borrow a version from a package other than
 * the one being depended on) and, in this lockstep case, exactly `plan.to`
 * for every entry.
 */
const createWorkspaceDepsPlan = (plan: IReleasePlan): IWorkspaceDepsPlan => ({
	packageVersions: new Map(
		plan.entries.map((entry) => [entry.name, entry.to] as const),
	),
});

async function publishAll(
	tool: 'bun' | 'npm',
	provenance: boolean,
	plan: IReleasePlan,
	logger: IReleaseLogger,
): Promise<void> {
	if (provenance && tool === 'bun') {
		logger.warn(
			'--provenance has no effect with --tool=bun (bun publish does not ' +
				'support provenance attestations); ignoring. Use --tool=npm.',
		);
	}
	const stagingRoot = mkdtempSync(join(tmpdir(), 'mcp-vertex-release-'));
	try {
		const workspacePlan = createWorkspaceDepsPlan(plan);
		const stagedDirs: string[] = [];
		for (const dir of PUBLISH_ORDER) {
			const pkg = readPkg(dir);
			const group = dir.startsWith('packages/') ? 'packages' : 'plugins';
			const name = dir.slice(dir.indexOf('/') + 1);
			const buildDir = join(ROOT, 'build', group, name, pkg.version);
			const stageDir = join(stagingRoot, dir);
			await stageBuildForPublish(join(ROOT, dir), buildDir, stageDir);
			await rewriteWorkspaceDeps(stageDir, workspacePlan);
			stagedDirs.push(stageDir);
		}

		if (tool === 'bun') {
			const args = ['publish'];
			for (const [index, dir] of PUBLISH_ORDER.entries()) {
				logger.info(
					`\n=== publishing ${dir} (${tool} ${args.join(' ')}) ===`,
				);
				run(tool, args, stagedDirs[index] as string);
			}
			logger.info('\nAll packages published.');
			return;
		}

		const tarballRoot = join(stagingRoot, 'tarballs');
		await mkdir(tarballRoot, { recursive: true });
		const tarballPaths: string[] = [];
		for (const [index, dir] of PUBLISH_ORDER.entries()) {
			logger.info(`\n=== packing ${dir} for verified npm publish ===`);
			const tarballPath = await packRewrittenTarball(
				stagedDirs[index] as string,
				workspacePlan,
				{ outDir: tarballRoot },
			);
			inspectTarball(tarballPath);
			tarballPaths.push(tarballPath);
		}
		const publishInput: IPublishTarballsInput = {
			pkgDir: ROOT,
			tarballPaths,
			tool,
			registry: readRegistryOverride(),
		};
		assertTarballsProvided(publishInput);
		const results = await publishTarballs(publishInput);
		const failure = results.find((result) => !result.ok);
		if (failure !== undefined) {
			throw new Error(
				failure.stderr === undefined
					? `npm publish failed for ${failure.tarballPath}`
					: `npm publish failed for ${failure.tarballPath}: ${failure.stderr}`,
			);
		}
		logger.info('\nAll packages published.');
	} finally {
		rmSync(stagingRoot, { recursive: true, force: true });
	}
}

async function main(): Promise<void> {
	const flags = parseFlags(process.argv.slice(2));
	const pkgs = PUBLISH_ORDER.map((dir) => toReleasePkg(dir, readPkg(dir)));

	// With no version target, "plan" simply reports current versions (a no-op
	// lockstep on the core's current version) so the publish plan is visible.
	const target: ReleaseTarget = flags.target ?? {
		set: pkgs[0]?.version ?? '0.0.0',
	};
	const plan = computeReleasePlan(pkgs, target);

	// Solid-DIP: the `--quiet` flag chooses WHICH logger implementation
	// we inject. Helpers never need to know whether progress is
	// suppressed; they just call `logger.info(...)` and trust the
	// implementation. Tests can pass a `createRecordingLogger()` and
	// assert on `log.calls` without monkey-patching console.
	const logger: IReleaseLogger = flags.quiet
		? createQuietLogger()
		: createConsoleLogger();

	const versionChange = flags.target !== undefined;
	logger.info(
		versionChange
			? `Release plan (${flags.write ? 'APPLY' : 'dry-run'}):`
			: 'Current versions (no --bump/--set given):',
	);
	printPlan(plan, logger);

	if (versionChange && flags.write) {
		applyPlan(plan, logger);
		// f00152 S7: regenerate the stable facade manifest after every
		// release so `docs/mcp-vertex/api/stable.json` stays in sync
		// with `packages/core/src/lib/api/stable-facade.ts`. Idempotent
		// (the builder exits early when the file is unchanged).
		logger.info('Regenerating stable facade manifest (f00152 S7)…\n');
		run('bun', ['run', 'build:stable-manifest'], ROOT);
		// Also bump `coreVersion` in mcp-vertex.config.json so a
		// self-host agent's pin either matches the new release or
		// stays on the sentinel (`latest-published`). The release
		// script always moves the pin to the new version; CI
		// (`lint:core-version-pin`) refuses to ship if the pin
		// diverges from a published tag.
		bumpConfigCoreVersion(
			pkgs[0]?.version ??
				('set' in target ? target.set : 'latest-published'),
			logger,
		);
	} else if (versionChange) {
		logger.info(
			'Dry-run: pass --write to apply these changes to package.json.\n',
		);
	}

	if (flags.publish) {
		if (flags.validate) {
			logger.info('Validating before publish (bun run validate)…\n');
			run('bun', ['run', 'validate'], ROOT);
		}
		// Compile every package to centralized build output, then stage that
		// output as the package-local `dist/` path required by exports.
		logger.info(
			'Building centralized artifacts before publish (bun run build)…\n',
		);
		run('bun', ['run', 'build'], ROOT);
		await publishAll(flags.tool, flags.provenance, plan, logger);
	} else {
		logger.info('Pass --publish to publish in order:');
		logger.info(`  ${PUBLISH_ORDER.join('\n  ')}\n`);
	}
}

main().catch((err: unknown) => {
	if (
		typeof err === 'object' &&
		err !== null &&
		'code' in err &&
		err.code === 'missing-tarballs'
	) {
		console.error(
			'Refusing --tool=npm publish without verified tarballs. Generate and inspect rewritten tarballs before publishing.',
		);
		process.exit(2);
	}
	// Audit-h10-fix: surface the actual stack so a release failure is
	// debuggable from the CI log without re-running locally.
	console.error(err instanceof Error ? (err.stack ?? err.message) : err);
	process.exit(1);
});
