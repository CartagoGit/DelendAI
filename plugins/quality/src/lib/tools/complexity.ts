import type { IFinding } from '@delendai/core/public';
import { summarizeFindings, worstSeverity } from '@delendai/core/public';

export interface IComplexityFinding {
	readonly file: string;
	readonly line: number;
	readonly function: string;
	readonly complexity: number;
	readonly threshold: number;
}

export interface IComplexityScanResult {
	readonly findings: readonly IComplexityFinding[];
	readonly summary: ReturnType<typeof summarizeFindings>;
	readonly worst: ReturnType<typeof worstSeverity>;
}

const IDENT = '[A-Za-z_$][A-Za-z0-9_$]*';
const FUNCTION_PATTERNS = [
	new RegExp(`\\bfunction\\s+(${IDENT})\\s*\\(`, 'g'),
	new RegExp(
		`\\b(?:const|let|var)\\s+(${IDENT})\\s*=\\s*(?:async\\s*)?function\\b`,
		'g',
	),
	new RegExp(
		`\\b(?:const|let|var)\\s+(${IDENT})\\s*=\\s*(?:async\\s*)?(?:\\([^)]*\\)|${IDENT})\\s*=>`,
		'g',
	),
];

const preserveLayout = (source: string): string => {
	let out = '';
	let i = 0;
	while (i < source.length) {
		const ch = source[i] ?? '';
		const next = source[i + 1] ?? '';
		if (ch === '/' && next === '/') {
			out += '  ';
			i += 2;
			while (i < source.length && source[i] !== '\n') {
				out += ' ';
				i += 1;
			}
			continue;
		}
		if (ch === '/' && next === '*') {
			out += '  ';
			i += 2;
			while (i < source.length) {
				const c = source[i] ?? '';
				const n = source[i + 1] ?? '';
				if (c === '*' && n === '/') {
					out += '  ';
					i += 2;
					break;
				}
				out += c === '\n' ? '\n' : ' ';
				i += 1;
			}
			continue;
		}
		if (ch === '"' || ch === "'" || ch === '`') {
			const quote = ch;
			out += ' ';
			i += 1;
			while (i < source.length) {
				const c = source[i] ?? '';
				if (c === '\\') {
					out += '  ';
					i += 2;
					continue;
				}
				if (c === quote) {
					out += ' ';
					i += 1;
					break;
				}
				out += c === '\n' ? '\n' : ' ';
				i += 1;
			}
			continue;
		}
		out += ch;
		i += 1;
	}
	return out;
};

const lineAt = (source: string, offset: number): number =>
	source.slice(0, offset).split('\n').length;

const findBlockEnd = (source: string, start: number): number => {
	let depth = 0;
	for (let i = start; i < source.length; i += 1) {
		const ch = source[i];
		if (ch === '{') depth += 1;
		if (ch === '}') {
			depth -= 1;
			if (depth === 0) return i;
		}
	}
	return source.length - 1;
};

const computeComplexity = (body: string): number => {
	const tokenCount = (pattern: RegExp): number =>
		body.match(pattern)?.length ?? 0;
	return (
		1 +
		tokenCount(/\bif\b/g) +
		tokenCount(/\bfor\b/g) +
		tokenCount(/\bwhile\b/g) +
		tokenCount(/\bcase\b/g) +
		tokenCount(/\bcatch\b/g) +
		tokenCount(/&&/g) +
		tokenCount(/\|\|/g)
	);
};

export const collectComplexityFindings = (
	file: string,
	source: string,
	threshold: number,
): readonly IComplexityFinding[] => {
	const masked = preserveLayout(source);
	const findings: IComplexityFinding[] = [];
	for (const pattern of FUNCTION_PATTERNS) {
		while (true) {
			const match = pattern.exec(masked);
			if (match === null) break;
			const functionName = match[1] ?? 'anonymous';
			const searchFrom = match.index + match[0].length;
			const bodyStart = masked.indexOf('{', searchFrom);
			if (bodyStart < 0) continue;
			const bodyEnd = findBlockEnd(masked, bodyStart);
			const complexity = computeComplexity(
				masked.slice(bodyStart, bodyEnd + 1),
			);
			if (complexity <= threshold) continue;
			findings.push({
				file,
				line: lineAt(masked, match.index),
				function: functionName,
				complexity,
				threshold,
			});
		}
	}
	return findings.sort(
		(a, b) =>
			b.complexity - a.complexity ||
			a.file.localeCompare(b.file) ||
			a.line - b.line,
	);
};

export const scanComplexityProject = (
	files: readonly { path: string; source: string }[],
	threshold: number,
): IComplexityScanResult => {
	const findings = files.flatMap((file) =>
		collectComplexityFindings(file.path, file.source, threshold),
	);
	const normalized: IFinding[] = findings.map((finding) => ({
		ruleId: 'quality-complexity-hotspot',
		severity:
			finding.complexity >= finding.threshold * 2
				? 'high'
				: finding.complexity >= finding.threshold + 5
					? 'medium'
					: 'low',
		message: `${finding.function} has complexity ${finding.complexity} (threshold ${finding.threshold})`,
		location: { file: finding.file, line: finding.line },
		fix: 'Split branches or extract helper functions to lower cyclomatic complexity.',
	}));
	return {
		findings,
		summary: summarizeFindings(normalized),
		worst: worstSeverity(normalized),
	};
};
