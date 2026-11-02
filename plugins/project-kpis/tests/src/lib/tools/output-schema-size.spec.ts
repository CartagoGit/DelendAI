import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, describe, expect, it } from 'vitest';

import {
	buildProjectKpisToolRegistrations,
	runProjectKpis,
} from '../../../../src/lib/tools/project-kpis.tool';
import {
	ProjectKpisEnvelopeSchema,
	ProjectKpisOutputSchema,
} from '../../../../src/lib/tools/project-kpis-output.schema';

/**
 * Re-read the live `tools/list` handler the same way
 * `plugins/usage-tracking/tests/session-surface-bytes.spec.ts` does: the
 * SDK rebuilds this handler on every `registerTool` call, and
 * `_requestHandlers` is private, so we go through a structural shape
 * instead of an unsafe cast.
 */
interface IToolsListHandlerMap {
	_requestHandlers?: Map<
		string,
		(
			request: unknown,
			extra: { sessionId?: string },
		) => Promise<{ tools: ReadonlyArray<Record<string, unknown>> }>
	>;
}
const asHandlerMap = (value: object): IToolsListHandlerMap => {
	const candidate = value as { [key: string]: unknown };
	const handlers = candidate._requestHandlers;
	return handlers instanceof Map ? { _requestHandlers: handlers } : {};
};

const createdRoots: string[] = [];

afterEach(async () => {
	for (const root of createdRoots.splice(0)) {
		await rm(root, { recursive: true, force: true });
	}
});

const setupEmptyWorkspace = async (): Promise<{
	root: string;
	cacheDir: string;
}> => {
	const root = await mkdtemp(join(tmpdir(), 'project-kpis-envelope-'));
	createdRoots.push(root);
	return { root, cacheDir: '.cache/delendai' };
};

describe('project_kpis outputSchema wire size', () => {
	it('registers the compact discovery envelope, not the full contract, as outputSchema', async () => {
		const { root, cacheDir } = await setupEmptyWorkspace();
		const server = new McpServer({ name: 'test', version: '0.0.0' });
		const registration = buildProjectKpisToolRegistrations({
			namespacePrefix: 'delendai',
			workspaceRootAbs: root,
			cacheDir,
			maxBytes: 12000,
			windowDays: 7,
			now: new Date('2026-08-29T12:00:00.000Z'),
		})[0]!;
		await registration.register(server);

		const listTools = asHandlerMap(
			server.server as object,
		)._requestHandlers?.get('tools/list');
		const result = await listTools?.(
			{ method: 'tools/list', params: {} },
			{ sessionId: 'session-1' },
		);
		const tool = result?.tools.find(
			(entry) => entry.name === 'delendai_project_kpis',
		);
		expect(tool).toBeDefined();
		expect(tool?.outputSchema).toBeDefined();

		const outputSchemaBytes = Buffer.byteLength(
			JSON.stringify(tool?.outputSchema),
			'utf8',
		);

		// Before this slice the full `ProjectKpisOutputSchema` cost 8,518
		// bytes as this tool's `outputSchema` — 86% of the tool's entire
		// 9,898-byte `tools/list` entry (see
		// docs/delendai/TOKEN-BUDGETS.md), spent describing an output
		// shape nobody had asked for yet. The envelope keeps only the
		// invariant frame (contract/version/view/detail/status/
		// generatedAt/summary/metrics[]/bytes/truncated/detailUri?/
		// nextCursor?) fully typed and describes every voluminous
		// per-view section as opaque `unknown` with a one-line pointer
		// back to the full contract. Measured size at the time this test
		// was written was 2,895 bytes; the ceiling below gives ~10%
		// headroom over that so it fails loudly the moment the envelope
		// quietly regrows a fully-typed section instead of pointing at
		// the real contract, without being so tight that harmless
		// description wording changes trip it.
		const CEILING_BYTES = 3200;
		expect(outputSchemaBytes).toBeGreaterThan(0);
		expect(outputSchemaBytes).toBeLessThanOrEqual(CEILING_BYTES);
	});
});

describe('envelope accepts every payload the full contract accepts', () => {
	it('parses a voluminous view (summary) under both schemas', async () => {
		const { root, cacheDir } = await setupEmptyWorkspace();
		const result = await runProjectKpis(
			{ view: 'summary', detail: 'compact' },
			{
				namespacePrefix: 'delendai',
				workspaceRootAbs: root,
				cacheDir,
				maxBytes: 12000,
				windowDays: 7,
				now: new Date('2026-08-29T12:00:00.000Z'),
			},
		);

		expect(() =>
			ProjectKpisOutputSchema.parse(result.structuredContent),
		).not.toThrow();
		expect(() =>
			ProjectKpisEnvelopeSchema.parse(result.structuredContent),
		).not.toThrow();
	});

	it('parses a second, differently-shaped view (audit) under both schemas', async () => {
		const { root, cacheDir } = await setupEmptyWorkspace();
		const result = await runProjectKpis(
			{ view: 'audit', detail: 'compact' },
			{
				namespacePrefix: 'delendai',
				workspaceRootAbs: root,
				cacheDir,
				maxBytes: 12000,
				windowDays: 7,
				now: new Date('2026-08-29T12:00:00.000Z'),
			},
		);

		expect(() =>
			ProjectKpisOutputSchema.parse(result.structuredContent),
		).not.toThrow();
		expect(() =>
			ProjectKpisEnvelopeSchema.parse(result.structuredContent),
		).not.toThrow();

		// audit has no natural display-metric-shaped value: honest empty
		// array, not an invented number.
		const full = ProjectKpisOutputSchema.parse(result.structuredContent);
		expect(full.metrics).toEqual([]);
	});

	it('parses a view with populated breakdowns (models) under both schemas', async () => {
		const { root, cacheDir } = await setupEmptyWorkspace();
		const result = await runProjectKpis(
			{ view: 'models', detail: 'compact' },
			{
				namespacePrefix: 'delendai',
				workspaceRootAbs: root,
				cacheDir,
				maxBytes: 12000,
				windowDays: 7,
				now: new Date('2026-08-29T12:00:00.000Z'),
			},
		);

		const full = ProjectKpisOutputSchema.parse(result.structuredContent);
		const envelope = ProjectKpisEnvelopeSchema.parse(
			result.structuredContent,
		);
		expect(full.view).toBe('models');
		expect(envelope.view).toBe('models');
		expect(envelope.metrics).toEqual(full.metrics);
	});
});
