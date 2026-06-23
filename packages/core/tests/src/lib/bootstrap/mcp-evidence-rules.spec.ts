// mcp-evidence-rules.spec.ts: pin the SOLID MCP-evidence table.

import { describe, expect, it } from 'vitest';

import { analyzeProject } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import type { IFileReader } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import {
	DEFAULT_MCP_EVIDENCE_RULES,
	detectMcpEvidence,
} from '@mcp-vertex/core/lib/bootstrap/mcp-evidence-rules';

const reader = (files: Record<string, string>): IFileReader => ({
	readFile: (p) => files[p],
	exists: (p) => p in files,
	listDir: () => [],
});

describe('DEFAULT_MCP_EVIDENCE_RULES (declarative table)', () => {
	it('lists the three built-in evidence kinds (sdk dep, mcp.json, server.ts)', () => {
		const ids = DEFAULT_MCP_EVIDENCE_RULES.map((r) => r.id);
		expect(ids).toEqual(['sdk-dep', 'vscode-mcp-json', 'mcp-server-ts']);
	});
	it('sdk-dep outranks the file-based rules (deps are the strongest signal)', () => {
		const sdk = DEFAULT_MCP_EVIDENCE_RULES.find((r) => r.id === 'sdk-dep');
		const mcpJson = DEFAULT_MCP_EVIDENCE_RULES.find(
			(r) => r.id === 'vscode-mcp-json',
		);
		expect(sdk?.priority).toBeGreaterThan(mcpJson?.priority ?? 0);
	});
});

describe('detectMcpEvidence', () => {
	it('returns has=false + empty evidence when no signal is present', () => {
		const result = detectMcpEvidence(reader({}), {});
		expect(result.has).toBe(false);
		expect(result.evidence).toEqual([]);
	});
	it('detects the SDK dep as evidence', () => {
		const result = detectMcpEvidence(reader({}), {
			'@modelcontextprotocol/sdk': '^1',
		});
		expect(result.has).toBe(true);
		expect(result.evidence).toContain(
			'depends on @modelcontextprotocol/sdk',
		);
	});
	it('detects .vscode/mcp.json', () => {
		const result = detectMcpEvidence(
			reader({ '.vscode/mcp.json': '{}' }),
			{},
		);
		expect(result.has).toBe(true);
		expect(result.evidence).toContain('found .vscode/mcp.json');
	});
	it('detects src/server.ts', () => {
		const result = detectMcpEvidence(reader({ 'src/server.ts': '' }), {});
		expect(result.has).toBe(true);
		expect(result.evidence).toContain('found src/server.ts');
	});
	it('accumulates all matches (sdk + mcp.json + server.ts)', () => {
		const result = detectMcpEvidence(
			reader({
				'.vscode/mcp.json': '{}',
				'src/server.ts': '',
			}),
			{ '@modelcontextprotocol/sdk': '^1' },
		);
		expect(result.has).toBe(true);
		expect(result.evidence).toEqual([
			'depends on @modelcontextprotocol/sdk',
			'found .vscode/mcp.json',
			'found src/server.ts',
		]);
	});
});

describe('integration: detectMcp uses the rule table', () => {
	it('analyzer picks up the SDK dep evidence correctly', () => {
		const analysis = analyzeProject(
			reader({
				'package.json': JSON.stringify({
					name: 'svc',
					dependencies: { '@modelcontextprotocol/sdk': '^1' },
				}),
			}),
		);
		expect(analysis.hasMcpProject).toBe(true);
		expect(analysis.mcpEvidence).toContain(
			'depends on @modelcontextprotocol/sdk',
		);
	});
});
