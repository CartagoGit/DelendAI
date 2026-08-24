/** Cheap quality-policy aggregator only: pure helpers + config reads, never runners. */
import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';

import {
	createWorkspaceFileReader,
	parseConfigFile,
	type IFileReader,
} from '@mcp-vertex/core/public';
import { classifyPath } from '@mcp-vertex/conventions/public';
import { resolveScopes } from '@mcp-vertex/quality/public';
import { detectPresetForArea } from '@mcp-vertex/rules/public';
import {
	DEFAULT_CONVENTION,
	detectRunner,
} from '@mcp-vertex/test-convention/public';
import {
	isTestPolicyMode,
	POLICY_GUIDANCE,
	resolveTestPolicy,
	type ITestPolicyMode,
} from '@mcp-vertex/test-policy/public';

import {
	QUALITY_POLICY_AREAS,
	DEFAULT_QUALITY_POLICY_MAX_BYTES,
	QUALITY_POLICY_DEPENDS_ON,
	QUALITY_POLICY_LINT_AREAS,
	QUALITY_POLICY_SAMPLE_LIMIT,
	QUALITY_POLICY_SAMPLE_ROOTS,
	QUALITY_POLICY_TYPESCRIPT_EXTENSIONS,
} from '../contracts/constants/quality-policy.constant';
import type {
	IQualityPolicyArea,
	IQualityPolicyCoverageThreshold,
	IQualityPolicyEntry,
	IQualityPolicyOutput,
	IQualityPolicyPresetSignal,
	IQualityPolicyRoleSample,
	IQualityPolicyToolArgs,
	IQualityPolicyToolOptions,
} from '../contracts/interfaces/quality-policy.interface';
import { finalizeQualityPolicyOutput } from './quality-policy-format.service';
import { buildTypesEntry } from './quality-policy-types.service';

interface IWorkspaceConfigSignals {
	readonly testPolicyMode?: ITestPolicyMode;
	readonly coverageThreshold?: IQualityPolicyCoverageThreshold;
}
const readWorkspaceSignals = async (
	workspaceRootAbs: string,
): Promise<IWorkspaceConfigSignals> => {
	const raw = await readFile(
		join(workspaceRootAbs, 'mcp-vertex.config.json'),
		'utf8',
	).catch(() => undefined);
	const parsed = parseConfigFile(raw);
	const plugins = parsed.plugins ?? {};
	const testPolicyOptions = plugins['test-policy']?.options as
		| Record<string, unknown>
		| undefined;
	const testConventionOptions = plugins['test-convention']?.options as
		| Record<string, unknown>
		| undefined;
	const coverageCandidate = testConventionOptions?.coverageThreshold;
	const coverageFromConfig =
		typeof coverageCandidate === 'object' && coverageCandidate !== null
			? (coverageCandidate as Record<string, unknown>)
			: undefined;
	const defaultCoverage = DEFAULT_CONVENTION.coverageThreshold;
	return {
		...(isTestPolicyMode(testPolicyOptions?.mode)
			? { testPolicyMode: testPolicyOptions.mode }
			: {}),
		coverageThreshold: {
			lines:
				typeof coverageFromConfig?.lines === 'number'
					? coverageFromConfig.lines
					: defaultCoverage.lines,
			functions:
				typeof coverageFromConfig?.functions === 'number'
					? coverageFromConfig.functions
					: defaultCoverage.functions,
			branches:
				typeof coverageFromConfig?.branches === 'number'
					? coverageFromConfig.branches
					: defaultCoverage.branches,
			statements:
				typeof coverageFromConfig?.statements === 'number'
					? coverageFromConfig.statements
					: defaultCoverage.statements,
		},
	};
};
const collectSamplePaths = async (
	workspaceRootAbs: string,
): Promise<readonly string[]> => {
	const queue: Array<{ absolute: string; relative: string }> =
		QUALITY_POLICY_SAMPLE_ROOTS.map((root) => ({
			absolute: join(workspaceRootAbs, root),
			relative: root,
		}));
	const collected: string[] = [];
	while (queue.length > 0 && collected.length < QUALITY_POLICY_SAMPLE_LIMIT) {
		const next = queue.shift();
		if (next === undefined) break;
		let entries: readonly string[] = [];
		try {
			entries = await readdir(next.absolute, 'utf8');
		} catch {
			continue;
		}
		for (const entryName of entries) {
			if (entryName === 'node_modules' || entryName === 'dist') continue;
			const absolutePath = join(next.absolute, entryName);
			const relativePath = `${next.relative}/${entryName}`;
			let currentStat: Awaited<ReturnType<typeof stat>>;
			try {
				currentStat = await stat(absolutePath);
			} catch {
				continue;
			}
			if (currentStat.isDirectory()) {
				queue.push({ absolute: absolutePath, relative: relativePath });
				continue;
			}
			if (!QUALITY_POLICY_TYPESCRIPT_EXTENSIONS.has(extname(entryName))) {
				continue;
			}
			collected.push(relativePath);
			if (collected.length >= QUALITY_POLICY_SAMPLE_LIMIT) break;
		}
	}
	return collected;
};
const buildConventionsEntry = async (
	workspaceRootAbs: string,
): Promise<IQualityPolicyEntry> => {
	const sampledPaths = await collectSamplePaths(workspaceRootAbs);
	if (sampledPaths.length === 0) {
		return {
			summary:
				'No TypeScript sample paths were found; conventions fall back to the canonical TypeScript profile summary.',
			static: true,
		};
	}
	const classified: IQualityPolicyRoleSample[] = sampledPaths.map((path) => ({
		path,
		role: classifyPath(path),
	}));
	const roleCounts = classified.reduce<Record<string, number>>(
		(counts, item) => {
			counts[item.role] = (counts[item.role] ?? 0) + 1;
			return counts;
		},
		{},
	);
	const topRoles = Object.entries(roleCounts)
		.sort(
			(left, right) =>
				right[1] - left[1] || left[0].localeCompare(right[0]),
		)
		.slice(0, 3)
		.map(([role, count]) => `${role}=${count}`)
		.join(', ');
	return {
		summary: `Sampled ${classified.length} path(s); top roles: ${topRoles || 'other=0'}.`,
		sampledPaths: classified,
		roleCounts,
	};
};

const buildLintEntry = async (
	reader: IFileReader,
): Promise<IQualityPolicyEntry> => {
	const scopes = Object.keys(await resolveScopes(reader, {})).sort(
		(left, right) => left.localeCompare(right),
	);
	const presetSignals: IQualityPolicyPresetSignal[] = [];
	for (const candidate of QUALITY_POLICY_LINT_AREAS) {
		if (
			candidate !== 'root' &&
			!(await reader.exists(`${candidate}/package.json`)) &&
			!(await reader.exists(`${candidate}/tsconfig.json`))
		) {
			continue;
		}
		const detectArea = candidate === 'root' ? '' : candidate;
		const detected = await detectPresetForArea(reader, detectArea);
		presetSignals.push({
			area: candidate,
			presetId: detected.presetId,
			reason: detected.reason,
		});
	}
	const presetSummary = presetSignals
		.map((signal) => `${signal.area}:${signal.presetId}`)
		.join(', ');
	return {
		summary:
			scopes.length > 0
				? `Resolved ${scopes.length} quality scope(s); detected lint presets ${presetSummary || 'none'}.`
				: `No explicit quality scopes were resolved; detected lint presets ${presetSummary || 'none'}.`,
		scopes,
		presets: presetSignals,
		static: scopes.length === 0,
	};
};

const buildCoverageEntry = async (
	reader: IFileReader,
	workspaceSignals: IWorkspaceConfigSignals,
): Promise<IQualityPolicyEntry> => {
	const runner = await detectRunner(reader);
	const threshold =
		workspaceSignals.coverageThreshold ??
		DEFAULT_CONVENTION.coverageThreshold;
	return {
		summary: `Coverage policy is bounded by ${threshold.lines}/${threshold.functions}/${threshold.branches}/${threshold.statements} and summarized without running coverage; detected runner ${runner.name}.`,
		runner: runner.name,
		mockApi: runner.mockApi,
		evidence: runner.evidence,
		coverageThreshold: threshold,
		static: true,
	};
};

const buildTestsEntry = async (
	reader: IFileReader,
	workspaceSignals: IWorkspaceConfigSignals,
): Promise<IQualityPolicyEntry> => {
	const resolved = resolveTestPolicy({
		configMode: workspaceSignals.testPolicyMode,
	});
	const runner = await detectRunner(reader);
	return {
		summary: `Test policy resolves to ${resolved.mode} from ${resolved.source}; detected runner ${runner.name}.`,
		mode: resolved.mode,
		source: resolved.source,
		guidance: [...POLICY_GUIDANCE[resolved.mode]],
		runner: runner.name,
		mockApi: runner.mockApi,
		evidence: runner.evidence,
	};
};

const builders: Record<
	IQualityPolicyArea,
	(options: {
		reader: IFileReader;
		workspaceRootAbs: string;
		workspaceSignals: IWorkspaceConfigSignals;
	}) => Promise<IQualityPolicyEntry>
> = {
	tests: async ({ reader, workspaceSignals }) =>
		buildTestsEntry(reader, workspaceSignals),
	conventions: async ({ workspaceRootAbs }) =>
		buildConventionsEntry(workspaceRootAbs),
	lint: async ({ reader, workspaceRootAbs }) => buildLintEntry(reader),
	types: async ({ workspaceRootAbs }) => buildTypesEntry(workspaceRootAbs),
	coverage: async ({ reader, workspaceSignals }) =>
		buildCoverageEntry(reader, workspaceSignals),
};

export const buildQualityPolicyPayload = async (
	args: IQualityPolicyToolArgs,
	options: IQualityPolicyToolOptions,
): Promise<IQualityPolicyOutput> => {
	const reader = createWorkspaceFileReader({
		root: options.workspaceRootAbs,
		resolve: (path: string) => join(options.workspaceRootAbs, path),
	});
	const workspaceSignals = await readWorkspaceSignals(
		options.workspaceRootAbs,
	);
	const selectedAreas: readonly IQualityPolicyArea[] =
		args.area === undefined ? [...QUALITY_POLICY_AREAS] : [args.area];
	const entries: Partial<Record<IQualityPolicyArea, IQualityPolicyEntry>> =
		{};
	for (const area of selectedAreas) {
		entries[area] = await builders[area]({
			reader,
			workspaceRootAbs: options.workspaceRootAbs,
			workspaceSignals,
		});
	}
	return finalizeQualityPolicyOutput(
		{
			...entries,
			dependsOn: [...QUALITY_POLICY_DEPENDS_ON],
		} as Omit<
			IQualityPolicyOutput,
			'bytes' | 'truncated' | 'originalBytes'
		>,
		options.maxBytes || DEFAULT_QUALITY_POLICY_MAX_BYTES,
	);
};
