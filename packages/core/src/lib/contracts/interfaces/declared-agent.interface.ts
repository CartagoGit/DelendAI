/**
 * declared-agent.interface.ts — agents as delendai knows them: from the
 * registry, from a declaration, or found on the machine.
 */
import type { z } from 'zod';

import type { DECLARED_AGENT_SCHEMA } from '../constants/declared-agent-schema.constant';
import type { IAcpLaunch } from './acp.interface';
import type { IDetectedAgent } from './agent-detection.interface';

export type IDeclaredAgent = z.infer<typeof DECLARED_AGENT_SCHEMA>;

/** Where delendai learned of an agent. */
export type IAgentOrigin = 'registry' | 'project' | 'personal' | 'detected';

export interface IKnownAgent {
	readonly id: string;
	readonly name: string;
	/** How it is reached; `extension` for one an IDE holds, which delendai does not start. */
	readonly kind: IDeclaredAgent['kind'] | 'extension';
	readonly origin: IAgentOrigin;
	/** How to start it over ACP, when it is an ACP agent that can start here. */
	readonly launch?: IAcpLaunch | undefined;
	readonly declared?: IDeclaredAgent | undefined;
	/** Where the machine shows it. */
	readonly found: readonly IDetectedAgent[];
}
