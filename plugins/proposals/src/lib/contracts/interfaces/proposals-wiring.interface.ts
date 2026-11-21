import type { z } from 'zod';
import type { describeWorkIsolation } from '@delendai/core/plugin';
import type { IMcpPluginContext } from '@delendai/core/public';
import type { createLogStore } from '@delendai/logs/public';
import type { AgentLoopDetectorService } from '../../agents/loop-detector-service';
import type { buildSwarmPaths } from '../constants/default-path-layout.constant';
import type { PROPOSALS_OPTIONS_SCHEMA } from '../constants/proposals-options-schema.constant';
import type { IProposalFolderPolicy } from '../proposal-folder-policy';
import type { buildSyncProposalsRegistration } from '../../tools/sync-proposals.tool';
import type { buildSqlLifecycleReaders } from '../../sql/lifecycle-readers';
import type { IAgentNamesToolOptions } from '../../tools/agent-names.tool';
import type { IStateToolOptions } from '../../tools/state-tools.tool';
import type { IAuthoringToolOptions } from '../../tools/authoring-options';

type IProposalsOptions = z.infer<typeof PROPOSALS_OPTIONS_SCHEMA>;

/** The values the plugin's `register` resolves once and hands to its tool builders. */
export interface IProposalsToolsWiring {
	readonly ctx: IMcpPluginContext;
	readonly workIsolation: ReturnType<typeof describeWorkIsolation>;
	readonly parsedOptions: {
		readonly data: z.infer<typeof PROPOSALS_OPTIONS_SCHEMA>;
	};
	readonly loopDetector: AgentLoopDetectorService;
	readonly layout: ReturnType<typeof buildSwarmPaths>;
	readonly abs: (relativePath: string) => string;
	readonly extraProposalFolders: readonly string[];
	readonly folderPolicy: IProposalFolderPolicy;
	readonly syncOptions: Parameters<typeof buildSyncProposalsRegistration>[0];
	readonly refreshIndex: () => Promise<void>;
	readonly requireValidateEvidence: boolean;
	readonly reviewPolicy: {
		readonly requirePeerReview: boolean;
		readonly reviewIndependence: NonNullable<
			IProposalsOptions['reviewIndependence']
		>;
		readonly forceTransitions: NonNullable<
			IProposalsOptions['forceTransitions']
		>;
		readonly documentationLanguage?: IProposalsOptions['documentationLanguage'];
	};
	readonly effectivePersist: Record<string, unknown> | undefined;
	readonly incidentLogStore: ReturnType<typeof createLogStore>;
	readonly agentNamesOptions: IAgentNamesToolOptions;
	readonly stateOptions: IStateToolOptions;
	readonly sqlLifecycleReaders: ReturnType<typeof buildSqlLifecycleReaders>;
	readonly authoringOptions: IAuthoringToolOptions;
}

/** What the knowledge entries read from the plugin's resolved setup. */
export interface IProposalsKnowledgeInput {
	readonly ctx: IMcpPluginContext;
	readonly layout: ReturnType<typeof buildSwarmPaths>;
	readonly hasProposalsStore: boolean;
}
