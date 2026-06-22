/**
 * `SearchService` — client wrapper around the `search_search` tool.
 * Adds two higher-level helpers that don't need a server round-trip:
 *
 * - `searchTools(query, tools)` — fuzzy-substring match over the live
 *   tool registry (returned by `OverviewService`).
 * - `searchKnowledge(query, entries)` — same idea over knowledge
 *   entries.
 *
 * Server-backed `search(query, opts)` is a thin pass-through to
 * `<prefix>_search`.
 */
import type { McpStdioClient } from '../transport/mcp-stdio-client';
import type {
	IKnowledgeHit,
	ISearchOptions,
	ISearchResult,
	IToolHit,
} from '../contracts/interfaces/search.interface';

const TOOL_SEARCH = 'search_search';

export class SearchService {
	constructor(private readonly client: McpStdioClient) {}

	async search(opts: ISearchOptions): Promise<ISearchResult> {
		return await this.client.request<ISearchOptions, ISearchResult>(
			TOOL_SEARCH,
			opts,
		);
	}

	/**
	 * Fuzzy-substring match over a list of tools. Returns at most
	 * `limit` hits sorted by score desc. Score = 100 for exact match
	 * on the name, 60 for prefix, 40 for substring, 20 for tag match.
	 */
	searchTools(
		query: string,
		tools: ReadonlyArray<{
			readonly name: string;
			readonly tags?: readonly string[];
			readonly summary?: string;
		}>,
		limit = 20,
	): readonly IToolHit[] {
		const q = query.trim().toLowerCase();
		if (q.length === 0) return [];
		const hits: IToolHit[] = [];
		for (const tool of tools) {
			const lower = tool.name.toLowerCase();
			const plugin = lower.split('_', 1)[0] ?? lower;
			if (lower === q) {
				hits.push({
					name: tool.name,
					plugin,
					score: 100,
					source: 'name',
				});
				continue;
			}
			if (lower.startsWith(q)) {
				hits.push({
					name: tool.name,
					plugin,
					score: 60,
					source: 'name',
				});
				continue;
			}
			if (lower.includes(q)) {
				hits.push({
					name: tool.name,
					plugin,
					score: 40,
					source: 'name',
				});
				continue;
			}
			if (tool.tags?.some((t) => t.toLowerCase().includes(q)) === true) {
				hits.push({
					name: tool.name,
					plugin,
					score: 20,
					source: 'tag',
				});
				continue;
			}
			if (tool.summary?.toLowerCase().includes(q) === true) {
				hits.push({
					name: tool.name,
					plugin,
					score: 10,
					source: 'description',
				});
			}
		}
		hits.sort((a, b) => b.score - a.score);
		return hits.slice(0, limit);
	}

	searchKnowledge(
		query: string,
		entries: ReadonlyArray<{
			readonly id: string;
			readonly title: string;
			readonly body?: string;
		}>,
		limit = 20,
	): readonly IKnowledgeHit[] {
		const q = query.trim().toLowerCase();
		if (q.length === 0) return [];
		const hits: IKnowledgeHit[] = [];
		for (const e of entries) {
			const id = e.id.toLowerCase();
			const title = e.title.toLowerCase();
			if (id === q || title === q) {
				hits.push({ id: e.id, title: e.title, score: 100 });
				continue;
			}
			if (id.startsWith(q) || title.startsWith(q)) {
				hits.push({ id: e.id, title: e.title, score: 60 });
				continue;
			}
			if (id.includes(q) || title.includes(q)) {
				hits.push({ id: e.id, title: e.title, score: 40 });
				continue;
			}
			if (e.body?.toLowerCase().includes(q) === true) {
				hits.push({ id: e.id, title: e.title, score: 20 });
			}
		}
		hits.sort((a, b) => b.score - a.score);
		return hits.slice(0, limit);
	}
}
