#!/usr/bin/env bun
/**
 * generate-agent-catalog.script.ts — build the checked-in agent discovery
 * catalog from the live tool registry and the composed skill manifest.
 * It lists no proposals: their state is read from their own projection.
 *
 * Why it exists: S1's MCP tool/resource/prompt are live views. This script
 * materializes the same compact discovery surface into a checked-in artifact so
 * host hint fragments, downstream bootstrap, and drift guards all share one
 * regenerable source of truth.
 *
 * Usage:
 *   bun tools/scripts/catalog/generate-agent-catalog.script.ts
 *   bun tools/scripts/catalog/generate-agent-catalog.script.ts --check
 *   bun tools/scripts/catalog/generate-agent-catalog.script.ts --mode=full
 *   bun tools/scripts/catalog/generate-agent-catalog.script.ts --root /abs/path
 *
 * Exit codes:
 *   0 — artifact is written or already up to date
 *   1 — artifact is stale under --check, or one or more skills fell back to
 *       an implicit summary and need an explicit manifest `summary`
 *   2 — invocation or load error
 */
import { dirname, join, resolve } from 'node:path';
import { mkdir, rm } from 'node:fs/promises';

import { assembleCliConfig } from '@delendai/core/public';
import { parseCliArgs } from '@delendai/core/plugin';
import { buildCatalog } from '@delendai/core/cli';
import type { ISkillSummary, IToolSummary } from '@delendai/core/contracts';
import type { ICatalogSources } from '@delendai/core/cli';

export const DEFAULT_OUTPUT_PATH = 'docs/delendai/agent-catalog.generated.json';
export const DEFAULT_SKILL_MANIFEST_PATH = 'packages/core/skills/manifest.json';
export const DEFAULT_WARNINGS_SUFFIX = '.lint-warnings.txt';

type CatalogMode = 'compact' | 'full';

export interface IManifestSkillEntry {
	readonly id: string;
	readonly version: string;
	readonly minCoreVersion: string;
	readonly summary?: string;
	readonly bodyPath: string;
	readonly tags: readonly string[];
	readonly appliesTo: readonly string[];
}

export interface ISkillManifestFile {
	readonly generatedAt: string;
	readonly skills: readonly IManifestSkillEntry[];
}

export interface IArtifactSkill {
	readonly id: string;
	readonly version: string;
	readonly minCoreVersion: string;
	readonly summary: string;
	readonly appliesTo: readonly string[];
	readonly tags: readonly string[];
	readonly bodyPath: string;
}

export interface IGeneratedAgentCatalogArtifact {
	readonly mode: CatalogMode;
	readonly tools: readonly IToolSummary[];
	readonly skills: readonly IArtifactSkill[];
	// No proposals: what a proposal's state is belongs to its markdown and
	// the projection read from it. Listed here, every change of state in
	// any proposal rewrote this checked-in file, so every pull request
	// that touched a proposal touched what every other one did, and the
	// zones whose tests read this file ran again for a verdict.
}

export interface IGeneratorOptions {
	readonly root: string;
	readonly mode: CatalogMode;
	readonly check: boolean;
}

export interface IGeneratorIo {
	readonly readText: (absPath: string) => Promise<string | undefined>;
	readonly writeText: (absPath: string, text: string) => Promise<void>;
	readonly removeFile: (absPath: string) => Promise<void>;
	readonly ensureDir: (absPath: string) => Promise<void>;
	readonly warn: (message: string) => void;
	readonly info: (message: string) => void;
	readonly error: (message: string) => void;
	readonly now?: () => Date;
	readonly fixedGeneratedAt?: string;
	readonly loadTools?: (root: string) => Promise<readonly IToolSummary[]>;
}

export interface IGenerationResult {
	readonly artifact: IGeneratedAgentCatalogArtifact;
	readonly text: string;
	readonly outputPath: string;
	readonly warningsPath: string;
	readonly missingSummarySkillIds: readonly string[];
	readonly changed: boolean;
	readonly generatedAt: string;
}

export interface ICliResult {
	readonly exitCode: number;
	readonly generation?: IGenerationResult;
}

const defaultIo = (): IGeneratorIo => ({
	readText: async (absPath) => {
		const file = Bun.file(absPath);
		return (await file.exists()) ? await file.text() : undefined;
	},
	writeText: async (absPath, text) => {
		await Bun.write(absPath, text);
	},
	removeFile: async (absPath) => {
		await rm(absPath, { force: true });
	},
	ensureDir: async (absPath) => {
		await mkdir(absPath, { recursive: true });
	},
	warn: (message) => console.warn(message),
	info: (message) => console.log(message),
	error: (message) => console.error(message),
});

const collapseWhitespace = (value: string): string =>
	value.replace(/\s+/gu, ' ').trim();

const stripFrontmatter = (body: string): string =>
	body.replace(/^---\n[\s\S]*?\n---\n?/u, '');

export const firstBodyParagraph = (body: string): string | undefined => {
	const paragraph = stripFrontmatter(body)
		.replace(/^#+\s.*$/gmu, '')
		.split(/\n\s*\n/u)
		.map((part) => collapseWhitespace(part))
		.find((part) => part.length > 0);
	return paragraph === undefined || paragraph.length === 0
		? undefined
		: paragraph;
};

const parseJsonFile = async <T>(
	absPath: string,
	readText: IGeneratorIo['readText'],
	label: string,
): Promise<T> => {
	const raw = await readText(absPath);
	if (raw === undefined) {
		throw new Error(`${label} not found: ${absPath}`);
	}
	try {
		return JSON.parse(raw) as T;
	} catch (error) {
		throw new Error(
			`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
};

const readSkillSummaries = async (
	root: string,
	io: IGeneratorIo,
): Promise<{
	readonly skills: readonly ISkillSummary[];
	readonly manifestGeneratedAt: string;
	readonly missingSummarySkillIds: readonly string[];
}> => {
	const manifestPath = join(root, DEFAULT_SKILL_MANIFEST_PATH);
	const manifest = await parseJsonFile<ISkillManifestFile>(
		manifestPath,
		io.readText,
		'skill manifest',
	);
	const skills: ISkillSummary[] = [];
	const missingSummarySkillIds: string[] = [];
	for (const skill of manifest.skills) {
		const explicitSummary = skill.summary?.trim();
		let summary = explicitSummary;
		if (summary === undefined || summary.length === 0) {
			const bodyPath = join(root, ...skill.bodyPath.split('/'));
			const body = await io.readText(bodyPath);
			summary =
				(body !== undefined ? firstBodyParagraph(body) : undefined) ??
				`Skill ${skill.id}`;
			missingSummarySkillIds.push(skill.id);
		}
		if (summary.length > 200) {
			throw new Error(
				`skill summary exceeds 200 chars: ${skill.id} (${summary.length})`,
			);
		}
		skills.push({
			id: skill.id,
			version: skill.version,
			minCoreVersion: skill.minCoreVersion,
			summary,
			appliesTo: [...skill.appliesTo].sort((left, right) =>
				left.localeCompare(right),
			),
			tags: [...skill.tags].sort((left, right) =>
				left.localeCompare(right),
			),
			bodyPath: skill.bodyPath,
		});
	}
	return {
		skills,
		manifestGeneratedAt: manifest.generatedAt,
		missingSummarySkillIds,
	};
};

const loadLiveToolSummaries = async (
	root: string,
	io: IGeneratorIo,
): Promise<readonly IToolSummary[]> => {
	const args = parseCliArgs(['--preset=swarm'], root);
	const { loadResult, agentCatalogTools } = await assembleCliConfig(args, {
		readFile: io.readText,
	});
	if (loadResult.errors.length > 0) {
		throw new Error(
			`plugin load errors prevented live tool discovery: ${loadResult.errors
				.map((entry) => entry.message)
				.join(' | ')}`,
		);
	}
	// Reuse the SAME authoritative name+plugin the running server exposes via
	// `agent_catalog`, rather than re-deriving the plugin from the qualified
	// name (which mis-attributes every core tool with an underscore id —
	// fs_read→`fs`, agent_catalog→`agent`, … — to a fabricated plugin).
	return agentCatalogTools;
};

const resolveGeneratedAt = (
	manifestGeneratedAt: string,
	io: IGeneratorIo,
): string => {
	const envFixed = io.fixedGeneratedAt ?? process.env.AGENT_CATALOG_FIXED_NOW;
	if (envFixed !== undefined) {
		const fixed = new Date(envFixed);
		if (Number.isNaN(fixed.getTime())) {
			throw new Error(
				`AGENT_CATALOG_FIXED_NOW is not a valid ISO date: ${envFixed}`,
			);
		}
		return fixed.toISOString();
	}
	return manifestGeneratedAt;
};

const renderWarnings = (skillIds: readonly string[]): string =>
	[
		'Implicit skill summaries detected. Add explicit `summary` fields to packages/core/skills/manifest.json:',
		...skillIds.map((skillId) => `- ${skillId}`),
		'',
	].join('\n');

const buildArtifact = (
	snapshot: ReturnType<typeof buildCatalog>,
): IGeneratedAgentCatalogArtifact => ({
	mode: snapshot.mode,
	tools: snapshot.tools,
	skills: snapshot.skills,
});

export const buildAgentCatalogArtifact = async (
	options: Pick<IGeneratorOptions, 'root' | 'mode'>,
	ioOverrides: Partial<IGeneratorIo> = {},
): Promise<IGenerationResult> => {
	const io = { ...defaultIo(), ...ioOverrides } satisfies IGeneratorIo;
	const { skills, manifestGeneratedAt, missingSummarySkillIds } =
		await readSkillSummaries(options.root, io);
	const tools = await (io.loadTools ?? loadLiveToolSummaries)(
		options.root,
		io,
	);
	const generatedAt = resolveGeneratedAt(manifestGeneratedAt, io);
	const sources: ICatalogSources = {
		tools: () => tools,
		skills: () => skills,
		proposals: () => [],
	};
	const snapshot = buildCatalog(sources, {
		mode: options.mode,
		now: () => new Date(generatedAt),
		server: {
			name: 'delendai',
			version: '0.1.0',
			namespacePrefix: 'delendai',
		},
	});
	const artifact = buildArtifact(snapshot);
	const outputPath = join(options.root, DEFAULT_OUTPUT_PATH);
	const warningsPath = outputPath.replace(
		/\.json$/u,
		DEFAULT_WARNINGS_SUFFIX,
	);
	const current = await io.readText(outputPath);
	const freshText = `${JSON.stringify(artifact, null, '\t')}\n`;
	const text = freshText;
	return {
		artifact,
		text,
		outputPath,
		warningsPath,
		missingSummarySkillIds,
		changed: (current ?? '') !== text,
		generatedAt,
	};
};

const writeWarningsArtifact = async (
	result: IGenerationResult,
	io: IGeneratorIo,
): Promise<void> => {
	if (result.missingSummarySkillIds.length === 0) {
		await io.removeFile(result.warningsPath);
		return;
	}
	await io.ensureDir(dirname(result.warningsPath));
	await io.writeText(
		result.warningsPath,
		renderWarnings(result.missingSummarySkillIds),
	);
	io.warn(
		`implicit skill summaries detected for ${result.missingSummarySkillIds.length} skill(s); see ${result.warningsPath}`,
	);
};

export const parseGeneratorArgs = (
	argv: readonly string[],
	cwd: string,
): IGeneratorOptions => {
	let mode: CatalogMode = 'compact';
	let check = false;
	let root = cwd;
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === '--check') {
			check = true;
			continue;
		}
		if (arg === '--root') {
			const next = argv[index + 1];
			if (next === undefined) {
				throw new Error('--root requires a path argument');
			}
			root = resolve(next);
			index += 1;
			continue;
		}
		if (arg?.startsWith('--root=')) {
			root = resolve(arg.slice('--root='.length));
			continue;
		}
		if (arg?.startsWith('--mode=')) {
			const parsedMode = arg.slice('--mode='.length);
			if (parsedMode !== 'compact' && parsedMode !== 'full') {
				throw new Error(`unsupported mode: ${parsedMode}`);
			}
			mode = parsedMode;
			continue;
		}
		throw new Error(`unknown argument: ${arg}`);
	}
	return { root, mode, check };
};

export const runCatalogGeneratorCli = async (
	argv: readonly string[],
	ioOverrides: Partial<IGeneratorIo> = {},
): Promise<ICliResult> => {
	const io = { ...defaultIo(), ...ioOverrides } satisfies IGeneratorIo;
	const options = parseGeneratorArgs(argv, process.cwd());
	const generation = await buildAgentCatalogArtifact(options, io);
	await writeWarningsArtifact(generation, io);
	if (options.check) {
		if (generation.changed) {
			io.error(
				`agent catalog artifact is stale — run \`bun tools/scripts/catalog/generate-agent-catalog.script.ts --mode=${options.mode}\` and commit.`,
			);
			return { exitCode: 1, generation };
		}
		if (generation.missingSummarySkillIds.length > 0) {
			io.error(
				'agent catalog skill summaries are incomplete — add explicit `summary` fields and rerun the generator.',
			);
			return { exitCode: 1, generation };
		}
		io.info('agent catalog up to date.');
		return { exitCode: 0, generation };
	}
	await io.ensureDir(dirname(generation.outputPath));
	await io.writeText(generation.outputPath, generation.text);
	io.info(
		generation.changed
			? `wrote ${generation.outputPath}`
			: `agent catalog unchanged at ${generation.outputPath}`,
	);
	return {
		exitCode: generation.missingSummarySkillIds.length > 0 ? 1 : 0,
		generation,
	};
};

if (import.meta.main) {
	try {
		const result = await runCatalogGeneratorCli(process.argv.slice(2));
		process.exit(result.exitCode);
	} catch (error) {
		console.error(
			`generate-agent-catalog: ${error instanceof Error ? error.message : String(error)}`,
		);
		process.exit(2);
	}
}
