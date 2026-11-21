/**
 * onboard-agent.interface.ts — what the onboarding tool needs from core,
 * injected so specs drive it without a machine, a network or a spend.
 */
import type {
	declareAgent,
	introduceAgent,
	listAgents,
	runAcpAgent,
	writeAgentUsagePage,
} from '@delendai/core/cli';

export interface IOnboardAgentFlows {
	readonly listAgents: typeof listAgents;
	readonly declareAgent: typeof declareAgent;
	readonly introduceAgent: typeof introduceAgent;
	readonly writeAgentUsagePage: typeof writeAgentUsagePage;
	readonly runAcpAgent: typeof runAcpAgent;
	/** An executable's `--help`, with a short deadline. */
	readonly help: (command: string, cwd: string) => Promise<string>;
}

export interface IOnboardAgentToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRoot: string;
	readonly flows?: IOnboardAgentFlows | undefined;
}
