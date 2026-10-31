/**
 * host-sampler.service.ts — the host's sampling, as the host-sampling
 * invoker asks for it.
 *
 * Only a client that declares the sampling capability is asked; one that
 * does not gives no sampler, which the invoker reports as
 * `host-unavailable`. The model is sent as a hint, the way MCP lets a
 * server name the model it wants; the host answers with the model it
 * actually used.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { IHostSampler } from '../contracts/interfaces/host-sampling.interface';

export const samplerOf = (server: McpServer): IHostSampler | undefined => {
	if (server.server.getClientCapabilities()?.sampling === undefined)
		return undefined;
	return async ({ model, prompt, maxTokens, signal }) => {
		const result = await server.server.createMessage(
			{
				messages: [
					{ role: 'user', content: { type: 'text', text: prompt } },
				],
				maxTokens,
				modelPreferences: { hints: [{ name: model }] },
			},
			{ signal },
		);
		return {
			model: result.model,
			text: result.content.type === 'text' ? result.content.text : '',
			...(result.stopReason === undefined
				? {}
				: { stopReason: result.stopReason }),
		};
	};
};
