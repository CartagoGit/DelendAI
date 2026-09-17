/**
 * `<prefix>_conventions_check_architecture` — report imports that break the
 * declared layer graph (f00549 S4).
 *
 * Each rule names the lint that enforces it and the detector that
 * reproduces that lint; the report is only as trustworthy as that
 * agreement, which a parity spec holds. Read-only. Existing debt stays
 * visible through `baseline`: pass the `baselineKey` of findings you
 * accept, and only the rest count as new. Every detector reports how many
 * files it read, because "0 findings" over 0 files is not a result.
 */
import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';
import { toolOk } from '@delendai/core/public';

import {
	MAX_ARCHITECTURE_FINDINGS,
	ARCHITECTURE_SKIPPED_DIRECTORIES,
} from '../contracts/constants/import-detectors.constant';
import type {
	IArchitectureDetectorSample,
	IArchitectureFinding,
	IArchitectureReader,
	ICheckArchitectureArgs,
	ICheckArchitectureToolOptions,
} from '../contracts/interfaces/check-architecture.interface';
import type { ILayerRule } from '../contracts/interfaces/layer-graph.interface';
import { LAYER_GRAPH, layerOf } from '../layers/layer-graph.service';
import { allImportDetectors } from '../services/import-detectors.service';

const OUTPUT_SCHEMA = z.object({
	ok: z.boolean(),
	filesScanned: z.number(),
	detectors: z.array(
		z.object({
			detector: z.string(),
			enforcedBy: z.string(),
			filesInScope: z.number(),
			findings: z.number(),
		}),
	),
	total: z.number(),
	newCount: z.number(),
	baselinedCount: z.number(),
	findings: z.array(
		z.object({
			file: z.string(),
			line: z.number(),
			specifier: z.string(),
			rule: z.string(),
			enforcedBy: z.string(),
			because: z.string(),
			baselineKey: z.string(),
			baselined: z.boolean(),
		}),
	),
	truncated: z.boolean(),
	diagnostic: z.string().optional(),
});

const walk = async (
	reader: IArchitectureReader,
	roots: readonly string[],
): Promise<{ readonly files: string[]; readonly missingRoots: string[] }> => {
	const files: string[] = [];
	const missingRoots: string[] = [];
	const stack = [...roots];
	const rootSet = new Set(roots);
	while (stack.length > 0) {
		const dir = stack.pop() ?? '';
		let entries: readonly { name: string; isDirectory: boolean }[];
		try {
			entries = await reader.list(dir);
		} catch {
			if (rootSet.has(dir)) missingRoots.push(dir);
			continue;
		}
		for (const entry of entries) {
			const rel = dir === '' ? entry.name : `${dir}/${entry.name}`;
			if (entry.isDirectory) {
				if (!ARCHITECTURE_SKIPPED_DIRECTORIES.has(entry.name))
					stack.push(rel);
			} else {
				files.push(rel);
			}
		}
	}
	return { files: files.sort((a, b) => a.localeCompare(b)), missingRoots };
};

/** The rule a finding belongs to: the one for the file's own layer, if any. */
const ruleFor = (
	rules: readonly ILayerRule[],
	file: string,
): ILayerRule | undefined => {
	const layer = layerOf(file);
	return rules.find((rule) => rule.from === layer) ?? rules[0];
};

export const runCheckArchitecture = async (
	args: ICheckArchitectureArgs,
	options: ICheckArchitectureToolOptions,
) => {
	const roots =
		args.roots !== undefined && args.roots.length > 0
			? args.roots
			: (options.defaultRoots ?? ['']);
	const { files, missingRoots } = await walk(options.reader, roots);
	const baseline = new Set(args.baseline ?? []);
	const detectors = allImportDetectors()
		.map((detector) => ({
			detector,
			rules: LAYER_GRAPH.rules.filter(
				(rule) =>
					rule.detector === detector.id && rule.unenforced !== true,
			),
		}))
		.filter((entry) => entry.rules.length > 0);

	const findings: IArchitectureFinding[] = [];
	const samples: IArchitectureDetectorSample[] = [];
	let filesScanned = 0;
	const counts = new Map<string, { files: number; findings: number }>();
	for (const file of files) {
		const applicable = detectors.filter(({ detector }) =>
			detector.inScope(file),
		);
		if (applicable.length === 0) continue;
		const text = await options.reader.readText(file);
		if (text === undefined) continue;
		filesScanned += 1;
		for (const { detector, rules } of applicable) {
			const count = counts.get(detector.id) ?? { files: 0, findings: 0 };
			count.files += 1;
			for (const hit of detector.detect(text)) {
				const rule = ruleFor(rules, file);
				if (rule === undefined) continue;
				const baselineKey = `${file}:${hit.specifier}:${rule.enforcedBy}`;
				findings.push({
					file,
					line: hit.line,
					specifier: hit.specifier,
					rule: rule.forbids,
					enforcedBy: rule.enforcedBy,
					because: rule.because,
					baselineKey,
					baselined: baseline.has(baselineKey),
				});
				count.findings += 1;
			}
			counts.set(detector.id, count);
		}
	}
	for (const { detector, rules } of detectors) {
		const count = counts.get(detector.id) ?? { files: 0, findings: 0 };
		samples.push({
			detector: detector.id,
			enforcedBy: rules[0]?.enforcedBy ?? '',
			filesInScope: count.files,
			findings: count.findings,
		});
	}

	const baselinedCount = findings.filter(
		(finding) => finding.baselined,
	).length;
	let diagnostic: string | undefined;
	if (filesScanned === 0) {
		diagnostic =
			missingRoots.length > 0
				? `scanned 0 files: roots do not exist in this workspace: ${missingRoots.join(', ')}.`
				: `scanned 0 files any enforcing lint reads under roots [${roots.map((root) => root || '.').join(', ')}]; an empty report is not evidence of a clean tree.`;
	}
	return toolOk({
		filesScanned,
		detectors: samples,
		total: findings.length,
		newCount: findings.length - baselinedCount,
		baselinedCount,
		findings: findings.slice(0, MAX_ARCHITECTURE_FINDINGS),
		truncated: findings.length > MAX_ARCHITECTURE_FINDINGS,
		...(diagnostic === undefined ? {} : { diagnostic }),
	});
};

export const buildCheckArchitectureRegistration = (
	options: ICheckArchitectureToolOptions,
): IToolRegistration => ({
	id: 'conventions_check_architecture',
	tags: ['conventions', 'architecture'],
	summary:
		'Report imports that break the declared layer graph, as the enforcing lints see them.',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_conventions_check_architecture`,
			{
				outputSchema: OUTPUT_SCHEMA,
				description:
					'Read-only. Reports forbidden imports per layer rule, as the lint that enforces each rule would. Pass accepted `baselineKey`s as `baseline` to count only new drift. Each detector reports files read.',
				inputSchema: z.object({
					roots: z.array(z.string()).optional(),
					baseline: z.array(z.string()).optional(),
				}),
			},
			async (args: ICheckArchitectureArgs) =>
				runCheckArchitecture(args, options),
		);
	},
});
