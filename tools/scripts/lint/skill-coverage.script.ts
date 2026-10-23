#!/usr/bin/env bun
/**
 * skill-coverage.script.ts — which registered tools no skill explains.
 *
 * A tool a skill names in its frontmatter `tools` is covered. The report
 * lists the tools (and the plugins that own them) that are not, ranked by
 * the use usage-tracking recorded, so the next skill goes where agents call
 * the most. It is a ratchet: the count of uncovered tools may only fall,
 * and a lower count is written to the baseline with `--update`.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { extractSkillToolRefs } from '@delendai/core/cli';
import { parseCliArgs } from '@delendai/core/plugin';
import { assembleCliConfig } from '@delendai/core/public';

export interface IRegisteredTool {
	readonly name: string;
	readonly plugin: string;
}

export interface IUncoveredTool extends IRegisteredTool {
	readonly uses: number;
}

export interface IUncoveredPlugin {
	readonly plugin: string;
	readonly tools: number;
	readonly uses: number;
}

export interface ISkillCoverage {
	readonly tools: readonly IUncoveredTool[];
	readonly plugins: readonly IUncoveredPlugin[];
}

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const BASELINE_PATH = join(
	REPO_ROOT,
	'tools/scripts/lint/skill-coverage.baseline.json',
);
const USAGE_PATH = join(
	REPO_ROOT,
	'.cache/delendai/results/usage-tracking/invocations.jsonl',
);
const TOP = 15;

/** The name a usage record is keyed by: the core tools record `core`. */
const usageKey = (plugin: string, tool: string): string =>
	`${plugin === 'delendai' ? 'core' : plugin}/${tool}`;

/** A catalogue name without its `delendai_` and plugin prefix. */
const bareToolName = (tool: IRegisteredTool): string => {
	const withoutServer = tool.name.replace(/^delendai_/u, '');
	return withoutServer.startsWith(`${tool.plugin}_`)
		? withoutServer.slice(tool.plugin.length + 1)
		: withoutServer;
};

/** Calls per plugin/tool from an `invocations.jsonl` text. */
export const countUses = (jsonl: string): ReadonlyMap<string, number> => {
	const uses = new Map<string, number>();
	for (const line of jsonl.split('\n')) {
		if (line.trim() === '') continue;
		try {
			const record = JSON.parse(line) as {
				plugin?: unknown;
				tool?: unknown;
			};
			if (
				typeof record.plugin !== 'string' ||
				typeof record.tool !== 'string'
			)
				continue;
			const key = `${record.plugin}/${record.tool}`;
			uses.set(key, (uses.get(key) ?? 0) + 1);
		} catch {
			// A torn last line of an append-only log is not a finding.
		}
	}
	return uses;
};

/** The registered tools no skill names, and their plugins, most used first. */
export const rankUncovered = (
	registered: readonly IRegisteredTool[],
	covered: ReadonlySet<string>,
	uses: ReadonlyMap<string, number>,
): ISkillCoverage => {
	const tools = registered
		.filter((tool) => !covered.has(tool.name))
		.map((tool) => ({
			...tool,
			uses: uses.get(usageKey(tool.plugin, bareToolName(tool))) ?? 0,
		}))
		.sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name));
	const byPlugin = new Map<string, { tools: number; uses: number }>();
	for (const tool of tools) {
		const entry = byPlugin.get(tool.plugin) ?? { tools: 0, uses: 0 };
		byPlugin.set(tool.plugin, {
			tools: entry.tools + 1,
			uses: entry.uses + tool.uses,
		});
	}
	const plugins = [...byPlugin]
		.map(([plugin, entry]) => ({ plugin, ...entry }))
		.sort((a, b) => b.uses - a.uses || a.plugin.localeCompare(b.plugin));
	return { tools, plugins };
};

/** Every tool a skill under `plugins` or the core names. */
export const coveredTools = async (
	root: string,
): Promise<ReadonlySet<string>> => {
	const folders = [join(root, 'packages/core/skills')];
	for (const plugin of await readdir(join(root, 'plugins')).catch(
		() => [] as string[],
	))
		folders.push(join(root, 'plugins', plugin, 'skills'));
	const covered = new Set<string>();
	for (const folder of folders)
		for (const skill of await readdir(folder).catch(() => [] as string[])) {
			const body = await readFile(
				join(folder, skill, 'SKILL.md'),
				'utf8',
			).catch(() => '');
			for (const tool of extractSkillToolRefs(body).tools)
				covered.add(tool);
		}
	return covered;
};

const loadRegisteredTools = async (): Promise<readonly IRegisteredTool[]> => {
	const { agentCatalogTools } = await assembleCliConfig(
		parseCliArgs(['--preset=swarm'], REPO_ROOT),
		{ readFile: (path) => readFile(path, 'utf8').catch(() => undefined) },
	);
	return agentCatalogTools.map((tool) => ({
		name: tool.name,
		plugin: tool.plugin ?? 'delendai',
	}));
};

const readBaseline = async (): Promise<number | undefined> => {
	const text = await readFile(BASELINE_PATH, 'utf8').catch(() => undefined);
	if (text === undefined) return undefined;
	const parsed = JSON.parse(text) as { uncoveredTools?: unknown };
	return typeof parsed.uncoveredTools === 'number'
		? parsed.uncoveredTools
		: undefined;
};

export const main = async (argv: readonly string[]): Promise<number> => {
	const registered = await loadRegisteredTools();
	const usagePath =
		argv
			.find((arg) => arg.startsWith('--usage='))
			?.slice('--usage='.length) ?? USAGE_PATH;
	const uses = countUses(await readFile(usagePath, 'utf8').catch(() => ''));
	const report = rankUncovered(
		registered,
		await coveredTools(REPO_ROOT),
		uses,
	);
	console.log(
		`skill-coverage: ${report.tools.length} of ${registered.length} registered tools have no skill, across ${report.plugins.length} plugins.`,
	);
	console.log('  most used first (plugin: tools without a skill, calls):');
	for (const plugin of report.plugins.slice(0, TOP))
		console.log(
			`    ${plugin.plugin}: ${plugin.tools} tools, ${plugin.uses} calls`,
		);

	const baseline = await readBaseline();
	if (argv.includes('--update')) {
		if (baseline !== undefined && report.tools.length > baseline) {
			console.error(
				`✖ skill-coverage: the baseline (${baseline}) may only fall, not rise to ${report.tools.length}.`,
			);
			return 1;
		}
		await writeFile(
			BASELINE_PATH,
			`{\n\t"uncoveredTools": ${report.tools.length}\n}\n`,
		);
		return 0;
	}
	if (baseline === undefined) {
		console.error(
			'✖ skill-coverage: no baseline; run with --update to record one.',
		);
		return 1;
	}
	if (report.tools.length > baseline) {
		console.error(
			`✖ skill-coverage: ${report.tools.length} tools have no skill, the baseline allows ${baseline}. Name the new tools in a skill's \`tools\`.`,
		);
		return 1;
	}
	if (report.tools.length < baseline)
		console.log(
			`  the count fell below the baseline (${baseline}); run with --update to lock it in.`,
		);
	return 0;
};

if (import.meta.main) {
	process.exit(await main(process.argv.slice(2)));
}
