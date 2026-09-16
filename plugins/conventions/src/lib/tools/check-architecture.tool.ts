/**
 * `<prefix>_conventions_check_architecture` — report imports that violate
 * the declared layer graph (f00549 S4).
 *
 * The graph owns explicit matchers for the rules that existing lints enforce.
 * This tool deliberately never interprets `ILayerRule.forbids`: that field is
 * human guidance, while `matcher` is the executable contract. The report is
 * read-only; callers may pass the previous finding keys as a baseline so
 * existing debt stays visible while only regressions are treated as new.
 */
import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';
import { toolError, toolOk } from '@delendai/core/public';

import { layerOf, rulesFor } from '../layers/layer-graph.service';
import type {
	ILayerImportMatcher,
	ILayerRule,
} from '../contracts/interfaces/layer-graph.interface';
import {
	CONVENTION_PROFILE_IDS,
	resolveProfile,
} from '../profiles/profile-registry';

const MAX_FINDINGS_IN_PAYLOAD = 200;
const SOURCE_EXTENSIONS = ['.ts', '.tsx'];
const SKIP_DIRS = new Set([
	'node_modules',
	'dist',
	'build',
	'.git',
	'.cache',
	'coverage',
]);

export interface IArchitectureDirEntry {
	readonly name: string;
	readonly isDirectory: boolean;
}

/** Narrow filesystem port: production supplies SafeWorkspaceReader; tests use memory. */
export interface IArchitectureReader {
	list(relDir: string): Promise<readonly IArchitectureDirEntry[]>;
	readText(relPath: string): Promise<string | undefined>;
}

export interface ICheckArchitectureToolOptions {
	readonly namespacePrefix: string;
	readonly reader: IArchitectureReader;
	readonly defaultRoots?: readonly string[];
}

export interface ICheckArchitectureArgs {
	readonly roots?: readonly string[] | undefined;
	readonly profile?: string | undefined;
	/** Stable finding keys accepted as pre-existing debt. */
	readonly baseline?: readonly string[] | undefined;
}

interface IImportReference {
	readonly line: number;
	readonly specifier: string;
	readonly typeOnly: boolean;
}

interface IArchitectureFinding {
	readonly file: string;
	readonly line: number;
	readonly specifier: string;
	readonly rule: string;
	readonly enforcedBy: string;
	readonly because: string;
	readonly baselineKey: string;
	readonly baselined: boolean;
}

interface IScanResult {
	readonly files: readonly string[];
	readonly missingRoots: readonly string[];
}

const hasSourceExtension = (path: string): boolean =>
	SOURCE_EXTENSIONS.some((extension) => path.endsWith(extension));

const normalizePath = (path: string): string =>
	path.replaceAll('\\', '/').replace(/^\.\//u, '');

const lineAt = (source: string, offset: number): number => {
	let line = 1;
	for (let index = 0; index < offset; index += 1) {
		if (source[index] === '\n') line += 1;
	}
	return line;
};

/** Remove comments while preserving line offsets used in findings. */
const stripComments = (source: string): string =>
	source
		.replace(/\/\*[\s\S]*?\*\//gu, (comment) =>
			comment.replace(/[^\n]/gu, ' '),
		)
		.replace(/\/\/[^\n]*/gu, (comment) => comment.replace(/[^\n]/gu, ' '));

const isTypeOnlyImport = (source: string, offset: number): boolean => {
	const statementStart = Math.max(
		source.lastIndexOf(';', offset - 1),
		source.lastIndexOf('\n', offset - 1) - 1_000,
	);
	const statement = source.slice(statementStart + 1, offset);
	if (/\bimport\s+type\b/u.test(statement)) return true;
	const clause = statement.match(/\bimport\s*\{([^}]*)$/u)?.[1];
	return (
		clause !== undefined &&
		clause
			.split(',')
			.map((part) => part.trim())
			.filter(Boolean)
			.every((part) => part.startsWith('type '))
	);
};

/**
 * Extract only syntactic-looking import forms. This mirrors the cheap,
 * regex-based boundary lints and avoids making the plugin depend on tooling
 * or a compiler. Comments are removed first and all output locations remain
 * source locations. Dynamic imports and require are intentionally included.
 */
export const extractImportReferences = (
	source: string,
): readonly IImportReference[] => {
	const withoutComments = stripComments(source);
	const references: IImportReference[] = [];
	const patterns: readonly RegExp[] = [
		/\bfrom\s*['"]([^'"]+)['"]/gu,
		/\bimport\s*['"]([^'"]+)['"]/gu,
		/\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/gu,
	];
	for (const pattern of patterns) {
		for (const match of withoutComments.matchAll(pattern)) {
			const specifier = match[1];
			if (specifier === undefined || match.index === undefined) continue;
			const line = lineAt(withoutComments, match.index);
			const lineText =
				withoutComments.split('\n')[line - 1]?.trimStart() ?? '';
			// A `from` clause may be the continuation of a multiline import.
			// Requiring import/export context on the current or nearby source
			// line avoids treating ordinary prose strings as imports.
			const context = withoutComments.slice(
				Math.max(0, match.index - 1_000),
				match.index,
			);
			if (
				!/^\s*(?:import|export)\b/u.test(lineText) &&
				!/\b(?:import|export)\b[\s\S]*$/u.test(context.slice(-500))
			)
				continue;
			references.push({
				line,
				specifier,
				typeOnly:
					pattern.source.startsWith('\\bfrom')
						? isTypeOnlyImport(withoutComments, match.index)
						: false,
			});
		}
	}
	return references.sort(
		(a, b) => a.line - b.line || a.specifier.localeCompare(b.specifier),
	);
};

const matchesImportKind = (
	matcher: Extract<ILayerImportMatcher, { importKind?: string }>,
	reference: IImportReference,
): boolean =>
	matcher.importKind === undefined ||
	matcher.importKind === 'any' ||
	(matcher.importKind === 'type-only' && reference.typeOnly);

const matchesMatcher = (
	matcher: ILayerImportMatcher,
	reference: IImportReference,
): boolean => {
	if (!matchesImportKind(matcher, reference)) return false;
	switch (matcher.kind) {
		case 'module-name':
			return matcher.names.includes(reference.specifier);
		case 'specifier-prefix':
			return matcher.prefixes.some(
				(prefix) =>
					reference.specifier === prefix ||
					reference.specifier.startsWith(`${prefix}/`),
			);
		case 'absolute-specifier':
			return reference.specifier.startsWith('/');
	}
};

const findingKey = (
	file: string,
	reference: IImportReference,
	rule: ILayerRule,
): string => `${file}:${reference.specifier}:${rule.enforcedBy}`;

const scanFiles = async (
	reader: IArchitectureReader,
	roots: readonly string[],
): Promise<IScanResult> => {
	const files: string[] = [];
	const missingRoots: string[] = [];
	const rootSet = new Set(roots);
	const stack = [...roots];
	while (stack.length > 0) {
		const dir = stack.pop() as string;
		let entries: readonly IArchitectureDirEntry[];
		try {
			entries = await reader.list(dir);
		} catch {
			if (rootSet.has(dir)) missingRoots.push(dir);
			continue;
		}
		for (const entry of entries) {
			const rel = normalizePath(dir === '' ? entry.name : `${dir}/${entry.name}`);
			if (entry.isDirectory) {
				if (!SKIP_DIRS.has(entry.name)) stack.push(rel);
			} else if (hasSourceExtension(rel)) {
				files.push(rel);
			}
		}
	}
	return {
		files: files.sort((a, b) => a.localeCompare(b)),
		missingRoots: missingRoots.sort(
			(a, b) => roots.indexOf(a) - roots.indexOf(b),
		),
	};
};

const outputSchema = z.object({
	ok: z.boolean(),
	error: z
		.object({ reason: z.string(), nextAction: z.string().optional() })
		.optional(),
	filesScanned: z.number().optional(),
	total: z.number().optional(),
	baselineTotal: z.number().optional(),
	baselinedCount: z.number().optional(),
	newCount: z.number().optional(),
	findings: z
		.array(
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
		)
		.optional(),
	truncated: z.boolean().optional(),
	diagnostic: z.string().optional(),
});

export const runCheckArchitecture = async (
	args: ICheckArchitectureArgs,
	options: ICheckArchitectureToolOptions,
) => {
	const resolution = resolveProfile(args.profile);
	if (!resolution.ok) {
		return toolError(
			resolution.reason,
			`Pass one of: ${resolution.supported.join(', ')} (or omit profile for typescript).`,
		);
	}
	if (resolution.profile.id !== 'typescript') {
		return toolError(
			`architecture graph has no ${resolution.profile.id} import contract`,
			'Use profile `typescript`; language-specific architecture rules are not declared yet.',
		);
	}
	const roots =
		args.roots !== undefined && args.roots.length > 0
			? args.roots
			: (options.defaultRoots ?? ['']);
	const scan = await scanFiles(options.reader, roots);
	const baseline = new Set(args.baseline ?? []);
	const allFindings: IArchitectureFinding[] = [];
	for (const file of scan.files) {
		const source = await options.reader.readText(file);
		if (source === undefined) continue;
		const layerRules = rulesFor(file);
		if (layerRules.length === 0) continue;
		for (const reference of extractImportReferences(source)) {
			for (const rule of layerRules) {
				if (!matchesMatcher(rule.matcher, reference)) continue;
				const key = findingKey(file, reference, rule);
				allFindings.push({
					file,
					line: reference.line,
					specifier: reference.specifier,
					rule: rule.forbids,
					enforcedBy: rule.enforcedBy,
					because: rule.because,
					baselineKey: key,
					baselined: baseline.has(key),
				});
			}
		}
	}
	const findings = allFindings.slice(0, MAX_FINDINGS_IN_PAYLOAD);
	const baselinedCount = allFindings.filter((finding) => finding.baselined).length;
	const newCount = allFindings.length - baselinedCount;
	let diagnostic: string | undefined;
	if (scan.files.length === 0) {
		diagnostic =
			scan.missingRoots.length > 0
				? `scanned 0 files: configured roots do not exist in this workspace: ${scan.missingRoots.join(', ')}.`
				: `scanned 0 TypeScript files under roots [${roots.map((root) => root || '.').join(', ')}].`;
	}
	return toolOk({
		filesScanned: scan.files.length,
		total: allFindings.length,
		baselineTotal: baseline.size,
		baselinedCount,
		newCount,
		findings,
		truncated: allFindings.length > MAX_FINDINGS_IN_PAYLOAD,
		...(diagnostic !== undefined ? { diagnostic } : {}),
	});
};

export const buildCheckArchitectureRegistration = (
	options: ICheckArchitectureToolOptions,
): IToolRegistration => ({
	id: 'conventions_check_architecture',
	tags: ['conventions', 'architecture'],
	summary:
		'Report imports that violate the declared layer graph, with a shrinking baseline.',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_conventions_check_architecture`,
			{
				outputSchema,
				description:
					'Read-only TypeScript architecture report. Scans the selected roots, matches only explicit machine-readable layer rules, and returns file, line, specifier, rule and enforcing lint. Pass finding `baselineKey` values as `baseline` to keep existing debt visible while identifying only new drift. Findings are capped at 200. Profile is TypeScript by default.',
				inputSchema: z.object({
					roots: z.array(z.string()).optional(),
					profile: z.enum(CONVENTION_PROFILE_IDS).optional(),
					baseline: z.array(z.string()).optional(),
				}),
			},
			async (args: ICheckArchitectureArgs) =>
				runCheckArchitecture(args, options),
		);
	},
});
