import type { AGENT_SLOTS } from '../constants/agent-slots.constant';

/** A canonical agent slot id (the orchestrator or one of the four bounded sub-slots). */
export type IAgentSlot = (typeof AGENT_SLOTS)[number];

/** Bounded sub-slots only — every slot except the root orchestrator. */
export type ISubagentSlot = Exclude<IAgentSlot, 'orchestrator'>;
