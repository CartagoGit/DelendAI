/**
 * style-convention-over-mcp.spec.ts — the style tools on a project that
 * is not this repository, assembled as a host assembles it and spoken to
 * by a listing MCP client.
 */
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it } from 'vitest';

import { assembleCliConfig } from '@delendai/core/lib/cli/assemble';
import { parseCliArgs } from '@delendai/core/lib/plugins/parse-cli-args';
import { createMcpProject } from '@delendai/core/lib/project/create-mcp-project';
import stylePlugin from '@delendai/style-convention';

/** The hard cap the plugin's manifest declares for its tool listing (measured: 3,493 B). */
const LISTING_BYTES_CEILING = 4_200;

const closers: (() => Promise<void>)[] = [];

afterEach(async () => {
	for (const close of closers.splice(0)) await close();
});

const project = async (
	config: Record<string, unknown>,
	files: Record<string, string> = {},
) => {
	const workspace = mkdtempSync(join(tmpdir(), 'style-mcp-'));
	for (const [path, content] of Object.entries({
		...files,
		'delendai.config.json': JSON.stringify(config),
	})) {
		mkdirSync(dirname(join(workspace, path)), { recursive: true });
		writeFileSync(join(workspace, path), content);
	}
	const args = parseCliArgs(
		[
			'--plugins=style-convention',
			`--workspace=${workspace}`,
			'--surface=native',
		],
		workspace,
	);
	const assembled = await assembleCliConfig(args, {
		import: async () => ({ default: stylePlugin }),
		readFile: async (abs: string) =>
			existsSync(abs) ? readFileSync(abs, 'utf8') : undefined,
	});
	const served = await createMcpProject(assembled.config);
	const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
	await served.server.connect(serverSide);
	const client = new Client(
		{ name: 'style-spec', version: '0' },
		{ capabilities: {} },
	);
	await client.connect(clientSide);
	closers.push(async () => {
		await client.close();
		await served.server.close();
		await served.dispose();
		rmSync(workspace, { recursive: true, force: true });
	});
	const { tools } = await client.listTools();
	const styleTools = tools.filter((tool) => tool.name.includes('_style_'));
	return {
		styleTools,
		loadErrors: assembled.loadResult.errors,
		ask: async (suffix: string, input: Record<string, unknown> = {}) => {
			const name =
				styleTools.find((tool) =>
					tool.name.endsWith(`_style_${suffix}`),
				)?.name ?? `missing style_${suffix}`;
			const result = await client.callTool({ name, arguments: input });
			const text =
				(result.content as { text: string }[])[0]?.text ?? '{}';
			return {
				isError: result.isError === true,
				body: JSON.parse(text) as Record<string, unknown>,
			};
		},
	};
};

const FILES = {
	'web/shared/styles/tokens.scss': ':root {\n\t--brand: #2563eb;\n}\n',
	'web/shared/styles/button.scss':
		'.ui-button {\n\tcolor: var(--brand);\n}\n',
	'web/site/pages/home.astro':
		'<main class="page-home"><button class="ui-button">Go</button></main>\n',
	'web/shared/Bar.astro': '<nav><button class="ui-button">x</button></nav>\n',
	'web/site/legacy/old.css': '.ui-old { color: #2563eb; }\n',
};

const CONFIG = {
	plugins: {
		'style-convention': {
			options: {
				styleRoots: ['web/shared/styles', 'web/site'],
				markupRoots: ['web'],
				overrides: [
					{
						glob: 'web/site/legacy/**',
						architecture: 'legacy-global',
					},
				],
				layers: [
					{
						name: 'shared',
						glob: 'web/shared/**',
						prefixes: ['ui-'],
					},
					{ name: 'site', glob: 'web/site/**', prefixes: ['page-'] },
				],
				tokenFiles: ['web/shared/styles/tokens.scss'],
			},
		},
	},
};

describe('e2e: the style tools on a project of its own', () => {
	it('lists three read-only tools within their byte ceiling', async () => {
		const acme = await project(CONFIG, FILES);
		expect(acme.loadErrors).toEqual([]);
		expect(
			acme.styleTools
				.map((tool) => tool.name.slice(tool.name.indexOf('style_')))
				.sort(),
		).toEqual(['style_check', 'style_impact', 'style_profile']);
		for (const tool of acme.styleTools) {
			expect(tool.outputSchema).toBeDefined();
		}
		expect(JSON.stringify(acme.styleTools).length).toBeLessThan(
			LISTING_BYTES_CEILING,
		);
	});

	it('names every surface that consumes a shared selector, across packages', async () => {
		const acme = await project(CONFIG, FILES);
		const impact = await acme.ask('impact', { selector: 'ui-button' });
		expect(impact.body).toMatchObject({
			impacts: [
				{
					selector: 'ui-button',
					consumers: [
						{
							path: 'web/shared/Bar.astro',
							crossesBoundary: false,
						},
						{
							path: 'web/site/pages/home.astro',
							crossesBoundary: true,
						},
					],
					crossBoundary: 1,
				},
			],
		});
		const missing = await acme.ask('impact', { selector: 'nope' });
		expect(missing.isError).toBe(true);
		expect(missing.body).toMatchObject({
			error: { code: 'unknown-selector' },
		});
	});

	it('refuses a hard-coded value a design token names, and names the token', async () => {
		const acme = await project(CONFIG, FILES);
		const checked = await acme.ask('check', {
			file: 'web/site/pages/hero.scss',
			content:
				'.page-hero {\n\tcolor: #2563EB;\n}\n.ui-card { margin: 4px; }\n',
		});
		expect(checked.body.clean).toBe(false);
		const kinds = (
			checked.body.findings as { kind: string; message: string }[]
		)
			.map((finding) => finding.kind)
			.sort();
		expect(kinds).toEqual(['foreign-selector', 'literal-has-token']);
		expect(JSON.stringify(checked.body.findings)).toContain('--brand');
	});

	it('gives a folder declared legacy-global no finding, and says what applies there', async () => {
		const acme = await project(CONFIG, FILES);
		const legacy = await acme.ask('check', {
			file: 'web/site/legacy/old.css',
		});
		expect(legacy.body).toMatchObject({
			clean: true,
			architecture: 'legacy-global',
			findings: [],
		});
		const profile = await acme.ask('profile', {
			path: 'web/site/legacy/old.css',
		});
		expect(profile.body).toMatchObject({
			architecture: 'scss-bem',
			tokens: 1,
			at: { architecture: 'legacy-global', layer: 'site' },
		});
		expect(
			(await acme.ask('check', { file: 'web/nowhere.scss' })).body,
		).toMatchObject({ error: { code: 'unreadable-file' } });
	});
});

describe('e2e: a project that declares no styles', () => {
	it('gets no style tool and no diagnostic', async () => {
		const plain = await project({});
		expect(plain.styleTools).toEqual([]);
		expect(plain.loadErrors).toEqual([]);
	});
});
