// mcp-evidence-rules: declarative table for "which file / dep
// signals the project already has an MCP server?".
//
// SOLID — Open/Closed. The previous `detectMcp` was a 3-source
// inline aggregator in `analyze-project.ts`: deps, mcp.json paths,
// server.ts paths. Adding a new evidence kind (e.g. a corporate
// `.corp-mcp` marker file) meant editing that body. The table
// form lets you add an evidence kind by appending one entry.
//
// SOLID — Single Responsibility. This module owns ONE thing: the
// "MCP server present" detection policy. The matcher is pure
// pipeline and returns the structured `{ has, evidence }` pair
// the rest of the analyser consumes.
//
// SOLID — Dependency Inversion. Hosts inject their own rule list.

import type { IFileReader } from './analyze-project';

export type IMcpEvidenceKind =
	| { readonly kind: 'has-dep'; readonly depName: string }
	| { readonly kind: 'any-exists'; readonly paths: readonly string[] };

export interface IMcpEvidenceRule {
	/** Stable id used in the evidence strings (e.g. `mcp.json`). */
	readonly id: string;
	readonly priority: number;
	readonly evidence: IMcpEvidenceKind;
	/** Human-readable prefix emitted into the `evidence` list. */
	readonly summaryPrefix: string;
}

export const DEFAULT_MCP_EVIDENCE_RULES: readonly IMcpEvidenceRule[] = [
	{
		id: 'sdk-dep',
		priority: 100,
		evidence: { kind: 'has-dep', depName: '@modelcontextprotocol/sdk' },
		summaryPrefix: 'depends on @modelcontextprotocol/sdk',
	},
	{
		id: 'vscode-mcp-json',
		priority: 80,
		evidence: {
			kind: 'any-exists',
			paths: ['.vscode/mcp.json', 'mcp.json', '.cursor/mcp.json'],
		},
		summaryPrefix: 'found',
	},
	{
		id: 'mcp-server-ts',
		priority: 60,
		evidence: {
			kind: 'any-exists',
			paths: ['src/server.ts', 'src/mcp-server.ts', 'server.ts'],
		},
		summaryPrefix: 'found',
	},
];

export interface IMcpEvidence {
	readonly has: boolean;
	readonly evidence: readonly string[];
}

const EMPTY_RESULT: IMcpEvidence = Object.freeze({
	has: false,
	evidence: Object.freeze([]),
});

const findHit = async (
	reader: IFileReader,
	rule: IMcpEvidenceRule,
): Promise<string | undefined> => {
	if (rule.evidence.kind !== 'any-exists') return undefined;
	for (const path of rule.evidence.paths) {
		if (await reader.exists(path)) return path;
	}
	return undefined;
};

export const detectMcpEvidence = async (
	reader: IFileReader,
	deps: Readonly<Record<string, string>>,
	rules: readonly IMcpEvidenceRule[] = DEFAULT_MCP_EVIDENCE_RULES,
): Promise<IMcpEvidence> => {
	const sorted = [...rules].sort((a, b) => b.priority - a.priority);
	const evidence: string[] = [];
	for (const rule of sorted) {
		if (rule.evidence.kind === 'has-dep') {
			if (rule.evidence.depName in deps) {
				evidence.push(rule.summaryPrefix);
			}
		} else {
			const hit = await findHit(reader, rule);
			if (hit !== undefined) {
				evidence.push(`${rule.summaryPrefix} ${hit}`);
			}
		}
	}
	if (evidence.length === 0) return EMPTY_RESULT;
	return { has: true, evidence: Object.freeze(evidence) };
};
