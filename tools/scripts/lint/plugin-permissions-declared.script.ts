#!/usr/bin/env bun
/**
 * plugin-permissions-declared.script.ts — q00017 S6.
 *
 * A plugin may not USE an effect it does not DECLARE.
 *
 * The repository already has the two halves of this and not the join.
 * Every one of the 56 manifests declares a `permissions` array;
 * `effect-boundaries.script.ts` bans importing a sensitive builtin from
 * plugin source; `capabilities-declared.script.ts` checks that
 * `ctx.capabilities.<group>.<action>` calls are declared. What nothing
 * did was compare the two: a plugin could spawn a process, read the
 * environment or write to git while its manifest advertised
 * `filesystem-read`, and every gate stayed green because each was
 * looking at one side of the question.
 *
 * That gap matters because the declaration is what a host SHOWS a user.
 * q00017's premise is that detection and authorization are different
 * planes: the graph says what exists, policy says what may run. A
 * declaration nobody checks is not policy, it is a label.
 *
 * Direction, deliberately asymmetric
 * ----------------------------------
 * UNDER-declaration fails: evidence of an effect with no matching
 * permission is a plugin doing more than it admits.
 *
 * OVER-declaration is reported but never fails. A permission declared
 * without visible evidence is usually honest breadth — an injectable
 * seam, a code path this file-level heuristic cannot see — and failing
 * on it would push authors to under-declare to keep the gate quiet,
 * which is the opposite of what the gate is for.
 *
 * Heuristics, not an AST, matching `effect-boundaries.script.ts` by
 * intent: hermetic regexes over plugin source, a JSON baseline of
 * `{ pluginId: count }`, `--update` to rewrite it, and failure only on a
 * NEW or INCREASED count. Existing debt is allowed; new debt is blocked.
 * A file may waive itself with
 *
 *   // permissions-declared-authorized: <reason, >= 12 chars>
 *
 * reusing the marker idiom already established by the two sibling
 * scripts rather than inventing a competing waiver format.
 *
 * Usage:
 *   bun tools/scripts/lint/plugin-permissions-declared.script.ts
 *   bun tools/scripts/lint/plugin-permissions-declared.script.ts --update
 *   bun tools/scripts/lint/plugin-permissions-declared.script.ts --report
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';

const BASELINE_REL =
	'tools/scripts/lint/plugin-permissions-declared.baseline.json';

const EXCLUDE_DIR = new Set([
	'node_modules',
	'dist',
	'build',
	'.cache',
	'.git',
	'generated',
	'tests',
	'__tests__',
]);

export const MIN_AUTHORIZATION_LENGTH = 12;
const AUTHORIZATION_RE = /permissions-declared-authorized:\s*(.{12,})/u;

/**
 * Evidence → permission category.
 *
 * Each pattern must be something a plugin cannot do by accident. A
 * pattern that also matches ordinary code would make the gate produce
 * findings nobody can act on, and a gate whose findings are noise is one
 * everybody learns to skip.
 */
export interface IEffectProbe {
	readonly permission: string;
	readonly pattern: RegExp;
	/** Shown in the failure so the author knows what to look at. */
	readonly describe: string;
}

export const EFFECT_PROBES: readonly IEffectProbe[] = [
	{
		permission: 'process',
		pattern:
			/from\s+['"]node:child_process['"]|require\(['"]node:child_process['"]\)/u,
		describe: 'imports node:child_process',
	},
	{
		permission: 'filesystem-write',
		pattern:
			/\b(?:writeFile|writeFileSync|mkdir|mkdirSync|rm|rmSync|unlink|unlinkSync|rename|renameSync|appendFile|appendFileSync)\s*\(/u,
		describe: 'calls a node:fs write API',
	},
	{
		permission: 'filesystem-read',
		pattern:
			/\b(?:readFile|readFileSync|readdir|readdirSync|stat|statSync|realpath)\s*\(/u,
		describe: 'calls a node:fs read API',
	},
	{
		permission: 'network',
		pattern: /\bfetch\s*\(|from\s+['"]node:(?:http|https|net)['"]/u,
		describe: 'performs network I/O',
	},
	{
		permission: 'env-read',
		pattern: /\bprocess\.env\b/u,
		describe: 'reads process.env',
	},
];

export interface IPermissionFinding {
	readonly pluginId: string;
	readonly permission: string;
	readonly file: string;
	readonly describe: string;
}

const walk = (dir: string, out: string[] = []): string[] => {
	let entries: ReturnType<typeof readdirSync>;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const entry of entries) {
		if (entry.isDirectory()) {
			if (EXCLUDE_DIR.has(entry.name)) continue;
			walk(join(dir, entry.name), out);
			continue;
		}
		if (!entry.name.endsWith('.ts')) continue;
		if (entry.name.endsWith('.spec.ts') || entry.name.endsWith('.d.ts')) {
			continue;
		}
		out.push(join(dir, entry.name));
	}
	return out;
};

/** Read the `permissions: [...]` array out of a plugin manifest. */
export const declaredPermissions = (manifestSource: string): Set<string> => {
	const match = /permissions\s*:\s*\[([^\]]*)\]/u.exec(manifestSource);
	if (match?.[1] === undefined) return new Set();
	return new Set(
		[...match[1].matchAll(/['"]([a-z-]+)['"]/gu)].map((m) => m[1] ?? ''),
	);
};

/**
 * Compare one plugin's observable effects against its declaration.
 *
 * Pure: the caller supplies the sources, so this is directly testable
 * without a filesystem.
 */
export const findUndeclaredPermissions = (input: {
	readonly pluginId: string;
	readonly declared: ReadonlySet<string>;
	readonly files: ReadonlyArray<{
		readonly path: string;
		readonly source: string;
	}>;
	readonly probes?: readonly IEffectProbe[];
}): readonly IPermissionFinding[] => {
	const probes = input.probes ?? EFFECT_PROBES;
	const seen = new Set<string>();
	const findings: IPermissionFinding[] = [];
	for (const file of input.files) {
		if (AUTHORIZATION_RE.test(file.source)) continue;
		for (const probe of probes) {
			if (input.declared.has(probe.permission)) continue;
			if (seen.has(probe.permission)) continue;
			if (!probe.pattern.test(file.source)) continue;
			seen.add(probe.permission);
			findings.push({
				pluginId: input.pluginId,
				permission: probe.permission,
				file: file.path,
				describe: probe.describe,
			});
		}
	}
	return findings;
};

const collect = (root: string): readonly IPermissionFinding[] => {
	const pluginsDir = join(root, 'plugins');
	let ids: string[];
	try {
		ids = readdirSync(pluginsDir, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name)
			.sort();
	} catch {
		return [];
	}
	const findings: IPermissionFinding[] = [];
	for (const id of ids) {
		const manifestPath = join(pluginsDir, id, 'plugin.manifest.ts');
		if (!existsSync(manifestPath)) continue;
		const declared = declaredPermissions(
			readFileSync(manifestPath, 'utf8'),
		);
		const files = walk(join(pluginsDir, id, 'src')).map((abs) => ({
			path: relative(root, abs),
			source: readFileSync(abs, 'utf8'),
		}));
		findings.push(
			...findUndeclaredPermissions({ pluginId: id, declared, files }),
		);
	}
	return findings;
};

const readBaseline = (root: string): Record<string, number> => {
	const path = join(root, BASELINE_REL);
	if (!existsSync(path)) return {};
	try {
		return JSON.parse(readFileSync(path, 'utf8')) as Record<string, number>;
	} catch {
		return {};
	}
};

export const main = (): number => {
	const root = repoRoot();
	const findings = collect(root);
	const counts: Record<string, number> = {};
	for (const finding of findings) {
		counts[finding.pluginId] = (counts[finding.pluginId] ?? 0) + 1;
	}

	if (process.argv.includes('--update')) {
		writeFileSync(
			join(root, BASELINE_REL),
			`${JSON.stringify(counts, null, '\t')}\n`,
			'utf8',
		);
		console.log(
			`plugin-permissions-declared: baseline rewritten (${String(
				Object.keys(counts).length,
			)} plugin(s) with debt).`,
		);
		return 0;
	}

	if (process.argv.includes('--report')) {
		for (const [id, count] of Object.entries(counts).sort()) {
			console.log(`  ${id}: ${String(count)}`);
		}
		return 0;
	}

	// A gate that examined nothing must never report ok — the repo has a
	// `lint:no-silent-gates` check and a scar behind it.
	const pluginCount = readdirSync(join(root, 'plugins'), {
		withFileTypes: true,
	}).filter((entry) => entry.isDirectory()).length;
	if (pluginCount === 0) {
		console.error(
			'✖ plugin-permissions-declared: scanned 0 plugins — the check examined nothing, which is a failure of the check, not a pass.',
		);
		return 2;
	}

	const baseline = readBaseline(root);
	const regressions = findings.filter(
		(finding) =>
			(counts[finding.pluginId] ?? 0) > (baseline[finding.pluginId] ?? 0),
	);
	if (regressions.length === 0) {
		console.log(
			`✓ plugin-permissions-declared: ${String(pluginCount)} plugin(s) scanned; ${String(
				findings.length,
			)} baselined finding(s); no new undeclared effects.`,
		);
		return 0;
	}

	console.error(
		`✖ plugin-permissions-declared: ${String(regressions.length)} effect(s) used without a matching manifest permission:`,
	);
	for (const finding of regressions) {
		console.error(
			`  ${finding.pluginId} needs "${finding.permission}" — ${finding.file} ${finding.describe}`,
		);
	}
	console.error('');
	console.error(
		'  Add the permission to the plugin manifest, or waive the file with',
	);
	console.error(
		'  `// permissions-declared-authorized: <reason>` when the match is a false positive.',
	);
	return 1;
};

if (import.meta.main) {
	process.exit(main());
}
