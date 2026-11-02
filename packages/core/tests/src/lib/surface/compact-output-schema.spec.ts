import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it } from 'vitest';

import { compactOutputSchema } from '@delendai/core/lib/surface/compact-output-schema.helper';
import { buildAgentCatalogToolRegistration } from '@delendai/core/lib/tools/agent-catalog-tool';
import { buildOverviewToolRegistration } from '@delendai/core/lib/tools/overview-tool';
import { buildAnalyzeToolRegistration } from '@delendai/core/lib/bootstrap/analyze-tool';
import { buildPlanToolRegistration } from '@delendai/core/lib/bootstrap/plan-tool';
import type { IFileReader } from '@delendai/core/lib/bootstrap/analyze-project';
import type { IToolRegistration } from '@delendai/core/lib/contracts/interfaces/tool-registration.interface';

/**
 * v00129 S1 (AUD-B01) regression pin. These five tools were the highest-
 * cost `outputSchema` declarations in the `dogfood` preset's `tools/list`
 * (agent_catalog, overview, analyze_project, plan_mcp_project — the top
 * `core`-owned offenders; `report_status` is pinned separately in
 * `plugins/error-reporting/tests`, one per its own package). Each now
 * declares the shared `compactOutputSchema()` instead of a deep nested
 * shape. This test fails the day any of them regrows a fat declared
 * schema — on purpose or by a careless merge — without anyone deciding
 * that on purpose. It does NOT assert anything about the real response
 * payload; that is covered by each tool's own behavioural specs.
 */

// additionalProperties + a boolean 'ok' — the empty envelope hint. A
// tool's declared outputSchema byte count should sit right at this
// baseline; a jump well past it means something got re-added.
const COMPACT_SCHEMA_CEILING_BYTES = 200;

const jsonSchemaBytesOf = (schema: unknown): number => {
	const candidate = schema as { toJSONSchema?: () => unknown };
	const json =
		typeof candidate?.toJSONSchema === 'function'
			? candidate.toJSONSchema()
			: schema;
	return Buffer.byteLength(JSON.stringify(json), 'utf8');
};

const capturedOutputSchema = async (
	registration: IToolRegistration,
): Promise<unknown> => {
	let outputSchema: unknown;
	const server = {
		registerTool: (_name: string, config: { outputSchema?: unknown }) => {
			outputSchema = config.outputSchema;
		},
	} as unknown as McpServer;
	await registration.register(server);
	if (outputSchema === undefined) {
		throw new Error('tool did not register an outputSchema');
	}
	return outputSchema;
};

const reader = (files: Record<string, string> = {}): IFileReader => ({
	readFile: async (path) => files[path],
	exists: async (path) => path in files,
	listDir: async () => [],
});

describe('v00129 S1 (AUD-B01): compactOutputSchema()', () => {
	it('is a minimal, permissive envelope hint', () => {
		const json = compactOutputSchema().toJSONSchema() as {
			type: string;
			properties: Record<string, unknown>;
			additionalProperties: unknown;
		};
		expect(json.type).toBe('object');
		expect(Object.keys(json.properties)).toEqual(['ok']);
		// `additionalProperties: {}` (Zod 4's `z.looseObject` rendering) is
		// JSON Schema's way of saying "any value is allowed" — the
		// permissive marker the audit asked for, not a boolean literal.
		expect(json.additionalProperties).toEqual({});
		expect(jsonSchemaBytesOf(compactOutputSchema())).toBeLessThanOrEqual(
			COMPACT_SCHEMA_CEILING_BYTES,
		);
	});

	it('agent_catalog declares the compact schema, not the full catalog snapshot', async () => {
		const registration = buildAgentCatalogToolRegistration('mcp', {
			sources: {
				tools: () => [],
				skills: () => [],
				proposals: () => [],
			},
			server: { name: 'mcp', version: '0.0.0', namespacePrefix: 'mcp' },
		});
		const schema = await capturedOutputSchema(registration);
		expect(jsonSchemaBytesOf(schema)).toBeLessThanOrEqual(
			COMPACT_SCHEMA_CEILING_BYTES,
		);
	});

	it('overview declares the compact schema, not the full snapshot union', async () => {
		const registration = buildOverviewToolRegistration('mcp', () => ({
			server: { name: 'mcp', version: '0.0.0' },
			namespacePrefix: 'mcp',
			workspaceRoot: '/tmp/workspace',
			corePaths: { cacheDir: '.cache', docsDir: 'docs' },
			plugins: [],
			tools: [],
			knowledge: [],
			recommendedNextAction: 'call overview',
		}));
		const schema = await capturedOutputSchema(registration);
		expect(jsonSchemaBytesOf(schema)).toBeLessThanOrEqual(
			COMPACT_SCHEMA_CEILING_BYTES,
		);
	});

	it('analyze_project declares the compact schema, not the full analysis+plan shape', async () => {
		const registration = buildAnalyzeToolRegistration({
			namespacePrefix: 'mcp',
			reader: reader(),
		});
		const schema = await capturedOutputSchema(registration);
		expect(jsonSchemaBytesOf(schema)).toBeLessThanOrEqual(
			COMPACT_SCHEMA_CEILING_BYTES,
		);
	});

	it('plan_mcp_project declares the compact schema, not the full blueprint+files shape', async () => {
		const registration = buildPlanToolRegistration({
			namespacePrefix: 'mcp',
			reader: reader(),
		});
		const schema = await capturedOutputSchema(registration);
		expect(jsonSchemaBytesOf(schema)).toBeLessThanOrEqual(
			COMPACT_SCHEMA_CEILING_BYTES,
		);
	});
});
