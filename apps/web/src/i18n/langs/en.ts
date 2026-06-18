import type { LangDict } from '../shared';

const dict: LangDict = {
	nav: {
		concept: 'Concept',
		install: 'Install',
		tools: 'Tools',
		benchmarks: 'Benchmarks',
		plugins: 'Plugins',
		github: 'GitHub',
		menu: 'Menu',
		knowledge: 'Knowledge',
		prompts: 'Prompts',
		resources: 'Resources',
		skills: 'Skills',
	},
	hero: {
		title: { a: 'The agnostic ', b: 'MCP Vertex', c: '' },
		subheader: 'An MCP server core + plugin loader for any project.',
		tagline:
			'A project-agnostic Model Context Protocol server core. The core knows nothing about your domain — capabilities ship as plugins you load on demand, all measured for low token cost.',
		ctaInstall: 'Get started',
		ctaTools: 'Browse the tools',
		runsOn: 'Runs under Node, Deno & bun · any package manager',
	},
	marquee: {
		runtimes: 'Built with · runs under',
		clients: 'MCP clients & models',
	},
	concept: {
		title: 'One small core, many plugins',
		body: 'mcp-vertex is the hermetic core: deterministic tool registration, injected workspace paths, a CLI plugin loader and a token-measured tool surface. Everything domain-specific is a plugin — load only what you need, under any host or model.',
		f1: {
			t: 'Project-agnostic',
			b: 'No domain code in the core. The same plugin behaves identically under any host or model.',
		},
		f2: {
			t: 'Low-token by design',
			b: 'A single overview, lazy knowledge and compact JSON. A measured budget guards regressions in CI.',
		},
		f3: {
			t: 'Safe concurrency',
			b: 'Atomic writes, a cross-process mutex with ownership tokens, and corruption quarantine.',
		},
		f4: {
			t: 'Multi-agent ready',
			b: 'The proposals plugin coordinates a swarm: locks, a task queue, slice disjointness and push notifications.',
		},
	},
	install: {
		title: 'Install & run',
		lead: 'Add it and point your MCP client at the mcp-vertex binary:',
		verify: 'Verify it runs',
		addto: 'Add it to your IDE / agent',
		presets: 'Presets:',
		oneCmd: 'One command · any IDE',
		oneCmdNote:
			'Auto-detects your IDE and merges mcp-vertex in — it never touches your other MCP servers.',
		config: 'Pick a preset (minimal · standard · swarm) or list plugins explicitly. Run with --check to self-diagnose.',
		excludeHelp:
			'Subtract plugins from the resolved set with --exclude-plugins= (alias: --excludePlugins=). Useful to drop a plugin from a preset without forking it — e.g. --preset=swarm --exclude-plugins=notification for a single-agent session.',
	},
	tools: {
		title: 'Tools',
		lead: 'Every tool the full plugin set exposes, grouped by namespace — harvested from the live registry, so this page never drifts from the code.',
		count: 'tools',
		packages: 'packages',
	},
	bench: {
		title: 'Measured, not claimed',
		lead: 'Token efficiency is a guarded invariant — a CI test fails if these ceilings regress.',
		b1: {
			t: 'cold-start',
			b: 'overview (compact) + auto_work — full orientation under 300 tokens.',
		},
		b2: {
			t: 'no polling',
			b: 'lock-release is pushed (notification plugin), not polled in a loop.',
		},
		b3: {
			t: 'drift-guarded',
			b: 'a generated type SDK, token budgets and a strict e2e net over the real protocol.',
		},
		live: {
			title: 'Orientation cost · measured live',
			note: 'Tokens of the result text an agent sees (≈4 bytes/token), measured live over the protocol with proposals+memory. The baseline is an illustrative estimate of orienting by hand — not a measured third-party tool.',
		},
		baseline: 'without mcp-vertex (by hand · estimate)',
	},
	plugins: {
		title: 'Plugins',
		lead: 'The published packages. Load only what you need; the core stays tiny.',
	},
	cfg: {
		title: 'Settings',
		theme: 'Theme',
		language: 'Language',
		motion: 'Motion',
		motionLabel: 'Animate the marquees',
	},
	footer: {
		built: 'Generated from the live tool registry.',
		tagline: 'A project-agnostic MCP server core + plugin loader.',
		sections: 'Sections',
		resources: 'Resources',
	},
	pluginpage: { back: 'Back', tools: 'Tools', install: 'Install' },
	plugin: {
		proposals:
			'Multi-agent coordination: locks, task queue, slices, round-context, state repair.',
		git: 'Read-only repository inspection: status, changed files, diff, log.',
		memory: 'Durable cross-session notes with BM25 recall, quotas, TTL and secret redaction.',
		search: 'Low-token workspace search: substring or regex, glob include/exclude.',
		rules: 'Framework detection + lint/convention guidance, project config wins.',
		quality:
			'Run quality gates (lint/test/build) with allow/deny command policy; cancellable.',
		docs: 'Catalogue + read the project markdown docs, low-token curated navigation.',
		deps: 'Offline dependency inventory + health (lockfile, loose ranges, duplicates).',
		notification: 'Push lock-release events so agents stop polling.',
		'status-marker':
			'Mandatory coloured close marker for every agent response: 8 canonical states, helper + validator tools.',
		core: 'The agnostic core: overview, scaffold, metrics, doctor and the plugin loader.',
	},
	knowledge: {
		title: 'Knowledge',
		lead: 'Catalogued documents the core can answer questions about.',
		count: 'documents',
	},
	prompts: {
		title: 'Prompts',
		lead: 'Reusable prompt templates exposed by the core.',
		count: 'prompts',
		arg: 'arguments',
	},
	resources: {
		title: 'Resources',
		lead: 'Static resources bundled with the project (URI + MIME).',
		count: 'resources',
		uri: 'URI',
		mime: 'MIME',
	},
	skills: {
		title: 'Skills',
		lead: 'Domain playbooks the agent can load on demand.',
		count: 'skills',
		body: 'Body',
	},
	notFound: {
		code: '404',
		title: 'Page not found',
		lead: 'The page you are looking for does not exist or has moved. The core stays agnostic — even of broken URLs.',
		homeCta: 'Back to home',
		toolsCta: 'Browse the tools',
		homeAria: 'Go to home',
	},
};

export default dict;
