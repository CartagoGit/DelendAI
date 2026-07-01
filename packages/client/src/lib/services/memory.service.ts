import type { McpStdioClient } from '../transport/mcp-stdio-client';
import type {
	IMemoryEntry,
	IMemoryForgetResult,
	IMemoryListOptions,
	IMemoryListResult,
	IMemoryRecallOptions,
	IMemorySaveInput,
	IMemorySaveResult,
} from '../contracts/interfaces/memory.interface';

const MEMORY_LIST = 'mcp-vertex_memory_list';
const MEMORY_RECALL = 'mcp-vertex_memory_recall';
const MEMORY_SAVE = 'mcp-vertex_memory_save';
const MEMORY_FORGET = 'mcp-vertex_memory_forget';

export class MemoryService {
	constructor(private readonly client: McpStdioClient) {}

	async list(options: IMemoryListOptions = {}): Promise<IMemoryListResult> {
		return await this.client.request<IMemoryListOptions, IMemoryListResult>(
			MEMORY_LIST,
			options,
		);
	}

	async recall(
		options: IMemoryRecallOptions = {},
	): Promise<readonly IMemoryEntry[]> {
		const result = await this.client.request<
			IMemoryRecallOptions,
			{ readonly notes: readonly IMemoryEntry[] }
		>(MEMORY_RECALL, options);
		return result.notes;
	}

	async save(input: IMemorySaveInput): Promise<IMemorySaveResult> {
		return await this.client.request<IMemorySaveInput, IMemorySaveResult>(
			MEMORY_SAVE,
			input,
		);
	}

	async forget(id: string): Promise<IMemoryForgetResult> {
		return await this.client.request<
			{ readonly id: string },
			IMemoryForgetResult
		>(MEMORY_FORGET, { id });
	}
}
