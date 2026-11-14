/**
 * roadmap-agnosticism.spec.ts — the roadmap plugin on projects that are
 * not this repository: other branch names, one branch only, or no
 * roadmap at all.
 *
 * Each project is assembled as a host assembles it and spoken to by a
 * real MCP client that has listed the tools first, so every structured
 * answer — errors included — is checked against the listed output schema.
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
import { join } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it } from 'vitest';

import { assembleCliConfig } from '@delendai/core/lib/cli/assemble';
import { parseCliArgs } from '@delendai/core/lib/plugins/parse-cli-args';
import { createMcpProject } from '@delendai/core/lib/project/create-mcp-project';
import roadmapPlugin from '@delendai/roadmap';

/**
 * What the plugin's seven tools may cost a host in its tool listing: the
 * hard cap its manifest declares (measured here at 10,222 B).
 */
const LISTING_BYTES_CEILING = 11_500;

const closers: (() => Promise<void>)[] = [];

afterEach(async () => {
	for (const close of closers.splice(0)) await close();
});

/** A project with `config` as its `delendai.config.json`, and a client on it. */
const project = async (config: Record<string, unknown>) => {
	const workspace = mkdtempSync(join(tmpdir(), 'roadmap-agnostic-'));
	writeFileSync(
		join(workspace, 'delendai.config.json'),
		JSON.stringify(config),
	);
	const args = parseCliArgs(
		['--plugins=roadmap', `--workspace=${workspace}`, '--surface=native'],
		workspace,
	);
	const assembled = await assembleCliConfig(args, {
		import: async () => ({ default: roadmapPlugin }),
		readFile: async (abs: string) =>
			existsSync(abs) ? readFileSync(abs, 'utf8') : undefined,
	});
	const served = await createMcpProject(assembled.config);
	const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
	await served.server.connect(serverSide);
	const client = new Client(
		{ name: 'roadmap-spec', version: '0' },
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
	const roadmapTools = tools.filter((tool) => tool.name.includes('roadmap_'));
	const nameOf = (suffix: string): string =>
		roadmapTools.find((tool) => tool.name.endsWith(`roadmap_${suffix}`))
			?.name ?? `missing roadmap_${suffix}`;
	return {
		workspace,
		roadmapTools,
		loadErrors: assembled.loadResult.errors,
		ask: async (suffix: string, input: Record<string, unknown> = {}) => {
			const result = await client.callTool({
				name: nameOf(suffix),
				arguments: input,
			});
			const text =
				(result.content as { text: string }[])[0]?.text ?? '{}';
			return {
				isError: result.isError === true,
				body: JSON.parse(text) as Record<string, unknown>,
			};
		},
	};
};

const roadmapOptions = {
	roadmap: {
		options: { file: 'plan/ROADMAP.md', versionFile: 'version.json' },
	},
};

describe('e2e: the roadmap on a project with its own branch names', () => {
	it('runs the whole cycle between trunk and release/2.x', async () => {
		const acme = await project({
			development: {
				branches: { integration: 'trunk', release: 'release/2.x' },
			},
			plugins: roadmapOptions,
		});
		expect(acme.loadErrors).toEqual([]);
		expect(acme.roadmapTools).toHaveLength(7);
		for (const tool of acme.roadmapTools) {
			expect(tool.outputSchema).toBeDefined();
		}
		expect(JSON.stringify(acme.roadmapTools).length).toBeLessThan(
			LISTING_BYTES_CEILING,
		);
		writeFileSync(
			join(acme.workspace, 'version.json'),
			'{"version":"2.3.0"}',
		);

		const init = await acme.ask('plan_init', {
			version: '2.4.0',
			reason: 'what 2.4 promises',
			entries: [
				{
					id: 'export',
					title: 'CSV export',
					kind: 'feature',
					state: 'in-progress',
					gates: [{ kind: 'path-exists', target: 'src/export.ts' }],
				},
			],
		});
		expect(init.body).toMatchObject({ ok: true, version: '2.4.0' });
		expect((await acme.ask('show')).body.file).toBe('plan/ROADMAP.md');
		expect((await acme.ask('readiness')).body).toMatchObject({
			horizons: [{ version: '2.4.0', status: 'not-ready' }],
		});
		expect((await acme.ask('delta')).body).toMatchObject({
			horizons: [
				{ declared: ['export'], delivered: [], published: false },
			],
		});

		// Not on silence — and the refusal reaches a listing client whole.
		const refused = await acme.ask('plan_close', {
			entry: 'export',
			to: 'delivered',
		});
		expect(refused.isError).toBe(true);
		expect(refused.body).toMatchObject({
			ok: false,
			error: { code: 'reason-required' },
		});

		mkdirSync(join(acme.workspace, 'src'), { recursive: true });
		writeFileSync(join(acme.workspace, 'src', 'export.ts'), 'export {};\n');
		expect(
			(await acme.ask('plan_close', { entry: 'export', to: 'delivered' }))
				.body,
		).toMatchObject({ ok: true, from: 'in-progress', to: 'delivered' });

		const promotion = await acme.ask('promotion');
		expect(promotion.body).toMatchObject({
			from: 'trunk',
			to: 'release/2.x',
			promotable: true,
			readiness: { version: '2.4.0', status: 'ready' },
		});
		expect(String(promotion.body.nextAction)).toContain(
			'from trunk into release/2.x',
		);
		expect((await acme.ask('sync')).body).toMatchObject({ inSync: true });
	});
});

describe('e2e: the roadmap on a project with one branch', () => {
	it('works, and says there is nothing to promote', async () => {
		const solo = await project({
			development: { branches: { integration: 'stable' } },
			plugins: roadmapOptions,
		});
		expect(solo.loadErrors).toEqual([]);
		await solo.ask('plan_init', { version: '1.0.0', reason: 'first' });
		const promotion = await solo.ask('promotion');
		expect(promotion.isError).toBe(false);
		expect(promotion.body).toMatchObject({
			from: 'stable',
			to: 'stable',
			promotable: false,
		});
	});
});

describe('e2e: a project that declares no roadmap', () => {
	it('gets no roadmap tool and no diagnostic', async () => {
		const plain = await project({});
		expect(plain.roadmapTools).toEqual([]);
		expect(plain.loadErrors).toEqual([]);
	});
});
