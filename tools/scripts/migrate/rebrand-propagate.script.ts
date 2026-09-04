#!/usr/bin/env bun
// rebrand-propagate.script.ts — end-to-end rebrand sweep.
//
// When the project changes its public brand (e.g. `mcp-vertex` → `delendai`),
// three layers of the monorepo must be kept in lockstep or stale strings
// keep leaking through:
//
//   1. Source files under src/ across packages and plugins — docstrings
//      and literal strings.
//   2. Bundles: packages/<name>/dist/<entry>.js,
//      plugins/<name>/dist/<entry>.js,
//      and build/<group>/<name>/<version>/<entry>.js (publishable).
//      Run `bun run build` (root) to rebuild — see
//      tools/scripts/compile/build.script.ts.
//   3. Generated manifest: apps/web/src/data/manifests/capabilities.json.
//      Run `bun run --cwd apps/web gen:capabilities`.
//
// The tool registry and the website both read from layer 3, so a fix that
// only touches layer 1 silently keeps emitting the old brand until the
// build is re-run. This script runs all three layers in order and verifies
// the result with a global grep, so a CI gate can fail on a partial
// rebrand.
//
// Usage:
//   bun run tools/scripts/migrate/rebrand-propagate.script.ts \
//       --from=mcp-vertex --to=delendai
//
//   bun run tools/scripts/migrate/rebrand-propagate.script.ts --check
//
// See docs/delendai/BRAND-MIGRATION.md (canonical play book).

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

interface IOptions {
	from: string;
	to: string;
	check: boolean;
}

const parseArgs = (argv: readonly string[]): IOptions => {
	const opts: IOptions = { from: 'mcp-vertex', to: 'delendai', check: false };
	for (const raw of argv) {
		if (raw === '--check') opts.check = true;
		else if (raw.startsWith('--from='))
			opts.from = raw.slice('--from='.length);
		else if (raw.startsWith('--to=')) opts.to = raw.slice('--to='.length);
		else if (raw === '--help' || raw === '-h') {
			console.log(
				'Usage: bun run tools/scripts/migrate/rebrand-propagate.script.ts ' +
					'[--from=<needle>] [--to=<replacement>] [--check]',
			);
			process.exit(0);
		}
	}
	return opts;
};

const ROOT = resolve(import.meta.dir, '..', '..', '..');
const SCAN_ROOT = (() => {
	// Allow `bun run ... --root=<path>` so the spec can point at an
	// isolated fixture instead of the real monorepo. Defaults to ROOT.
	const arg = process.argv.find((a) => a.startsWith('--root='));
	return arg ? resolve(process.cwd(), arg.slice('--root='.length)) : ROOT;
})();

const runStep = (label: string, cmd: readonly string[], cwd = ROOT): void => {
	console.log(`\n→ ${label}`);
	console.log(`  $ ${cmd.join(' ')}  (cwd=${relative(ROOT, cwd) || '.'})`);
	const result = spawnSync(cmd[0]!, cmd.slice(1), {
		cwd,
		stdio: 'inherit',
		env: process.env,
	});
	if (result.status !== 0) {
		throw new Error(`${label} failed with exit ${result.status}`);
	}
};

const SCAN_EXTENSIONS = new Set([
	'.ts',
	'.tsx',
	'.js',
	'.mjs',
	'.cjs',
	'.json',
]);

// Directories that are NEVER scanned (tooling / VCS / docs / cache).
const SKIP_DIRS = new Set([
	'node_modules',
	'.cache',
	'.git',
	'.worktrees',
	'docs',
]);

// Bundled output directories: skipped by default (they are generated),
// included when `--check` runs against a brand-new bundle so a partial
// rebuild can be flagged. The brand propagation tool always re-builds
// these before scanning, so the default skip is safe for production.
const BUILD_DIRS = new Set(['build', 'dist']);

const SKIP_PATHS = [
	'CHANGELOG.md',
	'llm-subject-substitutions.json',
	'rewrite-llm-attribution',
	'proposal-files-exist.baseline',
	'/legacy/',
	// The migration script documents both names by design — exclude itself
	// and its spec so the post-migration sweep does not flag the canonical
	// references to the old brand that the tests intentionally carry.
	'rebrand-propagate.script.ts',
	'rebrand-propagate.spec.ts',
];

interface IFindOptions {
	readonly includeBuild: boolean;
}

// Brand contract assertions. The two-form rule (`delendai` for machine
// surfaces, `DelendAI` for prose) and the origin phrase (*AI delenda
// est*) live in `docs/delendai/BRAND.md`. These checks fail the gate if
// the contract doc is missing, has been edited to drop the origin
// paragraph, or no longer references both forms.
const BRAND_CONTRACT_PATH = 'docs/delendai/BRAND.md';
const BRAND_DOCS: ReadonlyArray<{
	readonly path: string;
	readonly mustContainAll: readonly string[];
}> = [
	{
		path: BRAND_CONTRACT_PATH,
		mustContainAll: ['DelendAI', '`delendai`', 'AI delenda est'],
	},
	{
		path: 'docs/delendai/README-DELENDAI.md',
		mustContainAll: ['DelendAI', 'AI delenda est'],
	},
	{
		path: 'docs/delendai/VISION-AND-OPERATING-MODEL.md',
		mustContainAll: ['DelendAI', 'AI delenda est'],
	},
];

interface IBrandContract {
	readonly ok: boolean;
	readonly lines: readonly string[];
}

const checkBrandContract = (root: string): IBrandContract => {
	const lines: string[] = [];
	let ok = true;
	for (const doc of BRAND_DOCS) {
		const abs = join(root, doc.path);
		if (!existsSync(abs)) {
			lines.push(`✘ ${doc.path} missing`);
			ok = false;
			continue;
		}
		const content = readFileSync(abs, 'utf8');
		const missing = doc.mustContainAll.filter(
			(token) => !content.includes(token),
		);
		if (missing.length === 0) {
			lines.push(`✓ ${doc.path} — contract tokens present`);
		} else {
			lines.push(`✘ ${doc.path} missing tokens: ${missing.join(', ')}`);
			ok = false;
		}
	}
	return { ok, lines };
};

// Walk the repo and return every file under dir whose contents contain
// needle, respecting the project's exclude rules.
const findFilesWith = (
	dir: string,
	needle: string,
	opts: IFindOptions,
): string[] => {
	const matches: string[] = [];
	const walk = (current: string): void => {
		let entries: string[];
		try {
			entries = readdirSync(current);
		} catch {
			return;
		}
		for (const name of entries) {
			const abs = join(current, name);
			let st;
			try {
				st = statSync(abs);
			} catch {
				continue;
			}
			if (st.isDirectory()) {
				const base = abs.split('/').pop()!;
				if (SKIP_DIRS.has(base)) continue;
				if (BUILD_DIRS.has(base) && !opts.includeBuild) continue;
				walk(abs);
			} else if (SCAN_EXTENSIONS.has(extname(name))) {
				const rel = relative(SCAN_ROOT, abs);
				if (SKIP_PATHS.some((skip) => rel.includes(skip))) continue;
				let content: string;
				try {
					content = readFileSync(abs, 'utf8');
				} catch {
					continue;
				}
				if (content.includes(needle)) matches.push(rel);
			}
		}
	};
	if (existsSync(dir)) walk(dir);
	return matches.sort();
};

const main = (): void => {
	const opts = parseArgs(process.argv.slice(2));
	console.log(`Rebrand propagation: "${opts.from}" → "${opts.to}"`);
	console.log(
		`Mode: ${opts.check ? 'check-only (read-only)' : 'full sweep'}`,
	);

	if (!opts.check) {
		// Layer 2: rebuild all bundles.
		runStep('Rebuild bundles (bun run build)', ['bun', 'run', 'build']);
		// Layer 3: regenerate the capabilities manifest.
		runStep('Regenerate capabilities.json', [
			'bun',
			'run',
			'--cwd',
			'apps/web',
			'gen:capabilities',
		]);
	}

	// Layer 1+2+3 verification: scan the live surface for any remaining
	// occurrence of the needle. The scan covers source AND bundles (when
	// includeBuild is true) so the check is meaningful after a rebuild.
	const liveHits = findFilesWith(SCAN_ROOT, opts.from, {
		includeBuild: true,
	});
	const newHits = findFilesWith(SCAN_ROOT, opts.to, { includeBuild: false });

	console.log('\nVerification:');
	console.log(
		`  - "${opts.from}" still appears in ${liveHits.length} live file(s)`,
	);
	if (liveHits.length > 0) {
		for (const file of liveHits.slice(0, 20))
			console.log(`      · ${file}`);
		if (liveHits.length > 20)
			console.log(`      · …(+${liveHits.length - 20} more)`);
	}
	console.log(
		`  - "${opts.to}" already used in ${newHits.length} live source file(s)`,
	);

	if (liveHits.length > 0) {
		console.error(
			`\n✘ Rebrand propagation INCOMPLETE — ${liveHits.length} file(s) still reference "${opts.from}".`,
		);
		console.error(
			`  Inspect the files above, migrate their source, then re-run this script.`,
		);
		process.exit(1);
	}

	// Brand contract assertions: the lowercase ↔ DelendAI split and the
	// origin phrase are codified in docs/delendai/BRAND.md. They are part
	// of the same --check gate so a partial migration (e.g. a brand
	// string rename that forgets the origin paragraph) cannot silently
	// pass. See docs/delendai/BRAND.md for the full contract.
	const brandDocsContract = checkBrandContract(ROOT);
	console.log('\nBrand contract:');
	for (const line of brandDocsContract.lines) console.log(`  ${line}`);
	if (!brandDocsContract.ok) {
		console.error(
			`\n✘ Brand contract INCOMPLETE — see docs/delendai/BRAND.md.`,
		);
		process.exit(1);
	}

	console.log(
		`\n✓ Reband propagation clean — every layer (source + bundles + manifest) uses "${opts.to}", brand contract green.`,
	);
};

main();
