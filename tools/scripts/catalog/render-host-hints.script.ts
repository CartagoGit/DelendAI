#!/usr/bin/env bun
/**
 * render-host-hints.script.ts - render deterministic host-instruction
 * fragments for Copilot Chat, Claude Code, Cursor, and generic AGENTS
 * consumers from the same agent-catalog artifact produced by
 * generate-agent-catalog.script.ts.
 *
 * Why it exists: S4 of f00056. Hosts that still rely on checked-in
 * instruction files (Copilot, Claude Code, generic AGENTS consumers) need
 * routing hints that stay in lock-step with the live catalog. We do NOT
 * rewrite the host's narrative - we only emit a small, byte-stable
 * "discovery" block. Human-edited files keep their own voice and just
 * reference the generated block by path.
 *
 * Usage:
 *   bun tools/scripts/catalog/render-host-hints.script.ts
 *   bun tools/scripts/catalog/render-host-hints.script.ts --check
 *   bun tools/scripts/catalog/render-host-hints.script.ts --root /abs/path
 *
 * Exit codes:
 *   0 - fragments written or already up to date
 *   1 - fragments are stale under --check
 *   2 - invocation or load error
 */
import { dirname, join, resolve } from 'node:path';
import { mkdir, rm } from 'node:fs/promises';

import type {
	IArtifactProposalSummary,
	IGeneratedAgentCatalogArtifact,
} from './generate-agent-catalog.script.ts';

export const DEFAULT_INPUT_PATH =
	'docs/mcp-vertex/agent-catalog.generated.json';
export const DEFAULT_OUTPUT_DIR = 'docs/mcp-vertex/host-hints';
export const DEFAULT_WARNINGS_PATH =
	'docs/mcp-vertex/host-hints/.lint-warnings.txt';

export const MAX_PROPOSALS_PER_FRAGMENT = 8;
export const MAX_SKILLS_PER_FRAGMENT = 10;
export const MAX_FRAGMENT_BYTES = 3_000;

export interface IArtifactLike {
	readonly generatedAt: string;
	readonly tools: ReadonlyArray<{
		readonly name: string;
		readonly plugin: string;
	}>;
	readonly skills: ReadonlyArray<{
		readonly id: string;
		readonly tags: readonly string[];
		readonly summary: string;
		readonly appliesTo: readonly string[];
	}>;
	readonly proposals: {
		readonly actionable: readonly IArtifactProposalSummary[];
		readonly byStatus: Readonly<Record<string, number>>;
	};
}

export interface IRenderInput {
	readonly artifact: IArtifactLike;
	readonly generatedAt: string;
}

export interface IHostHint {
	readonly id: 'copilot' | 'claude' | 'agents';
	readonly filename: string;
	readonly render: (input: IRenderInput) => string;
}

export interface IRenderOutput {
	readonly id: IHostHint['id'];
	readonly filename: string;
	readonly text: string;
}

export interface IRenderHostHintsOptions {
	readonly artifact: IArtifactLike;
	readonly generatedAt?: string;
	readonly hosts?: readonly IHostHint[];
}

export interface IRenderHostHintsResult {
	readonly fragments: readonly IRenderOutput[];
	readonly warnings: readonly string[];
	readonly bytes: number;
}

export interface IRenderIo {
	readonly readText: (absPath: string) => Promise<string | undefined>;
	readonly writeText: (absPath: string, text: string) => Promise<void>;
	readonly removeFile: (absPath: string) => Promise<void>;
	readonly ensureDir: (absPath: string) => Promise<void>;
	readonly warn: (message: string) => void;
	readonly info: (message: string) => void;
	readonly error: (message: string) => void;
	readonly fixedGeneratedAt?: string;
}

const escapeMarkdownPipe = (value: string): string =>
	value.replace(/\|/gu, '\\|');

const truncateSummary = (summary: string, max: number): string =>
	summary.length <= max
		? summary
		: `${summary.slice(0, max - 1).trimEnd()}...`;

const backtickId = (id: string): string => `\`${id}\``;

const renderCommonBlock = (input: IRenderInput): string => {
	const { artifact, generatedAt } = input;
	const overviewTool = 'mcp-vertex_overview';
	const catalogTool = 'mcp-vertex_agent_catalog';
	const orientationTag = `${overviewTool} { compact: true } -> ${catalogTool}`;
	const actionable = artifact.proposals.actionable.slice(
		0,
		MAX_PROPOSALS_PER_FRAGMENT,
	);
	const skills = artifact.skills.slice(0, MAX_SKILLS_PER_FRAGMENT);
	const proposalRows = actionable
		.map(
			(proposal) =>
				`| ${backtickId(proposal.id)} | ${escapeMarkdownPipe(
					truncateSummary(proposal.title, 56),
				)} | ${proposal.kind} | ${proposal.status} |`,
		)
		.join('\n');
	const skillRows = skills
		.map(
			(skill) =>
				`| ${backtickId(skill.id)} | ${escapeMarkdownPipe(
					truncateSummary(skill.summary, 88),
				)} |`,
		)
		.join('\n');
	const beginMarker =
		'{/* BEGIN GENERATED: f00056 S4 - regenerate with `bun run catalog:hints`. Do not edit by hand. */}';
	const generatedAtComment = `{/* Generated at: ${generatedAt}. Source: ${DEFAULT_INPUT_PATH}. */}`;
	const endMarker = '{/* END GENERATED: f00056 S4 */}';
	const orientation = `Canonical first move: call ${backtickId(
		orientationTag,
	)} whenever you need to`;
	return [
		beginMarker,
		generatedAtComment,
		'',
		'## Discovery (canonical, generated)',
		'',
		orientation,
		'route work to a tool, a skill, or an actionable proposal. The catalog',
		'snapshot is byte-identical across reruns and is regenerated whenever',
		'the live registry, the skill manifest, or the proposal index drift.',
		'',
		'### Actionable proposals',
		'',
		'| id | title | kind | status |',
		'| --- | --- | --- | --- |',
		proposalRows.length > 0 ? proposalRows : '| _(none yet)_ | | | |',
		'',
		'### Top skills (from skills/manifest.json)',
		'',
		'| skill id | when to use |',
		'| --- | --- |',
		skillRows.length > 0 ? skillRows : '| _(none yet)_ | |',
		'',
		endMarker,
		'',
	].join('\n');
};

const HOSTS: readonly IHostHint[] = [
	{
		id: 'copilot',
		filename: 'copilot-instructions.generated.md',
		render: (input) =>
			[
				'{/* Auto-generated discovery fragment for GitHub Copilot Chat. */}',
				'{/* Regenerate with `bun run catalog:hints`. Do not edit by hand. */}',
				'',
				renderCommonBlock(input),
				'',
				'> Drop this fragment into `.github/copilot-instructions.md` by',
				'> referencing it (or by copying the discovery block above into the',
				'> bottom of the human-edited file). The host file keeps the',
				'> status-marker / orchestration prose; only the discovery surface',
				'> is generated.',
			].join('\n'),
	},
	{
		id: 'claude',
		filename: 'claude.generated.md',
		render: (input) =>
			[
				'{/* Auto-generated discovery fragment for Claude Code. */}',
				'{/* Regenerate with `bun run catalog:hints`. Do not edit by hand. */}',
				'',
				renderCommonBlock(input),
				'',
				'> Drop this fragment into `CLAUDE.md` by referencing it. Keep the',
				'> keep-the-main-thread-cheap narrative in the human-edited file;',
				'> only the discovery surface is generated.',
			].join('\n'),
	},
	{
		id: 'agents',
		filename: 'agents.generated.md',
		render: (input) =>
			[
				'{/* Auto-generated discovery fragment for AGENTS.md-compatible hosts (Cursor, Aider, generic). */}',
				'{/* Regenerate with `bun run catalog:hints`. Do not edit by hand. */}',
				'',
				renderCommonBlock(input),
				'',
				'> Drop this fragment into `AGENTS.md` by referencing it (or by',
				'> copying the discovery block). The host file keeps the invariants',
				'> and conventions narrative; only the discovery surface is',
				'> generated.',
			].join('\n'),
	},
];

const resolveGeneratedAt = (
	artifactGeneratedAt: string,
	io: IRenderIo,
): string => {
	const fixed =
		io.fixedGeneratedAt ??
		process.env.AGENT_CATALOG_FIXED_NOW ??
		artifactGeneratedAt;
	const parsed = new Date(fixed);
	if (Number.isNaN(parsed.getTime())) {
		throw new Error(
			`render-host-hints: fixedGeneratedAt is not a valid ISO date: ${fixed}`,
		);
	}
	return parsed.toISOString();
};

export const renderHostHints = (
	options: IRenderHostHintsOptions,
): IRenderHostHintsResult => {
	const hosts = options.hosts ?? HOSTS;
	const warnings: string[] = [];
	const generatedAt = options.generatedAt ?? options.artifact.generatedAt;
	const input: IRenderInput = {
		artifact: options.artifact,
		generatedAt,
	};
	const fragments: IRenderOutput[] = [];
	let totalBytes = 0;
	for (const host of hosts) {
		const body = host.render(input);
		const text = body.endsWith('\n') ? body : `${body}\n`;
		if (text.length > MAX_FRAGMENT_BYTES) {
			warnings.push(
				`fragment ${host.id} exceeds ${MAX_FRAGMENT_BYTES}B (${text.length}B); trim MAX_* constants`,
			);
		}
		totalBytes += text.length;
		fragments.push({ id: host.id, filename: host.filename, text });
	}
	return { fragments, warnings, bytes: totalBytes };
};

const defaultIo = (): IRenderIo => ({
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

const parseJsonArtifact = async (
	inputPath: string,
	readText: IRenderIo['readText'],
): Promise<IArtifactLike> => {
	const raw = await readText(inputPath);
	if (raw === undefined) {
		throw new Error(
			`render-host-hints: catalog artifact missing: ${inputPath}`,
		);
	}
	try {
		return JSON.parse(raw) as IArtifactLike;
	} catch (error) {
		throw new Error(
			`render-host-hints: catalog artifact is not valid JSON: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	}
};

export interface IRunHostHintsResult {
	readonly exitCode: number;
	readonly fragments: readonly IRenderOutput[];
	readonly warnings: readonly string[];
	readonly outputDir: string;
	readonly inputPath: string;
	readonly changed: boolean;
}

export const parseRenderArgs = (
	argv: readonly string[],
	cwd: string,
): { readonly root: string; readonly check: boolean } => {
	let root = cwd;
	let check = false;
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
		throw new Error(`unknown argument: ${arg}`);
	}
	return { root, check };
};

export const runHostHintsCli = async (
	argv: readonly string[],
	ioOverrides: Partial<IRenderIo> = {},
): Promise<IRunHostHintsResult> => {
	const io = { ...defaultIo(), ...ioOverrides } satisfies IRenderIo;
	const { root, check } = parseRenderArgs(argv, process.cwd());
	const inputPath = join(root, DEFAULT_INPUT_PATH);
	const outputDir = join(root, DEFAULT_OUTPUT_DIR);
	const warningsPath = join(root, DEFAULT_WARNINGS_PATH);
	const artifact = await parseJsonArtifact(inputPath, io.readText);
	const generatedAt = resolveGeneratedAt(artifact.generatedAt, io);
	const result = renderHostHints({ artifact, generatedAt });
	let changed = false;
	for (const fragment of result.fragments) {
		const target = join(outputDir, fragment.filename);
		const existing = await io.readText(target);
		if (existing !== fragment.text) {
			changed = true;
			if (!check) {
				await io.ensureDir(dirname(target));
				await io.writeText(target, fragment.text);
			}
		}
	}
	if (result.warnings.length === 0) {
		await io.removeFile(warningsPath);
	} else {
		await io.ensureDir(dirname(warningsPath));
		await io.writeText(
			warningsPath,
			`${result.warnings.map((line) => `- ${line}`).join('\n')}\n`,
		);
		for (const warning of result.warnings) io.warn(warning);
	}
	if (check) {
		if (changed) {
			io.error(
				'host hints are stale - run `bun run catalog:hints` and commit the regenerated fragments.',
			);
			return {
				exitCode: 1,
				fragments: result.fragments,
				warnings: result.warnings,
				outputDir,
				inputPath,
				changed: true,
			};
		}
		io.info('host hints up to date.');
		return {
			exitCode: 0,
			fragments: result.fragments,
			warnings: result.warnings,
			outputDir,
			inputPath,
			changed: false,
		};
	}
	io.info(
		changed
			? `regenerated host hints under ${outputDir}`
			: `host hints already up to date under ${outputDir}`,
	);
	return {
		exitCode: 0,
		fragments: result.fragments,
		warnings: result.warnings,
		outputDir,
		inputPath,
		changed,
	};
};

if (import.meta.main) {
	try {
		const result = await runHostHintsCli(process.argv.slice(2));
		process.exit(result.exitCode);
	} catch (error) {
		console.error(
			`render-host-hints: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
		process.exit(2);
	}
}
