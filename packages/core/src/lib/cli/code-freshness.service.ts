/**
 * code-freshness.service.ts — the status collector's reading of whether
 * this server runs older code than its checkout.
 *
 * The reading is x00701's stale-runtime watch, the one every tool result's
 * advisory and the supervisor's restart use; this only shapes it for
 * `<prefix>_status`, so an agent that asks gets the same answer it is told.
 */
import type { ICodeFreshness } from '../contracts/interfaces/code-freshness.interface';

export const codeFreshnessOf = async (
	behind: (() => Promise<string | undefined>) | undefined,
): Promise<ICodeFreshness> => {
	const reason = behind === undefined ? undefined : await behind();
	return reason === undefined
		? { stale: false }
		: {
				stale: true,
				reason,
				next: 'Restart the host server (reload the MCP server in the editor) so it applies the current rules.',
			};
};
