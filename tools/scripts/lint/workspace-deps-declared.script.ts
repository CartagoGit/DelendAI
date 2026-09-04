#!/usr/bin/env bun
/**
 * workspace-deps-declared.script.ts
 *
 * Every `@delendai/*` a package imports must be declared in that
 * package's own `package.json`.
 *
 * Three packages were caught importing a sibling they never declared on
 * 2026-09-03 alone — `adaptive-optimizer` → `proposals`,
 * `error-reporting` → `commit-policy`, `proposals` → `quality`. All
 * three compiled locally and none of them could compile from a clean
 * checkout, which is why CI found them and nobody else did.
 *
 * The reason the local build lies: bun links workspaces per consumer
 * rather than hoisting them, so `node_modules/@delendai/quality`
 * exists only inside packages that declare it. A package that imports it
 * without declaring it resolves through whatever a previous install
 * happened to leave behind — real on a developer's machine, absent on a
 * fresh clone. So the failure is invisible exactly where it is cheap to
 * fix and loud exactly where it is expensive.
 *
 * Exit codes: 0 — every workspace import is declared. 1 — at least one
 * is not.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';

export interface IUndeclaredDependency {
	readonly workspace: string;
	readonly imported: string;
	readonly sample: string;
}

/** `@delendai/quality/public` → `@delendai/quality`. */
export const packageNameOf = (specifier: string): string => {
	const parts = specifier.split('/');
	return parts.slice(0, 2).join('/');
};

const IMPORT_RE =
	/from\s+['"](@delendai\/[^'"]+)['"]|import\s*\(\s*['"](@delendai\/[^'"]+)['"]/gu;

/**
 * Blank out backtick-delimited spans.
 *
 * `scaffold-extension-host.ts` emits generated source inside template
 * literals, imports and all. Scanning the raw text reported
 * `packages/core` as importing `@delendai/ui-extension` — text that
 * core writes for somebody ELSE to compile, and that core never
 * resolves. A gate is only worth having if its findings are real, so it
 * is better to miss an import written inside a template than to send
 * everyone to check three that were never imports at all.
 */
export const stripTemplateLiterals = (text: string): string =>
	text.replace(/`(?:\\.|[^`\\])*`/gsu, '``');

/** Every `@delendai/*` package a source tree imports, with one sample site. */
export const importedWorkspaces = (
	root: string,
	dirRel: string,
): ReadonlyMap<string, string> => {
	const found = new Map<string, string>();
	const walk = (abs: string, rel: string): void => {
		let entries: string[];
		try {
			entries = readdirSync(abs);
		} catch {
			return;
		}
		for (const entry of entries) {
			if (entry === 'node_modules' || entry === 'dist') continue;
			const childAbs = join(abs, entry);
			const childRel = `${rel}/${entry}`;
			if (statSync(childAbs).isDirectory()) {
				walk(childAbs, childRel);
				continue;
			}
			if (!entry.endsWith('.ts') || entry.endsWith('.d.ts')) continue;
			const text = stripTemplateLiterals(readFileSync(childAbs, 'utf8'));
			for (const match of text.matchAll(IMPORT_RE)) {
				const specifier = match[1] ?? match[2];
				if (specifier === undefined) continue;
				const name = packageNameOf(specifier);
				if (!found.has(name)) found.set(name, childRel);
			}
		}
	};
	// `src` for a package, `scripts` for `tools`. Walking the workspace
	// root instead would descend into `node_modules` and every fixture
	// tree, so the source directories are named rather than guessed.
	for (const sourceDir of ['src', 'scripts']) {
		walk(join(root, dirRel, sourceDir), `${dirRel}/${sourceDir}`);
	}
	return found;
};

/**
 * Every workspace, not just the two obvious groups.
 *
 * This scanned `packages` and `plugins` only, and the omission cost
 * exactly what the header warns about: `tools/` imported 39 sibling
 * workspaces and declared one. It resolved for months through a
 * `node_modules/@<scope>/` tree an old install had left behind, and
 * surfaced the moment that tree was rebuilt — on a rename, which is the
 * worst possible time to discover it.
 *
 * `apps` and `extensions` are workspaces too and were equally unseen.
 */
const WORKSPACE_GROUPS = ['packages', 'plugins', 'apps', 'extensions'] as const;

/** Workspaces that are a single directory rather than a group of them. */
const STANDALONE_WORKSPACES = ['tools', 'tools/docs-api'] as const;

const workspaceDirs = (root: string): readonly string[] => {
	const out: string[] = [];
	for (const rel of STANDALONE_WORKSPACES) {
		try {
			statSync(join(root, rel, 'package.json'));
			out.push(rel);
		} catch {
			/* not present in this checkout */
		}
	}
	for (const group of WORKSPACE_GROUPS) {
		let entries: string[];
		try {
			entries = readdirSync(join(root, group));
		} catch {
			continue;
		}
		for (const entry of entries) {
			const rel = `${group}/${entry}`;
			try {
				statSync(join(root, rel, 'package.json'));
				out.push(rel);
			} catch {
				/* not a workspace */
			}
		}
	}
	return out.sort();
};

/**
 * The package names that are actually workspaces in this checkout.
 *
 * An import of `@<scope>/alpha` where no such workspace exists is not an
 * undeclared dependency — it is a string. This gate's OWN spec is full of
 * them, and without this it reported its own fixtures. A check that fires
 * on its test data teaches everyone to ignore it.
 */
const workspaceNames = (root: string): ReadonlySet<string> => {
	const names = new Set<string>();
	for (const dirRel of workspaceDirs(root)) {
		try {
			const pkg = JSON.parse(
				readFileSync(join(root, dirRel, 'package.json'), 'utf8'),
			) as { name?: string };
			if (typeof pkg.name === 'string') names.add(pkg.name);
		} catch {
			/* unreadable manifest */
		}
	}
	return names;
};

export const findUndeclared = (
	root: string,
): readonly IUndeclaredDependency[] => {
	const out: IUndeclaredDependency[] = [];
	const real = workspaceNames(root);
	for (const dirRel of workspaceDirs(root)) {
		let pkg: {
			name?: string;
			dependencies?: Record<string, string>;
			devDependencies?: Record<string, string>;
			peerDependencies?: Record<string, string>;
		};
		try {
			pkg = JSON.parse(
				readFileSync(join(root, dirRel, 'package.json'), 'utf8'),
			) as typeof pkg;
		} catch {
			continue;
		}
		const declared = new Set([
			...Object.keys(pkg.dependencies ?? {}),
			...Object.keys(pkg.devDependencies ?? {}),
			...Object.keys(pkg.peerDependencies ?? {}),
		]);
		for (const [imported, sample] of importedWorkspaces(root, dirRel)) {
			// A package importing itself through its own public name is
			// a different smell, and one this gate has no opinion on.
			if (imported === pkg.name) continue;
			if (!real.has(imported)) continue;
			if (declared.has(imported)) continue;
			out.push({ workspace: dirRel, imported, sample });
		}
	}
	return out;
};

export const main = async (): Promise<number> => {
	const root = repoRoot();
	const undeclared = findUndeclared(root);
	const scanned = workspaceDirs(root).length;

	if (undeclared.length === 0) {
		console.log(
			`✓ workspace-deps-declared: ok (${String(scanned)} workspace(s) scanned).`,
		);
		return 0;
	}

	console.error(
		`✖ workspace-deps-declared: ${String(undeclared.length)} undeclared workspace import(s):`,
	);
	for (const item of undeclared) {
		console.error(
			`  ${item.workspace} imports ${item.imported} (e.g. ${item.sample}) but does not declare it`,
		);
	}
	console.error('');
	console.error(
		'  This compiles on a machine where an earlier install happened to leave the',
	);
	console.error(
		'  package linked, and fails on a clean checkout — so it passes locally and',
	);
	console.error(
		'  breaks CI. Add it to that package.json (`"workspace:*"`) and re-run',
	);
	console.error('  `bun install` so the lockfile agrees.');
	return 1;
};

if (import.meta.main) {
	process.exit(await main());
}
