import type { IProjectAnalysis } from '../../bootstrap/analyze-project';
import type { IAdoptionAssessment } from './adoption-assessment.interface';
import type { IWorkspacePathProvider } from './workspace-paths.interface';

export const PROJECT_PROFILE_VERSION = 1 as const;

export const PROJECT_PROFILE_FILENAME = '.mcp-vertex/project-profile.json';

export interface IProjectProfileWorkspace {
	readonly path: string;
	readonly projectType: IProjectAnalysis['projectType'];
	readonly language: IProjectAnalysis['language'];
	readonly packageManager: IProjectAnalysis['packageManager'];
	readonly framework?: IProjectAnalysis['framework'];
	readonly testRunner: IProjectAnalysis['testRunner'];
	readonly recommendedPluginIds: readonly string[];
}

export interface IProjectProfile {
	readonly version: typeof PROJECT_PROFILE_VERSION;
	readonly createdAt: string;
	readonly generatedAt: string;
	readonly projectName?: string;
	readonly projectType: IProjectAnalysis['projectType'];
	readonly language: IProjectAnalysis['language'];
	readonly packageManager: IProjectAnalysis['packageManager'];
	readonly framework?: IProjectAnalysis['framework'];
	readonly testRunner: IProjectAnalysis['testRunner'];
	readonly monorepoTool?: string;
	readonly hasMcpProject: boolean;
	readonly mcpEvidence: readonly string[];
	readonly ci: readonly string[];
	readonly ciProvider: NonNullable<IProjectAnalysis['ciProvider']>;
	readonly agentConfigs: readonly string[];
	readonly docsConventions: readonly string[];
	readonly conflicts: readonly string[];
	readonly signals: readonly string[];
	readonly recommendedPresetId: IAdoptionAssessment['recommendedPresetId'];
	readonly recommendedPluginIds: readonly string[];
	readonly workspaces: readonly IProjectProfileWorkspace[];
}

export interface IBuildProjectProfileInput {
	readonly analysis: IProjectAnalysis;
	readonly assessment: IAdoptionAssessment;
	readonly existing?: IProjectProfile;
	readonly discoveredWorkspaces?: readonly IProjectProfileWorkspace[];
	readonly now?: Date;
}

export interface ILoadProjectProfileResult {
	readonly profile: IProjectProfile | undefined;
	readonly corruptBackupPath: string | null;
}

export interface IPersistProjectProfileInput {
	readonly workspace: IWorkspacePathProvider;
	readonly analysis: IProjectAnalysis;
	readonly assessment: IAdoptionAssessment;
	readonly discoveredWorkspaces?: readonly IProjectProfileWorkspace[];
	readonly now?: Date;
}

export interface IPersistProjectProfileResult
	extends ILoadProjectProfileResult {
	readonly profile: IProjectProfile;
	readonly created: boolean;
	readonly path: typeof PROJECT_PROFILE_FILENAME;
}
