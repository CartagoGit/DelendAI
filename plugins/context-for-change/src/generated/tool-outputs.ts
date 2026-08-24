/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Typed `structuredContent` shapes for this package's MCP tools,
 * generated from each tool's Zod `outputSchema` by:
 *
 *     bun run types:generate
 *
 * The current harvest pipeline groups root tools by the runtime
 * namespace prefix, so this package keeps its local generated module
 * in sync with the core SDK output until the upstream router emits
 * per-plugin modules directly.
 */

export interface ContextForChangeContextForChangeOutput {
	dependsOn: string[];
	files: string[];
	sections: {
		source:
			| 'git'
			| 'symbols'
			| 'references'
			| 'tests'
			| 'docs'
			| 'conventions'
			| 'test-policy'
			| 'memory';
		summary: string;
	}[];
	bytes: number;
	truncated: boolean;
	originalBytes?: number;
}

/** Map of this package's MCP tool names to their `structuredContent` type. */
export interface ContextForChangeToolOutputs {
	"context-for-change_context_for_change": ContextForChangeContextForChangeOutput;
}