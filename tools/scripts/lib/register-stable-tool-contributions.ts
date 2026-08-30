import { registerProposalsStableTools } from '@mcp-vertex/proposals/public';

/**
 * Replays first-party stable facade contributions for offline scripts that do
 * not boot the full plugin runtime before reading the stable facade.
 */
export const registerStableToolContributions = (): void => {
	registerProposalsStableTools();
};
