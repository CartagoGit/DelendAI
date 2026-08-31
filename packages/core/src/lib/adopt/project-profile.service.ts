import { readFile } from 'node:fs/promises';
import { posix as pathPosix } from 'node:path';

import { writeFileAtomic } from '../shared/atomic-write';
import { quarantineCorruptFile } from '../shared/quarantine-corrupt-file';
import { withFileMutex } from '../shared/with-file-mutex';
import type {
	IBuildProjectProfileInput,
	ILoadProjectProfileResult,
	IPersistProjectProfileInput,
	IPersistProjectProfileResult,
	IProjectProfile,
	IProjectProfileWorkspace,
} from '../contracts/interfaces/project-profile.interface';
import {
	PROJECT_PROFILE_FILENAME,
	PROJECT_PROFILE_VERSION,
} from '../contracts/interfaces/project-profile.interface';

const isStringArray = (value: unknown): value is string[] =>
	Array.isArray(value) && value.every((entry) => typeof entry === 'string');

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	return value as Record<string, unknown>;
};

const workspaceMatches = (
	value: unknown,
): value is IProjectProfileWorkspace => {
	const record = asRecord(value);
	return (
		record !== undefined &&
		typeof record.path === 'string' &&
		typeof record.projectType === 'string' &&
		typeof record.language === 'string' &&
		typeof record.packageManager === 'string' &&
		(record.framework === undefined ||
			typeof record.framework === 'string') &&
		typeof record.testRunner === 'string' &&
		isStringArray(record.recommendedPluginIds)
	);
};

const projectProfileMatches = (value: unknown): value is IProjectProfile => {
	const record = asRecord(value);
	return (
		record !== undefined &&
		record.version === PROJECT_PROFILE_VERSION &&
		typeof record.createdAt === 'string' &&
		typeof record.generatedAt === 'string' &&
		(record.projectName === undefined ||
			typeof record.projectName === 'string') &&
		typeof record.projectType === 'string' &&
		typeof record.language === 'string' &&
		typeof record.packageManager === 'string' &&
		(record.framework === undefined ||
			typeof record.framework === 'string') &&
		typeof record.testRunner === 'string' &&
		(record.monorepoTool === undefined ||
			typeof record.monorepoTool === 'string') &&
		typeof record.hasMcpProject === 'boolean' &&
		isStringArray(record.mcpEvidence) &&
		isStringArray(record.ci) &&
		typeof record.ciProvider === 'string' &&
		isStringArray(record.agentConfigs) &&
		isStringArray(record.docsConventions) &&
		isStringArray(record.conflicts) &&
		isStringArray(record.signals) &&
		typeof record.recommendedPresetId === 'string' &&
		isStringArray(record.recommendedPluginIds) &&
		Array.isArray(record.workspaces) &&
		record.workspaces.every(workspaceMatches)
	);
};

const rootWorkspaceFrom = (
	input: IBuildProjectProfileInput,
): IProjectProfileWorkspace => ({
	path: '.',
	projectType: input.analysis.projectType,
	language: input.analysis.language,
	packageManager: input.analysis.packageManager,
	...(input.analysis.framework !== undefined
		? { framework: input.analysis.framework }
		: {}),
	testRunner: input.analysis.testRunner,
	recommendedPluginIds: [...input.assessment.recommendedPluginIds],
});

const normalizeWorkspacePath = (value: string): string => {
	const normalized = pathPosix.normalize(value.replaceAll('\\', '/'));
	return normalized === '.' ? '.' : normalized.replace(/\/$/, '');
};

const normalizeWorkspaceList = (
	workspaces: readonly IProjectProfileWorkspace[],
): readonly IProjectProfileWorkspace[] => {
	const deduped = new Map<string, IProjectProfileWorkspace>();
	for (const workspace of workspaces) {
		const normalizedPath = normalizeWorkspacePath(workspace.path);
		if (normalizedPath === '.') continue;
		deduped.set(normalizedPath, {
			...workspace,
			path: normalizedPath,
			recommendedPluginIds: [...workspace.recommendedPluginIds],
		});
	}
	return [...deduped.values()].sort((left, right) =>
		left.path.localeCompare(right.path),
	);
};

const mergeWorkspaces = (
	rootWorkspace: IProjectProfileWorkspace,
	existing: IProjectProfile | undefined,
	discoveredWorkspaces: readonly IProjectProfileWorkspace[] | undefined,
): readonly IProjectProfileWorkspace[] => {
	const workspaces =
		discoveredWorkspaces !== undefined
			? normalizeWorkspaceList(discoveredWorkspaces)
			: normalizeWorkspaceList(existing?.workspaces ?? []);
	return [rootWorkspace, ...workspaces];
};

const loadProjectProfileAbsolute = async (
	absolutePath: string,
): Promise<ILoadProjectProfileResult> => {
	try {
		const raw = await readFile(absolutePath, 'utf8');
		const parsed: unknown = JSON.parse(raw);
		if (!projectProfileMatches(parsed)) {
			const backup = await quarantineCorruptFile(absolutePath);
			return { profile: undefined, corruptBackupPath: backup };
		}
		return { profile: parsed, corruptBackupPath: null };
	} catch (error) {
		const code =
			typeof error === 'object' && error !== null && 'code' in error
				? (error as { code?: unknown }).code
				: undefined;
		if (code === 'ENOENT') {
			return { profile: undefined, corruptBackupPath: null };
		}
		const backup = await quarantineCorruptFile(absolutePath);
		return { profile: undefined, corruptBackupPath: backup };
	}
};

export const buildProjectProfile = (
	input: IBuildProjectProfileInput,
): IProjectProfile => {
	const now = (input.now ?? new Date()).toISOString();
	return {
		version: PROJECT_PROFILE_VERSION,
		createdAt: input.existing?.createdAt ?? now,
		generatedAt: now,
		...(input.analysis.name !== undefined
			? { projectName: input.analysis.name }
			: {}),
		projectType: input.analysis.projectType,
		language: input.analysis.language,
		packageManager: input.analysis.packageManager,
		...(input.analysis.framework !== undefined
			? { framework: input.analysis.framework }
			: {}),
		testRunner: input.analysis.testRunner,
		...(input.analysis.monorepoTool !== undefined
			? { monorepoTool: input.analysis.monorepoTool }
			: {}),
		hasMcpProject: input.analysis.hasMcpProject,
		mcpEvidence: [...input.analysis.mcpEvidence],
		ci: [...input.analysis.ci],
		ciProvider: input.analysis.ciProvider ?? 'unknown',
		agentConfigs: [...input.analysis.agentConfigs],
		docsConventions: [...(input.analysis.docsConventions ?? [])],
		conflicts: [...(input.analysis.conflicts ?? [])],
		signals: [...input.analysis.signals],
		recommendedPresetId: input.assessment.recommendedPresetId,
		recommendedPluginIds: [...input.assessment.recommendedPluginIds],
		workspaces: mergeWorkspaces(
			rootWorkspaceFrom(input),
			input.existing,
			input.discoveredWorkspaces,
		),
	};
};

export const loadProjectProfile = async (
	workspace: IPersistProjectProfileInput['workspace'],
): Promise<ILoadProjectProfileResult> =>
	loadProjectProfileAbsolute(workspace.resolve(PROJECT_PROFILE_FILENAME));

export const saveProjectProfile = async (
	workspace: IPersistProjectProfileInput['workspace'],
	profile: IProjectProfile,
): Promise<void> => {
	const absolutePath = workspace.resolve(PROJECT_PROFILE_FILENAME);
	await withFileMutex(absolutePath, async () => {
		await writeFileAtomic(
			absolutePath,
			`${JSON.stringify(profile, null, '\t')}\n`,
		);
	});
};

export const persistProjectProfile = async (
	input: IPersistProjectProfileInput,
): Promise<IPersistProjectProfileResult> => {
	const absolutePath = input.workspace.resolve(PROJECT_PROFILE_FILENAME);
	return withFileMutex(absolutePath, async () => {
		const loaded = await loadProjectProfileAbsolute(absolutePath);
		const profile = buildProjectProfile({
			analysis: input.analysis,
			assessment: input.assessment,
			...(loaded.profile !== undefined
				? { existing: loaded.profile }
				: {}),
			...(input.discoveredWorkspaces !== undefined
				? { discoveredWorkspaces: input.discoveredWorkspaces }
				: {}),
			...(input.now !== undefined ? { now: input.now } : {}),
		});
		await writeFileAtomic(
			absolutePath,
			`${JSON.stringify(profile, null, '\t')}\n`,
		);
		return {
			profile,
			corruptBackupPath: loaded.corruptBackupPath,
			created: loaded.profile === undefined,
			path: PROJECT_PROFILE_FILENAME,
		};
	});
};
