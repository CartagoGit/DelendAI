/**
 * integration-protocol.helper.ts — whether this process may act on
 * integration. The repository records the protocol it runs; a process
 * whose code is older keeps rules that no longer hold (a host server
 * started before the change goes on running them from memory), so it
 * refuses to move refs or pull requests and says how to stop being stale.
 */
import { INTEGRATION_PROTOCOL_VERSION } from '../../contracts/constants/integration-protocol.constant';

/** The refusal of a process older than the recorded protocol; `undefined` when it may act. */
export const integrationProtocolRefusal = (
	recorded: number,
	spoken: number = INTEGRATION_PROTOCOL_VERSION,
): { readonly reason: string; readonly remedy: string } | undefined =>
	recorded <= spoken
		? undefined
		: {
				reason: `This process speaks integration protocol ${String(spoken)}, and the repository runs ${String(recorded)}: it refuses to move refs or pull requests under rules that changed after it started.`,
				remedy: 'Restart it (the MCP host server, or the shell that started it) so it runs the current code.',
			};
