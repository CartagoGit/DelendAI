import type { McpVertexToolOutputs } from '@mcp-vertex/core/public';

import type { McpStdioClient } from '../transport/mcp-stdio-client';
import type {
	IKnowledgeEntry,
	IKnowledgeSummary,
} from '../contracts/interfaces/tool-descriptor.interface';

type IKnowledgeOutput = McpVertexToolOutputs['mcp-vertex_knowledge'];

export class KnowledgeNotFoundError extends Error {
	constructor(readonly id: string) {
		super(`MCP knowledge entry "${id}" was not returned by the server`);
		this.name = 'KnowledgeNotFoundError';
	}
}

export type IKnowledgeListEntry = IKnowledgeSummary;
export type IKnowledgeFullEntry = IKnowledgeEntry;

/**
 * Heuristic category derived from the entry id. Server entries
 * follow a `<plugin>_<topic>_<subtopic?>` naming convention where
 * the plugin name is the part before the first `_` (plugin names
 * use `-`, topics use `_`). The category is just the plugin.
 * Entries that don't contain `_` fall back to `other`.
 */
export const categoryOf = (id: string): string => {
	const ix = id.indexOf('_');
	if (ix < 0) return 'other';
	return id.slice(0, ix);
};

export class KnowledgeService {
	constructor(private readonly client: McpStdioClient) {}

	async listKnowledge(): Promise<readonly IKnowledgeListEntry[]> {
		const output = await this.client.request<
			Record<string, never>,
			IKnowledgeOutput
		>('mcp-vertex_knowledge', {});
		return output.entries ?? [];
	}

	async listByCategory(): Promise<
		Readonly<Record<string, readonly IKnowledgeListEntry[]>>
	> {
		const entries = await this.listKnowledge();
		const out: Record<string, IKnowledgeListEntry[]> = {};
		for (const e of entries) {
			const cat = categoryOf(e.id);
			const bucket = out[cat] ?? [];
			bucket.push(e);
			out[cat] = bucket;
		}
		for (const cat of Object.keys(out)) {
			out[cat]?.sort((a, b) => a.title.localeCompare(b.title));
		}
		return out;
	}

	filterByQuery(
		entries: readonly IKnowledgeListEntry[],
		query: string,
		limit = 50,
	): readonly IKnowledgeListEntry[] {
		const q = query.trim().toLowerCase();
		if (q.length === 0) return entries.slice(0, limit);
		const scored: { entry: IKnowledgeListEntry; score: number }[] = [];
		for (const e of entries) {
			const id = e.id.toLowerCase();
			const title = e.title.toLowerCase();
			if (id === q || title === q) {
				scored.push({ entry: e, score: 100 });
				continue;
			}
			if (id.startsWith(q) || title.startsWith(q)) {
				scored.push({ entry: e, score: 60 });
				continue;
			}
			if (id.includes(q) || title.includes(q)) {
				scored.push({ entry: e, score: 40 });
			}
		}
		scored.sort((a, b) => b.score - a.score);
		return scored.slice(0, limit).map((s) => s.entry);
	}

	async getKnowledge(id: string): Promise<IKnowledgeFullEntry> {
		const output = await this.client.request<
			{ id: string },
			IKnowledgeOutput
		>('mcp-vertex_knowledge', { id });
		if (
			output.id === undefined ||
			output.title === undefined ||
			output.body === undefined
		) {
			throw new KnowledgeNotFoundError(id);
		}
		return {
			id: output.id,
			title: output.title,
			body: output.body,
		};
	}
}
