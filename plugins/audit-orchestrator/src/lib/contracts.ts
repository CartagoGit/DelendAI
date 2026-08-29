import type {
	IDispatchPort,
	IPlanOutcome,
} from '@mcp-vertex/agent-orchestrator/public';
import type { IWorkspacePathProvider } from '@mcp-vertex/core/public';

export interface IAuditPlanChild {
	readonly id: string;
	readonly title?: string;
	readonly kind?: string;
	readonly required?: boolean;
}

export interface IAuditPlanSlice {
	readonly id: string;
	readonly title: string;
	readonly files: readonly string[];
	readonly instruction: string;
}

export interface IAuditPlanDocument {
	readonly id: string;
	readonly title: string;
	readonly status?: string | undefined;
	readonly type: string;
	readonly kind?: string | undefined;
	readonly children: readonly IAuditPlanChild[];
	readonly slices: readonly IAuditPlanSlice[];
}

export interface IAuditTask {
	readonly id: string;
	readonly title: string;
	readonly description: string;
	readonly files: readonly string[];
	readonly dependsOn: readonly string[];
}

export interface IAuditOrchestratorDeps {
	readonly namespacePrefix: string;
	readonly workspace: IWorkspacePathProvider;
	readonly dispatchPort?: () => IDispatchPort;
}

export interface IAuditDispatchResult {
	readonly taskId: string;
	readonly outcome: IPlanOutcome;
}
