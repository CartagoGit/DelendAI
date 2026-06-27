import { z } from 'zod';
import { join } from 'node:path';
import { stat } from 'node:fs/promises';

import type {
	IFileReader,
	IToolRegistration,
	IWorkspacePathProvider,
} from '@mcp-vertex/core/public';
import { toolError, toolJson } from '@mcp-vertex/core/public';

import { buildManifestViaComposition } from '../frameworks/manifest-via-composition';
import { buildDefaultComposition } from '../frameworks/registry/factory';
import {
	PRESET_BY_ID,
	REQUIRED_ESLINT_DEPS,
	SUPPORTED_PRESET_IDS,
} from '../frameworks/presets';
import type {
	IAreaRules,
	IRulesManifest,
	IRulesMode,
} from '../frameworks/types';
import { RULES_MODE_GUIDANCE } from '../frameworks/types';
import { DogmaRegistry } from '../registry/dogma-registry';
import { DEFAULT_DOGMA_ADAPTERS } from '../frameworks/dogmas';

export interface IRulesToolOptions {
	readonly namespacePrefix: string;
	readonly workspace: IWorkspacePathProvider;
	readonly reader: IFileReader;
	readonly projectName: string;
	readonly cacheRelDir: string;
	readonly manifestRelPath: string;
	readonly mode: IRulesMode;
	readonly overrides?: Readonly<Record<string, string>>;
}

const DOGMA_ADAPTER_SCHEMA = z.object({
	language: z.string(),
	displayName: z.string().optional(),
	version: z.string(),
	packageManager: z.string(),
	ownership: z.string(),
	errorModel: z.string(),
	nullSafety: z.string(),
	naming: z.string(),
	async: z.string(),
	visibility: z.string(),
	immutability: z.string(),
	testing: z.string(),
	bullets: z.array(z.string()),
});

const AREA_RULES_SCHEMA = z.object({
	framework: z.string(),
	presetId: z.string(),
	eslint: z.array(z.string()),
	configs: z.array(z.string()).optional(),
	typecheck: z.array(z.string()),
	reason: z.string(),
});

const loadManifest = async (
	options: IRulesToolOptions,
): Promise<IRulesManifest> => {
	const raw = await options.reader.readFile(options.manifestRelPath);
	if (raw !== undefined) {
		try {
			return JSON.parse(raw) as IRulesManifest;
		} catch {
			// fall through to a freshly-built manifest
		}
	}
	const composition = buildDefaultComposition();
	return await buildManifestViaComposition(
		options.reader,
		options.projectName,
		options.cacheRelDir,
		options.mode,
		composition,
		options.overrides ?? {},
	);
};

const areasOf = (
	manifest: IRulesManifest,
): ReadonlyArray<{ project: string; area: string; rules: IAreaRules }> => {
	const out: Array<{ project: string; area: string; rules: IAreaRules }> = [];
	for (const [project, areas] of Object.entries(manifest.projects)) {
		for (const [area, rules] of Object.entries(areas)) {
			out.push({ project, area, rules });
		}
	}
	return out;
};

const conventionsFor = (
	manifest: IRulesManifest,
): Readonly<Record<string, readonly string[]>> => {
	const out: Record<string, readonly string[]> = {};
	for (const { rules } of areasOf(manifest)) {
		const preset = PRESET_BY_ID.get(rules.presetId);
		if (preset) out[preset.id] = preset.conventions;
	}
	return out;
};

const areaTarget = (areaDir: string): string =>
	areaDir === 'root' ? '.' : areaDir;

const renderCommand = (template: string, areaDir: string): string =>
	template.replace(/\{target\}/g, areaTarget(areaDir));

const eslintCommand = (areaDir: string, rules: IAreaRules): string => {
	const target = areaTarget(areaDir);
	const configsList = rules.configs ?? rules.eslint;
	const projectOwns = configsList.length > 1;
	return projectOwns
		? `eslint ${target}`
		: `eslint ${target} --config ${configsList[0]}`;
};

const lintCheckCommand = (areaDir: string, rules: IAreaRules): string => {
	const preset = PRESET_BY_ID.get(rules.presetId);
	if (preset?.checkCommand !== undefined) {
		return renderCommand(preset.checkCommand, areaDir);
	}
	if (preset?.linter === 'pint') return './vendor/bin/pint --test';
	return eslintCommand(areaDir, rules);
};

const lintFixCommand = (areaDir: string, rules: IAreaRules): string => {
	const preset = PRESET_BY_ID.get(rules.presetId);
	if (preset?.fixCommand !== undefined) {
		return renderCommand(preset.fixCommand, areaDir);
	}
	if (preset?.linter === 'pint') return './vendor/bin/pint';
	return `${eslintCommand(areaDir, rules)} --fix`;
};

const readDeps = async (
	reader: IFileReader,
	areaDir: string,
): Promise<Record<string, string>> => {
	const out: Record<string, string> = {};
	for (const rel of [
		'package.json',
		areaDir === 'root' || areaDir === '' ? '' : `${areaDir}/package.json`,
	]) {
		if (rel === '') continue;
		const raw = await reader.readFile(rel);
		if (raw === undefined) continue;
		try {
			const pkg = JSON.parse(raw) as {
				dependencies?: Record<string, string>;
				devDependencies?: Record<string, string>;
			};
			Object.assign(
				out,
				pkg.dependencies ?? {},
				pkg.devDependencies ?? {},
			);
		} catch {
			// ignore
		}
	}
	return out;
};

const commandExists = async (cmd: string): Promise<boolean> => {
	if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
		return true;
	}
	const pathEnv = process.env.PATH || '';
	const dirs = pathEnv.split(':');
	for (const dir of dirs) {
		try {
			await stat(join(dir, cmd));
			return true;
		} catch {
			// ignore
		}
	}
	return false;
};

const missingLinterDeps = async (
	reader: IFileReader,
	areaDir: string,
	presetId: string,
): Promise<readonly string[]> => {
	const preset = PRESET_BY_ID.get(presetId);
	const required =
		preset?.requiredLinterDeps ?? REQUIRED_ESLINT_DEPS[presetId] ?? [];
	if (required.length === 0) return [];
	const linter = preset?.linter ?? 'eslint';
	if (linter === 'eslint' || linter === 'pint') {
		const deps = await readDeps(reader, areaDir);
		return required.filter((d) => !(d in deps));
	}
	const missing: string[] = [];
	for (const binary of required) {
		if (!(await commandExists(binary))) {
			missing.push(binary);
		}
	}
	return missing;
};

const missingLinterFinding = (input: {
	readonly project: string;
	readonly area: string;
	readonly framework: string;
	readonly command: string;
	readonly missing: readonly string[];
}): {
	readonly code: 'missing-linter-deps';
	readonly severity: 'warning';
	readonly project: string;
	readonly area: string;
	readonly framework: string;
	readonly message: string;
	readonly missing: readonly string[];
	readonly nextAction: string;
} | null => {
	if (input.missing.length === 0) return null;
	return {
		code: 'missing-linter-deps',
		severity: 'warning',
		project: input.project,
		area: input.area,
		framework: input.framework,
		message: `The linter command cannot run until ${input.missing.join(', ')} ${input.missing.length === 1 ? 'is' : 'are'} installed.`,
		missing: input.missing,
		nextAction: `Install the missing dependencies, then run \`${input.command}\`.`,
	};
};

const getInstallHint = (presetId: string): string => {
	const preset = PRESET_BY_ID.get(presetId);
	const linter = preset?.linter ?? 'eslint';
	if (linter === 'eslint') return 'npm install --save-dev eslint';
	if (linter === 'pint') return 'composer require laravel/pint --dev';
	if (linter === 'ruff') return 'pip install ruff basedpyright';
	if (linter === 'golangci-lint')
		return 'go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest';
	if (linter === 'clippy') return 'rustup component add clippy';
	if (linter === 'rubocop') return 'gem install rubocop';
	if (linter === 'checkstyle') return 'brew install checkstyle';
	if (linter === 'ktlint') return 'brew install ktlint';
	if (linter === 'swiftlint') return 'brew install swiftlint';
	if (linter === 'hlint') return 'cabal install hlint';
	if (linter === 'shellcheck') return 'apt install shellcheck';
	if (linter === 'buf') return 'npm install -g @buf/buf';
	return `install ${linter}`;
};

const typecheckCommand = (
	areaDir: string,
	rules: IAreaRules,
): string | undefined => {
	const preset = PRESET_BY_ID.get(rules.presetId);
	if (preset?.typecheckCommand !== undefined) {
		return renderCommand(preset.typecheckCommand, areaDir);
	}
	if (rules.typecheck.length === 0) return undefined;
	const projectTsconfig = rules.typecheck.find((p) => !p.includes('.cache/'));
	return `tsc --noEmit -p ${projectTsconfig ?? rules.typecheck[0]}`;
};

export const buildGetRulesRegistration = (
	options: IRulesToolOptions,
): IToolRegistration => ({
	id: 'get_rules',
	summary:
		'Returns the rules map (per area: framework, configs+typecheck configs project-first), the mode, conventions, and language dogmas.',
	tags: ['rules', 'orientation'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_get_rules`,
			{
				description:
					'Returns the lint/type rules map: per project area its framework, configs, enforcement mode, supported presets, per-framework conventions, and language dogmas. Read-only.',
				inputSchema: z.object({ area: z.string().optional() }),
				outputSchema: z.object({
					mode: z.string(),
					modeGuidance: z.string(),
					supported: z.array(z.string()),
					areas: z.array(
						z.object({
							project: z.string(),
							area: z.string(),
							rules: AREA_RULES_SCHEMA,
						}),
					),
					conventions: z.record(z.string(), z.array(z.string())),
					dogmas: z.record(z.string(), DOGMA_ADAPTER_SCHEMA),
				}),
			},
			async (args: { area?: string | undefined }) => {
				const manifest = await loadManifest(options);
				const all = areasOf(manifest);
				const selected =
					args.area !== undefined
						? all.filter((entry) => entry.area === args.area)
						: all;

				const dogmaRegistry = new DogmaRegistry(DEFAULT_DOGMA_ADAPTERS);
				const dogmas: Record<string, any> = {};
				for (const entry of selected) {
					const preset = PRESET_BY_ID.get(entry.rules.presetId);
					if (preset) {
						const dogma = dogmaRegistry.resolve(preset.language);
						if (dogma) {
							dogmas[entry.area] = dogma;
						}
					}
				}

				return toolJson({
					mode: manifest.mode,
					modeGuidance: RULES_MODE_GUIDANCE[manifest.mode],
					supported: SUPPORTED_PRESET_IDS,
					areas: selected,
					conventions: conventionsFor(manifest),
					dogmas,
				});
			},
		);
	},
});

export const buildCheckRulesRegistration = (
	options: IRulesToolOptions,
): IToolRegistration => ({
	id: 'check_rules',
	summary:
		'Returns, per area, the linter command and resolved configs to validate compliance.',
	tags: ['rules'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_check_rules`,
			{
				description:
					'Returns how to check each area against its rules: the resolved linter configs, the installHint, and the exact command to run. Advisory and agnostic.',
				inputSchema: z.object({
					area: z.string().optional(),
					compact: z.boolean().optional(),
				}),
				outputSchema: z.object({
					compact: z.boolean(),
					checks: z.array(
						z.object({
							project: z.string(),
							area: z.string(),
							framework: z.string(),
							eslintConfigs: z.array(z.string()).optional(),
							linterConfigs: z.array(z.string()).optional(),
							typecheckConfigs: z.array(z.string()).optional(),
							command: z.string(),
							typecheckCommand: z.string().optional(),
							missingEslintDeps: z.array(z.string()),
							missingLinterDeps: z.array(z.string()),
							linter: z.string(),
							installHint: z.string(),
						}),
					),
					findings: z.array(
						z.object({
							code: z.enum([
								'missing-linter-deps',
								'missing-eslint-deps',
							]),
							severity: z.literal('warning'),
							project: z.string(),
							area: z.string(),
							framework: z.string(),
							message: z.string(),
							missing: z.array(z.string()),
							nextAction: z.string(),
						}),
					),
				}),
			},
			async (args: {
				area?: string | undefined;
				compact?: boolean | undefined;
			}) => {
				const manifest = await loadManifest(options);
				const all = areasOf(manifest);
				const selected =
					args.area !== undefined
						? all.filter((entry) => entry.area === args.area)
						: all;
				if (selected.length === 0) {
					return toolError(
						`no area "${args.area}" in the rules map`,
						'Call get_rules to list areas.',
					);
				}
				const compact = args.compact === true;
				const checks = await Promise.all(
					selected.map(async (entry) => {
						const command = lintCheckCommand(
							entry.area,
							entry.rules,
						);
						const missing = await missingLinterDeps(
							options.reader,
							entry.area,
							entry.rules.presetId,
						);
						const preset = PRESET_BY_ID.get(entry.rules.presetId);
						const linterName = preset?.linter ?? 'eslint';
						const configsList =
							entry.rules.configs ?? entry.rules.eslint;
						return {
							project: entry.project,
							area: entry.area,
							framework: entry.rules.framework,
							...(compact
								? {}
								: {
										eslintConfigs: entry.rules.eslint,
										linterConfigs: configsList,
										typecheckConfigs: entry.rules.typecheck,
									}),
							command,
							typecheckCommand: typecheckCommand(
								entry.area,
								entry.rules,
							),
							missingEslintDeps: Array.from(missing),
							missingLinterDeps: Array.from(missing),
							linter: linterName,
							installHint: getInstallHint(entry.rules.presetId),
						};
					}),
				);
				return toolJson({
					compact,
					checks,
					findings: checks
						.map((check) => {
							const finding = missingLinterFinding({
								project: check.project,
								area: check.area,
								framework: check.framework,
								command: check.command,
								missing: check.missingLinterDeps,
							});
							if (finding === null) return null;
							return {
								...finding,
								code: 'missing-linter-deps' as const,
							};
						})
						.filter((finding) => finding !== null),
				});
			},
		);
	},
});

export const buildApplyRulesRegistration = (
	options: IRulesToolOptions,
): IToolRegistration => ({
	id: 'apply_rules',
	summary: 'Returns a mode-aware plan to make code comply.',
	tags: ['rules'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_apply_rules`,
			{
				description:
					'Returns a plan to bring an area into compliance. The project’s own config always wins.',
				inputSchema: z.object({
					area: z.string().optional(),
					files: z.array(z.string()).optional(),
				}),
				outputSchema: z.object({
					mode: z.string(),
					modeGuidance: z.string(),
					area: z.string(),
					framework: z.string(),
					eslintConfigs: z.array(z.string()),
					linterConfigs: z.array(z.string()),
					command: z.string(),
					fixCommand: z.string(),
					steps: z.array(z.string()),
				}),
			},
			async (args: {
				area?: string | undefined;
				files?: string[] | undefined;
			}) => {
				const manifest = await loadManifest(options);
				const all = areasOf(manifest);
				const entry =
					args.area !== undefined
						? all.find((candidate) => candidate.area === args.area)
						: all[0];
				if (entry === undefined) {
					return toolError(
						'no matching area',
						'Call get_rules to list areas.',
					);
				}
				const mode = manifest.mode;
				const command = lintCheckCommand(entry.area, entry.rules);
				const fixCommand = lintFixCommand(entry.area, entry.rules);
				const scope =
					args.files && args.files.length > 0
						? args.files.join(' ')
						: entry.area === 'root'
							? '.'
							: entry.area;
				const steps =
					mode === 'none'
						? [
								`Run \`${command}\` and report violations. Do not edit.`,
							]
						: mode === 'proposal'
							? [
									`Run \`${command}\` to collect violations.`,
									'Create a proposal (proposals plugin) describing the fixes; do not edit directly.',
								]
							: mode === 'strict'
								? [
										`Run \`${fixCommand}\` to auto-fix.`,
										'Manually resolve the remaining violations.',
										`Re-run \`${command}\` until clean.`,
									]
								: [
										`For the files you touched (${scope}): run \`${fixCommand}\`.`,
										'Align only those files; leave untouched files as-is.',
									];
				const configsList = entry.rules.configs ?? entry.rules.eslint;
				return toolJson({
					mode,
					modeGuidance: RULES_MODE_GUIDANCE[mode],
					area: entry.area,
					framework: entry.rules.framework,
					eslintConfigs: entry.rules.eslint,
					linterConfigs: configsList,
					command,
					fixCommand,
					steps,
				});
			},
		);
	},
});
