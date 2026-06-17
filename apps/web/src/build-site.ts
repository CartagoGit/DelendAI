/**
 * apps/web — generate the product/docs site (lives under apps/, like plugins/).
 *
 * Assembles the REAL server with every plugin, enumerates the live tools over
 * the MCP protocol (`listTools`), and renders a self-contained
 * `apps/web/dist/index.html` + a machine-readable `capabilities.json` (tools +
 * packages + versions) so every release records exactly what mcp-core ships.
 * Generated from the LIVE registry, so the site can never silently drift behind
 * the code.
 *
 * Coverage guard: any tool without a description is reported. With `--strict`
 * (used in CI) an undocumented tool fails the build.
 *
 *   bun run site            # generate, warn on gaps
 *   bun run site:strict     # generate, FAIL on gaps (CI)
 */
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

// Public API only (this runs at runtime against the built dist/, not via the
// vitest /lib aliases): run `bun run build` before `bun run site`.
import {
	assembleCliConfig,
	createMcpServer,
	parseCliArgs,
} from '@cartago-git/mcp-core/public';

import proposalsPlugin from '@cartago-git/mcp-proposals';
import rulesPlugin from '@cartago-git/mcp-rules';
import memoryPlugin from '@cartago-git/mcp-memory';
import gitPlugin from '@cartago-git/mcp-git';
import qualityPlugin from '@cartago-git/mcp-quality';
import searchPlugin from '@cartago-git/mcp-search';
import notificationPlugin from '@cartago-git/mcp-notification';
import docsPlugin from '@cartago-git/mcp-docs';
import depsPlugin from '@cartago-git/mcp-deps';

const HERE = dirname(fileURLToPath(import.meta.url)); // apps/web/src
const ROOT = resolve(HERE, '..', '..', '..'); // repo root
const OUT_DIR = resolve(HERE, '..', 'dist'); // apps/web/dist
const PLUGIN_LIST =
	'proposals,rules,memory,git,quality,search,notification,docs,deps';
const PLUGINS: Record<string, unknown> = {
	'mcp-proposals': proposalsPlugin,
	'mcp-rules': rulesPlugin,
	'mcp-memory': memoryPlugin,
	'mcp-git': gitPlugin,
	'mcp-quality': qualityPlugin,
	'mcp-search': searchPlugin,
	'mcp-notification': notificationPlugin,
	'mcp-docs': docsPlugin,
	'mcp-deps': depsPlugin,
};

interface ITool {
	readonly name: string;
	readonly description: string;
}

const collectTools = async (): Promise<ITool[]> => {
	const workspace = mkdtempSync(join(tmpdir(), 'mcp-site-'));
	try {
		const args = parseCliArgs(
			[`--plugins=${PLUGIN_LIST}`, `--workspace=${workspace}`],
			workspace
		);
		const { config } = await assembleCliConfig(args, {
			import: async (specifier: string) => {
				const hit = Object.entries(PLUGINS).find(([k]) =>
					specifier.includes(k)
				);
				return { default: hit ? hit[1] : undefined };
			},
			readFile: () => undefined,
		});
		const assembled = await createMcpServer(config);
		const [ct, st] = InMemoryTransport.createLinkedPair();
		await assembled.server.connect(st);
		const client = new Client({ name: 'site', version: '0.0.0' }, { capabilities: {} });
		await client.connect(ct);
		const { tools } = await client.listTools();
		await client.close();
		await assembled.server.close();
		return tools
			.map((t) => ({ name: t.name, description: t.description ?? '' }))
			.sort((a, b) => a.name.localeCompare(b.name));
	} finally {
		rmSync(workspace, { recursive: true, force: true });
	}
};

const escapeHtml = (s: string): string =>
	s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');

const namespaceOf = (toolName: string): string =>
	toolName.includes('_') ? (toolName.split('_')[0] as string) : 'core';

const PRETTY_NS: Record<string, string> = {
	mcpcore: 'Core (orientation, scaffold, metrics)',
	proposals: 'proposals — multi-agent coordination',
	git: 'git — read-only repository inspection',
	memory: 'memory — durable notes (secret-redacted, TTL)',
	search: 'search — grep / regex / globs',
	rules: 'rules — framework lint & conventions',
	quality: 'quality — run quality gates',
	docs: 'docs — project documentation',
	deps: 'deps — dependency inventory & health',
	notification: 'notification — lock-release watcher',
	core: 'Core',
};

const renderHtml = (tools: ITool[], version: string): string => {
	const groups = new Map<string, ITool[]>();
	for (const tool of tools) {
		const ns = namespaceOf(tool.name);
		const list = groups.get(ns) ?? [];
		list.push(tool);
		groups.set(ns, list);
	}
	const sections = [...groups.entries()]
		.sort((a, b) => a[0].localeCompare(b[0]))
		.map(([ns, list]) => {
			const cards = list
				.map(
					(t) => `        <article class="tool">
          <h3><code>${escapeHtml(t.name)}</code></h3>
          <p>${escapeHtml(t.description) || '<em class="warn">⚠ sin descripción</em>'}</p>
        </article>`
				)
				.join('\n');
			return `      <section class="group">
        <h2>${escapeHtml(PRETTY_NS[ns] ?? ns)} <span class="count">${list.length}</span></h2>
${cards}
      </section>`;
		})
		.join('\n');

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>@cartago-git/mcp-core — agnostic MCP server core</title>
<style>
  :root { --bg:#0d1117; --card:#161b22; --line:#30363d; --fg:#e6edf3; --muted:#8b949e; --accent:#58a6ff; }
  * { box-sizing: border-box; }
  body { margin:0; font:16px/1.6 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif; background:var(--bg); color:var(--fg); }
  a { color:var(--accent); }
  header { padding:4rem 1.5rem 2rem; text-align:center; border-bottom:1px solid var(--line); background:radial-gradient(60% 120% at 50% 0%, #1f6feb22, transparent); }
  header h1 { font-size:2.4rem; margin:0 0 .5rem; }
  header p { color:var(--muted); max-width:46rem; margin:.4rem auto; }
  .badges code { background:var(--card); border:1px solid var(--line); border-radius:6px; padding:.15rem .45rem; }
  main { max-width:64rem; margin:0 auto; padding:2rem 1.5rem 5rem; }
  h2 { margin-top:2.5rem; border-bottom:1px solid var(--line); padding-bottom:.4rem; }
  .count { color:var(--muted); font-size:.9rem; font-weight:400; }
  pre { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:1rem; overflow:auto; }
  .tools, .group { display:block; }
  .group { margin-bottom:1rem; }
  .tool { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:.8rem 1rem; margin:.6rem 0; }
  .tool h3 { margin:0 0 .3rem; font-size:1rem; }
  .tool code { color:var(--accent); }
  .tool p { margin:0; color:var(--fg); }
  .warn { color:#d29922; }
  footer { text-align:center; color:var(--muted); padding:2rem; border-top:1px solid var(--line); }
</style>
</head>
<body>
<header>
  <h1>@cartago-git/mcp-core</h1>
  <p>A project-agnostic <strong>Model Context Protocol</strong> server core + CLI plugin loader. The core knows nothing about your domain; capabilities ship as plugins you load on demand.</p>
  <p class="badges">v${escapeHtml(version)} · ${tools.length} tools · BSD-3-Clause</p>
</header>
<main>
  <h2>Install &amp; run</h2>
  <p>Add it and point your MCP client at the <code>mcp-core</code> binary (runs under Node, Deno or bun):</p>
  <pre><code>bun add @cartago-git/mcp-core</code></pre>
  <p>Then in your <code>mcp.json</code>:</p>
  <pre><code>{
  "servers": {
    "mcp-core": {
      "command": "bunx",
      "args": ["@cartago-git/mcp-core", "--plugins=${PLUGIN_LIST}"]
    }
  }
}</code></pre>
  <p>Pick only the plugins you need (or a preset: <code>--preset=minimal|standard|swarm</code>). Run <code>mcp-core --check</code> to self-diagnose.</p>

  <h2>Tools <span class="count">${tools.length} total</span></h2>
  <p>Every tool exposed by the full plugin set, grouped by namespace:</p>
${sections}
</main>
<footer>
  Generated from the live tool registry · <a href="https://github.com/CartagoGit/mcp-core">github.com/CartagoGit/mcp-core</a>
</footer>
</body>
</html>
`;
};

/** Enumerate the published packages and their (lockstep) versions. */
const collectPackages = (): Array<{ name: string; version: string }> => {
	const out: Array<{ name: string; version: string }> = [];
	for (const group of ['packages', 'plugins']) {
		for (const dir of readdirSync(join(ROOT, group))) {
			const pkgPath = join(ROOT, group, dir, 'package.json');
			try {
				const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
					name?: string;
					version?: string;
				};
				if (pkg.name && pkg.version) out.push({ name: pkg.name, version: pkg.version });
			} catch {
				// not a package dir
			}
		}
	}
	return out.sort((a, b) => a.name.localeCompare(b.name));
};

const main = async (): Promise<void> => {
	const strict = process.argv.includes('--strict');
	const version = (
		await import(join(ROOT, 'packages/core/package.json'), {
			with: { type: 'json' },
		})
	).default.version as string;

	const tools = await collectTools();
	const undocumented = tools.filter((t) => t.description.trim().length === 0);
	if (undocumented.length > 0) {
		const names = undocumented.map((t) => t.name).join(', ');
		const msg = `${undocumented.length} tool(s) without a description: ${names}`;
		if (strict) {
			console.error(`✖ build-site (strict): ${msg}`);
			process.exit(1);
		}
		console.warn(`⚠ build-site: ${msg} — document them (their tool description).`);
	}

	// Machine-readable manifest of what THIS release ships (kept in sync with
	// mcp-core + plugins because it is harvested from the live registry).
	const packages = collectPackages();
	const capabilities = {
		generatedAt: new Date().toISOString(),
		coreVersion: version,
		counts: { tools: tools.length, packages: packages.length },
		packages,
		tools: tools.map((t) => ({
			name: t.name,
			namespace: namespaceOf(t.name),
			description: t.description,
		})),
	};

	mkdirSync(OUT_DIR, { recursive: true });
	writeFileSync(join(OUT_DIR, 'index.html'), renderHtml(tools, version));
	writeFileSync(join(OUT_DIR, 'capabilities.json'), `${JSON.stringify(capabilities, null, 2)}\n`);
	// `.nojekyll` so GitHub Pages serves the files as-is.
	writeFileSync(join(OUT_DIR, '.nojekyll'), '');
	console.log(
		`apps/web/dist written — ${tools.length} tools, ${packages.length} packages, ${undocumented.length} undocumented.`
	);
};

void main();
