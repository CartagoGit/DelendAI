import { z } from 'zod';

import type {
	IFileReader,
	IToolRegistration,
	IWorkspacePathProvider,
} from '@mcp-vertex/core/public';
import { toolError, toolJson } from '@mcp-vertex/core/public';

import { buildRulesManifest } from '../frameworks/manifest';
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

// l00008 s4 — mirrors `IAreaRules` (frameworks/types.ts) field-for-field,
// replacing the residual `z.object({}).catchall(z.unknown())`.
const AREA_RULES_SCHEMA = z.object({
	framework: z.string(),
	presetId: z.string(),
	eslint: z.array(z.string()),
	typecheck: z.array(z.string()),
	reason: z.string(),
});

/** Read the manifest from cache, or build it in-memory if absent. */
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
	return await buildRulesManifest({
		reader: options.reader,
		projectName: options.projectName,
		cacheRelDir: options.cacheRelDir,
		mode: options.mode,
		...(options.overrides ? { overrides: options.overrides } : {}),
	});
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

/** The area's lint target: `.` at the workspace root, else its dir. */
const areaTarget = (areaDir: string): string =>
	areaDir === 'root' ? '.' : areaDir;

/** Substitute the `{target}` placeholder in a preset command template. */
const renderCommand = (template: string, areaDir: string): string =>
	template.replace(/\{target\}/g, areaTarget(areaDir));

const eslintCommand = (areaDir: string, rules: IAreaRules): string => {
	const target = areaTarget(areaDir);
	// First eslint entry is the project's own config when present; if our
	// cache default is the only one, point ESLint at it explicitly.
	const projectOwns = rules.eslint.length > 1;
	return projectOwns
		? `eslint ${target}`
		: `eslint ${target} --config ${rules.eslint[0]}`;
};

/**
 * Lint check command. f00051 S4: each preset carries its own command
 * template (`checkCommand`); only the JS/TS (`eslint`) and PHP (`pint`)
 * presets fall through to the legacy hardcoded branches, byte-for-byte.
 */
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
	reader: IRulesToolOptions['reader'],
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

/** Required ESLint packages the area is missing (so check won't run). */
const missingEslintDeps = async (
	reader: IRulesToolOptions['reader'],
	areaDir: string,
	presetId: string,
): Promise<readonly string[]> => {
	const required = REQUIRED_ESLINT_DEPS[presetId] ?? [];
	if (required.length === 0) return [];
	const deps = await readDeps(reader, areaDir);
	return required.filter((d) => !(d in deps));
};

const missingEslintFinding = (input: {
	readonly project: string;
	readonly area: string;
	readonly framework: string;
	readonly command: string;
	readonly missing: readonly string[];
}): {
	readonly code: 'missing-eslint-deps';
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
		code: 'missing-eslint-deps',
		severity: 'warning',
		project: input.project,
		area: input.area,
		framework: input.framework,
		message: `The ESLint command cannot run until ${input.missing.join(', ')} ${input.missing.length === 1 ? 'is' : 'are'} installed.`,
		missing: input.missing,
		nextAction: `Install the missing dev dependencies, then run \`${input.command}\`.`,
	};
};

/**
 * Typecheck command for an area, or undefined when the language has no
 * separate typecheck step. f00051 S4: a preset's own `typecheckCommand`
 * template (e.g. `cargo check --workspace`, `go vet ./...`, `basedpyright`)
 * takes precedence; JS/TS presets fall through to the `tsc` path keyed off
 * the resolved tsconfig list.
 */
const typecheckCommand = (
	areaDir: string,
	rules: IAreaRules,
): string | undefined => {
	const preset = PRESET_BY_ID.get(rules.presetId);
	if (preset?.typecheckCommand !== undefined) {
		return renderCommand(preset.typecheckCommand, areaDir);
	}
	if (rules.typecheck.length === 0) return undefined;
	// Prefer the project's own tsconfig (entries not under the cache dir).
	const projectTsconfig = rules.typecheck.find((p) => !p.includes('.cache/'));
	return `tsc --noEmit -p ${projectTsconfig ?? rules.typecheck[0]}`;
};

/** get_rules — the map of which rules apply where, + mode + conventions. */
export const buildGetRulesRegistration = (
	options: IRulesToolOptions,
): IToolRegistration => ({
	id: 'get_rules',
	summary:
		'Returns the rules map (per area: framework, eslint+typecheck configs project-first), the mode and conventions.',
	tags: ['rules', 'orientation'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_get_rules`,
			{
				description:
					'Returns the lint/type rules map: per project area its framework, the ESLint and typecheck configs in priority order (the project’s own config first, our default behind), the enforcement mode, the supported presets and the per-framework conventions. Read-only.',
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
				}),
			},
			async (args: { area?: string | undefined }) => {
				const manifest = await loadManifest(options);
				const all = areasOf(manifest);
				const selected =
					args.area !== undefined
						? all.filter((entry) => entry.area === args.area)
						: all;
				return toolJson({
					mode: manifest.mode,
					modeGuidance: RULES_MODE_GUIDANCE[manifest.mode],
					supported: SUPPORTED_PRESET_IDS,
					areas: selected,
					conventions: conventionsFor(manifest),
				});
			},
		);
	},
});

/** check_rules — how to validate an area (resolved configs + command). */
export const buildCheckRulesRegistration = (
	options: IRulesToolOptions,
): IToolRegistration => ({
	id: 'check_rules',
	summary:
		'Returns, per area, the ESLint command and resolved configs to validate compliance (run it yourself).',
	tags: ['rules'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_check_rules`,
			{
				description:
					'Returns how to check each area against its rules: the resolved ESLint configs (project first) and the exact command to run. Advisory and agnostic — you run the command; it does not execute or modify anything.',
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
							typecheckConfigs: z.array(z.string()).optional(),
							command: z.string(),
							typecheckCommand: z.string().optional(),
							missingEslintDeps: z.array(z.string()),
						}),
					),
					findings: z.array(
						z.object({
							code: z.literal('missing-eslint-deps'),
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
						const missing = await missingEslintDeps(
							options.reader,
							entry.area,
							entry.rules.presetId,
						);
						return {
							project: entry.project,
							area: entry.area,
							framework: entry.rules.framework,
							...(compact
								? {}
								: {
										eslintConfigs: entry.rules.eslint,
										typecheckConfigs: entry.rules.typecheck,
									}),
							command,
							typecheckCommand: typecheckCommand(
								entry.area,
								entry.rules,
							),
							missingEslintDeps: missing,
						};
					}),
				);
				return toolJson({
					compact,
					checks,
					findings: checks
						.map((check) =>
							missingEslintFinding({
								project: check.project,
								area: check.area,
								framework: check.framework,
								command: check.command,
								missing: check.missingEslintDeps,
							}),
						)
						.filter((finding) => finding !== null),
				});
			},
		);
	},
});

/** apply_rules — a mode-aware plan to bring an area into compliance. */
export const buildApplyRulesRegistration = (
	options: IRulesToolOptions,
): IToolRegistration => ({
	id: 'apply_rules',
	summary:
		'Returns a mode-aware plan (strict/mixed/none/proposal) to make code comply; you execute the steps.',
	tags: ['rules'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_apply_rules`,
			{
				description:
					'Returns a plan to bring an area into compliance, shaped by the enforcement mode: strict (fix everything), mixed (only touched files), none (report only), proposal (create proposals). Advisory — you run the steps. The project’s own config always wins.',
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
				return toolJson({
					mode,
					modeGuidance: RULES_MODE_GUIDANCE[mode],
					area: entry.area,
					framework: entry.rules.framework,
					eslintConfigs: entry.rules.eslint,
					command,
					fixCommand,
					steps,
				});
			},
		);
	},
});
