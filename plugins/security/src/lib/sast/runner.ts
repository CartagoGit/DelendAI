import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
	probeTool,
	realProbeDeps,
	runExternalTool,
	writeFileAtomic,
	type IExternalTool,
	type IExternalToolRun,
	type IProbeDeps,
	type IRunExternalToolInput,
	type IFinding,
	redactSecrets,
} from '@mcp-vertex/core/public';

import { parseSastJson } from './parsers';
import { compileRulePattern, matchesLanguage } from './rules';
import type {
	IRunSastRunnerInput,
	ISastRule,
	ISastRunResult,
	SastLanguage,
} from '../contracts/interfaces/sast.interface';

const SEMGREP_TOOL: IExternalTool = {
	id: 'semgrep',
	bin: 'semgrep',
	installHints: [
		{ manager: 'brew', command: 'brew install semgrep' },
		{ manager: 'pipx', command: 'pipx install semgrep' },
	],
};

const AST_GREP_TOOL: IExternalTool = {
	id: 'ast-grep',
	bin: 'ast-grep',
	installHints: [
		{ manager: 'brew', command: 'brew install ast-grep' },
		{ manager: 'cargo', command: 'cargo install ast-grep' },
	],
};

const LANGUAGE_EXTENSIONS: Readonly<Record<SastLanguage, readonly string[]>> = {
	generic: [
		'.ts',
		'.tsx',
		'.js',
		'.jsx',
		'.mjs',
		'.cjs',
		'.py',
		'.go',
		'.rs',
		'.json',
		'.yaml',
		'.yml',
	],
	javascript: ['.js', '.jsx', '.mjs', '.cjs'],
	typescript: ['.ts', '.tsx'],
	python: ['.py'],
	go: ['.go'],
	rust: ['.rs'],
};

const IGNORE_SEGMENTS = [
	'/.git/',
	'/node_modules/',
	'/dist/',
	'/build/',
	'/.cache/',
];

export class MissingCliError extends Error {
	readonly cli: 'semgrep' | 'ast-grep';
	readonly hint: string;

	constructor(cli: 'semgrep' | 'ast-grep') {
		const hint =
			cli === 'semgrep'
				? 'Install semgrep with `brew install semgrep` or `pipx install semgrep`.'
				: 'Install ast-grep with `brew install ast-grep` or `cargo install ast-grep`.';
		super(`Missing required CLI: ${cli}`);
		this.name = 'MissingCliError';
		this.cli = cli;
		this.hint = hint;
	}
}

const walk = async (
	cwd: string,
	dir = cwd,
	accumulator: string[] = [],
): Promise<string[]> => {
	const entries = await import('node:fs/promises').then((mod) =>
		mod.readdir(dir, { withFileTypes: true }).catch(() => []),
	);
	for (const entry of entries) {
		const absolute = join(dir, entry.name);
		const relative = absolute.slice(cwd.length + 1);
		if (
			entry.isDirectory() &&
			![
				'.git',
				'node_modules',
				'dist',
				'build',
				'.cache',
				'coverage',
			].includes(entry.name)
		) {
			await walk(cwd, absolute, accumulator);
			continue;
		}
		if (entry.isFile()) accumulator.push(relative);
	}
	return accumulator;
};

const selectCandidateFiles = (
	files: readonly string[],
	languages: readonly SastLanguage[],
): string[] => {
	const extensions = new Set(
		languages.flatMap((language) => LANGUAGE_EXTENSIONS[language]),
	);
	return files.filter(
		(file) =>
			[...extensions].some((extension) => file.endsWith(extension)) &&
			!IGNORE_SEGMENTS.some((segment) => `/${file}/`.includes(segment)),
	);
};

const createSemgrepConfig = (rules: readonly ISastRule[]): string =>
	JSON.stringify(
		{
			rules: rules.map((rule) => ({
				id: rule.id,
				message: rule.message,
				severity:
					rule.severity === 'critical'
						? 'ERROR'
						: rule.severity === 'high'
							? 'WARNING'
							: 'INFO',
				languages:
					rule.language === 'typescript'
						? ['typescript', 'javascript']
						: rule.language === 'generic'
							? ['generic']
							: [rule.language],
				'pattern-regex': rule.pattern,
			})),
		},
		null,
		2,
	);

const createAstGrepRule = (rule: ISastRule): string =>
	JSON.stringify(
		{
			id: rule.id,
			language:
				rule.language === 'typescript'
					? 'TypeScript'
					: rule.language === 'javascript'
						? 'JavaScript'
						: rule.language === 'python'
							? 'Python'
							: rule.language === 'go'
								? 'Go'
								: 'Rust',
			message: rule.message,
			severity: rule.severity,
			rule: {
				regex: rule.pattern,
			},
		},
		null,
		2,
	);

const runCli = async (
	tool: IExternalTool,
	args: readonly string[],
	input: IRunSastRunnerInput,
): Promise<IExternalToolRun> =>
	(input.exec ?? runExternalTool)({
		tool,
		args,
		cwd: input.cwd,
		timeoutMs: input.timeoutMs ?? 30_000,
		maxOutputBytes: 4 * 1024 * 1024,
		redact: [
			/\b(?:api[_-]?key|secret|token|password)\b\s*[:=]\s*['"][A-Za-z0-9_\-/+=]{12,}['"]/giu,
		],
	});

const runSemgrep = async (
	selectedRules: readonly ISastRule[],
	candidateFiles: readonly string[],
	input: IRunSastRunnerInput,
): Promise<ISastRunResult> => {
	const tempDir = await mkdtemp(join(tmpdir(), 'mcpv-semgrep-'));
	try {
		const configPath = join(tempDir, 'rules.json');
		await writeFileAtomic(configPath, createSemgrepConfig(selectedRules));
		const run = await runCli(
			SEMGREP_TOOL,
			['--config', configPath, '--json', input.cwd],
			input,
		);
		if (run.unavailable) throw new MissingCliError('semgrep');
		if (!run.ok && run.stdout.trim().length === 0) {
			throw new Error(run.stderr.trim() || 'semgrep scan failed');
		}
		const parsed = JSON.parse(run.stdout || run.stderr || '{"results":[]}');
		return {
			source: 'semgrep',
			scanned: candidateFiles.length,
			findings: parseSastJson(parsed, { source: 'semgrep' }),
		};
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
};

const runAstGrep = async (
	selectedRules: readonly ISastRule[],
	candidateFiles: readonly string[],
	input: IRunSastRunnerInput,
): Promise<ISastRunResult> => {
	const tempDir = await mkdtemp(join(tmpdir(), 'mcpv-ast-grep-'));
	try {
		await Promise.all(
			selectedRules
				.filter((rule) => rule.language !== 'generic')
				.map((rule) =>
					writeFileAtomic(
						join(tempDir, `${rule.id}.json`),
						createAstGrepRule(rule),
					),
				),
		);
		const run = await runCli(
			AST_GREP_TOOL,
			['scan', '--config', tempDir, '--json', input.cwd],
			input,
		);
		if (run.unavailable) throw new MissingCliError('ast-grep');
		if (!run.ok && run.stdout.trim().length === 0) {
			throw new Error(run.stderr.trim() || 'ast-grep scan failed');
		}
		const parsed = JSON.parse(run.stdout || run.stderr || '[]');
		const findings = parseSastJson(parsed, { source: 'ast-grep' });
		const genericRules = selectedRules.filter(
			(rule) => rule.language === 'generic',
		);
		if (genericRules.length === 0) {
			return {
				source: 'ast-grep',
				scanned: candidateFiles.length,
				findings,
			};
		}
		const generic = await runInlineRegex(
			genericRules,
			candidateFiles,
			input,
			'ast-grep',
		);
		return {
			source: 'ast-grep',
			scanned: candidateFiles.length,
			findings: [...findings, ...generic.findings],
		};
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
};

const lineOf = (content: string, index: number): number => {
	let line = 1;
	for (let i = 0; i < Math.min(index, content.length); i += 1) {
		if (content[i] === '\n') line += 1;
	}
	return line;
};

const runInlineRegex = async (
	rules: readonly ISastRule[],
	candidateFiles: readonly string[],
	input: IRunSastRunnerInput,
	source: 'fallback' | 'ast-grep' = 'fallback',
): Promise<ISastRunResult> => {
	const results: Array<{
		ruleId: string;
		severity: string;
		message: string;
		file: string;
		location: { line: number };
	}> = [];
	const readTextFile =
		input.readTextFile ??
		(async (absolutePath: string) => {
			try {
				return await readFile(absolutePath, 'utf8');
			} catch {
				return undefined;
			}
		});
	for (const file of candidateFiles) {
		const absolute = resolve(input.cwd, file);
		const content = await readTextFile(absolute);
		if (content === undefined) continue;
		for (const rule of rules) {
			const regex = compileRulePattern(rule);
			let match = regex.exec(content);
			while (match !== null) {
				const redacted = redactSecrets(match[0]).text;
				results.push({
					ruleId: rule.id,
					severity: rule.severity,
					message: `${rule.message} Matched ${redacted}.`,
					file,
					location: { line: lineOf(content, match.index) },
				});
				if (match.index === regex.lastIndex) regex.lastIndex += 1;
				match = regex.exec(content);
			}
		}
	}
	return {
		source,
		scanned: candidateFiles.length,
		findings: parseSastJson({ results }, { source: 'fallback' }),
	};
};

export const runSastRunner = async (
	input: IRunSastRunnerInput,
): Promise<ISastRunResult> => {
	const probeDeps = input.probeDeps ?? realProbeDeps();
	const runner = input.runner ?? 'auto';
	const languages = input.languages ?? ['generic'];
	const selectedRules = input.rules.filter((rule) =>
		matchesLanguage(rule, languages),
	);
	const allFiles = input.files ?? (await walk(input.cwd));
	const candidateFiles = selectCandidateFiles(allFiles, languages);
	if (runner === 'semgrep') {
		const probe = await probeTool(SEMGREP_TOOL, probeDeps);
		if (!probe.available) throw new MissingCliError('semgrep');
		return runSemgrep(selectedRules, candidateFiles, input);
	}
	if (runner === 'ast-grep') {
		const probe = await probeTool(AST_GREP_TOOL, probeDeps);
		if (!probe.available) throw new MissingCliError('ast-grep');
		return runAstGrep(selectedRules, candidateFiles, input);
	}
	const [semgrep, astGrep] = await Promise.all([
		probeTool(SEMGREP_TOOL, probeDeps),
		probeTool(AST_GREP_TOOL, probeDeps),
	]);
	if (semgrep.available) {
		return runSemgrep(selectedRules, candidateFiles, input);
	}
	if (astGrep.available) {
		return runAstGrep(selectedRules, candidateFiles, input);
	}
	return runInlineRegex(selectedRules, candidateFiles, input);
};
