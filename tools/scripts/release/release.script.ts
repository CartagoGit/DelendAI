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
 * Note on `workspace:*`: every package in this monorepo only references
 * `@mcp-vertex/core` as `workspace:*` in `devDependencies` (never in
 * `dependencies`/`peerDependencies`, which already carry a resolved `^X.Y.Z`
 * range via `applyPlan`). `npm publish` never installs devDependencies, so it
 * does not choke on the workspace protocol here — no pre-publish rewrite step
 * is needed for `--tool=npm` to work in this repo.
 *
 * Side-effect free planning lives in ./release-plan.ts; this file is the thin
 * fs + spawn shell around it (so it is intentionally not unit-tested).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
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

function run(cmd: string, args: readonly string[], cwd: string): void {
	execFileSync(cmd, args as string[], { cwd, stdio: 'inherit' });
}

function publishAll(
	tool: 'bun' | 'npm',
	provenance: boolean,
	logger: IReleaseLogger,
): void {
	if (provenance && tool === 'bun') {
		logger.warn(
			'--provenance has no effect with --tool=bun (bun publish does not ' +
				'support provenance attestations); ignoring. Use --tool=npm.',
		);
	}
	const args =
		provenance && tool === 'npm'
			? ['publish', '--provenance']
			: ['publish'];
	for (const dir of PUBLISH_ORDER) {
		logger.info(`\n=== publishing ${dir} (${tool} ${args.join(' ')}) ===`);
		run(tool, args, join(ROOT, dir));
	}
	logger.info('\nAll packages published.');
}

function main(): void {
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
		// Compile every package to publishable `dist/` (Node-runnable .js +
		// .d.ts) before publishing. Core builds first so plugins resolve its
		// types. `files: ["dist"]` is what ends up on the registry.
		logger.info('Building dist before publish (bun run build)…\n');
		run('bun', ['run', 'build'], ROOT);
		publishAll(flags.tool, flags.provenance, logger);
	} else {
		logger.info('Pass --publish to publish in order:');
		logger.info(`  ${PUBLISH_ORDER.join('\n  ')}\n`);
	}
}

try {
	main();
} catch (err) {
	// Audit-h10-fix: surface the actual stack so a release failure is
	// debuggable from the CI log without re-running locally.
	console.error(err instanceof Error ? (err.stack ?? err.message) : err);
	process.exit(1);
}
