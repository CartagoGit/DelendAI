/**
 * acp-invoker.interface.ts — what the acp invoker needs from core,
 * injected so specs drive it with a fake agent.
 */
import type { listAgents, runAcpAgent } from '@delendai/core/cli';

export interface IAcpInvokerOptions {
	/** Where agents run: the workspace a hop works in. */
	readonly cwd: string;
	readonly run?: typeof runAcpAgent | undefined;
	readonly listAgents?: typeof listAgents | undefined;
}
