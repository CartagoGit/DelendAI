/**
 * DO NOT RUN — HISTORICAL one-shot migration script.
 *
 * Originally located at tools/scripts/migrate/fix-fb88376-imports.script.ts,
 * this was a one-shot refactor that rewrote plugin imports during the
 * f00049 layout migration (commit fb88376). The migration is finished and
 * the rewrite table below is no longer needed — every `from` path it would
 * rewrite has been moved to the canonical `src/lib/{tools,services,contracts}/`
 * layout.
 *
 * Archived here per f00057 S10 ("clean orphan one-shot scripts") so it is
 * available for archaeology but not in the live `tools/scripts/` tree where
 * it would be auto-discovered by `lint:tools` and other gates.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const REPO_ROOT = process.cwd();
const WRITE = process.argv.includes('--write');

interface IRenameRule {
	plugin: string;
	from: string;
	to: string;
}
const RENAME_TABLE: readonly IRenameRule[] = [
	// deps
	{ plugin: 'deps', from: './engine', to: '../services/engine' },
	{ plugin: 'deps', from: '../lib/engine', to: './services/engine' },
	{ plugin: 'deps', from: './polyglot', to: '../services/polyglot' },
	{ plugin: 'deps', from: '../lib/polyglot', to: './services/polyglot' },
	// docs
	{ plugin: 'docs', from: './engine', to: '../services/engine' },
	{ plugin: 'docs', from: '../lib/engine', to: './services/engine' },
	// git
	{ plugin: 'git', from: './git', to: '../services/git' },
	{ plugin: 'git', from: '../lib/git', to: './services/git' },
	// notification
	{ plugin: 'notification', from: './watcher', to: '../services/watcher' },
	{
		plugin: 'notification',
		from: '../lib/watcher',
		to: './services/watcher',
	},
	{
		plugin: 'notification',
		from: './agent-events',
		to: '../services/agent-events',
	},
	{
		plugin: 'notification',
		from: '../lib/agent-events',
		to: './services/agent-events',
	},
	{
		plugin: 'notification',
		from: './agent-events-bridge',
		to: '../services/agent-events-bridge',
	},
	{
		plugin: 'notification',
		from: '../lib/agent-events-bridge',
		to: './services/agent-events-bridge',
	},
	// quality
	{ plugin: 'quality', from: './runner', to: '../services/runner' },
	{ plugin: 'quality', from: '../lib/runner', to: './services/runner' },
	{
		plugin: 'quality',
		from: './command-policy',
		to: '../services/command-policy',
	},
	{
		plugin: 'quality',
		from: '../lib/command-policy',
		to: './services/command-policy',
	},
	{ plugin: 'quality', from: './scopes', to: '../services/scopes' },
	{ plugin: 'quality', from: '../lib/scopes', to: './services/scopes' },
	{ plugin: 'quality', from: './run-all', to: '../services/run-all' },
	{ plugin: 'quality', from: '../lib/run-all', to: './services/run-all' },
	// web-fetch
	{ plugin: 'web-fetch', from: './engine', to: '../services/engine' },
	{ plugin: 'web-fetch', from: '../lib/engine', to: './services/engine' },
	{
		plugin: 'web-fetch',
		from: '../../../src/lib/engine',
		to: '../../../src/lib/services/engine',
	},
];

const pluginOf = (file: string): string | undefined => {
	const m = file.match(/(?:\/|^)plugins\/([^/]+)\//);
	return m ? m[1] : undefined;
};

const rulesForPlugin = (plugin: string): ReadonlyMap<string, string> => {
	const m = new Map<string, string>();
	for (const rule of RENAME_TABLE)
		if (rule.plugin === plugin) m.set(rule.from, rule.to);
	return m;
};

const isPluginFile = (path: string): boolean =>
	/(?:\/|^)plugins\/[^/]+\/(?:src\/(lib\/tools\/|index\.ts$|public\/index\.ts$)|tests\/src\/lib\/)/.test(
		path,
	);

const walk = async function* (dir: string): AsyncGenerator<string> {
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) yield* walk(full);
		else if (entry.isFile() && full.endsWith('.ts')) yield full;
	}
};

let totalFixes = 0;
let totalFiles = 0;
for await (const file of walk(join(REPO_ROOT, 'plugins'))) {
	if (!isPluginFile(file)) continue;
	const rel = relative(REPO_ROOT, file);
	const plugin = pluginOf(rel);
	if (plugin === undefined) continue;
	const rules = rulesForPlugin(plugin);
	if (rules.size === 0) continue;
	const content = await readFile(file, 'utf8');
	const lines = content.split('\n');
	let changed = false;
	const replacements: Array<{ line: number; from: string; to: string }> = [];
	lines.forEach((line, idx) => {
		const m = line.match(/from\s+(['"])([^'"]+)\1/);
		if (!m) return;
		const spec = m[2] as string;
		const target = rules.get(spec);
		if (target !== undefined && target !== spec) {
			replacements.push({ line: idx + 1, from: spec, to: target });
			totalFixes += 1;
			changed = true;
		}
	});
	if (!changed) continue;
	if (WRITE) {
		let next = content;
		for (const r of replacements) {
			next = next.replace(
				new RegExp(
					`from\\s+(['"])${r.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\1`,
				),
				`from $1${r.to}$1`,
			);
		}
		await writeFile(file, next, 'utf8');
	}
	totalFiles += 1;
	for (const r of replacements) {
		console.log(
			`  ${WRITE ? 'WRITTEN' : 'DRY'} ${rel}:${r.line}  ${r.from}  →  ${r.to}`,
		);
	}
}
console.log(
	`\n${WRITE ? 'wrote' : 'would-write'}=${totalFixes} files=${totalFiles} (mode=${WRITE ? 'write' : 'dry-run'})`,
);
