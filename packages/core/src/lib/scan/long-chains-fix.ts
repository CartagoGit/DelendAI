/**
 * long-chains-fix.ts — registry skeleton generator (c00126 S5).
 *
 * Given a file path and its body, finds the first long switch-on-string
 * chain and emits a Map-based registry skeleton + a delegate switch.
 * The output is a printable TypeScript proposal; the function never
 * writes to disk.
 *
 * Conservative: the function only operates on switches whose discriminant
 * is a simple string literal (`switch (id)`) and whose cases are simple
 * returns (`case 'x': return …;`). Anything more complex is skipped and
 * the caller falls back to manual refactoring.
 */
import { lineOf } from './text-utils';
import { detectLongChains } from './long-chains';

export interface IFixProposal {
	readonly relPath: string;
	readonly switchLine: number;
	readonly switchVariable: string;
	readonly caseCount: number;
	readonly registry: string;
	readonly delegate: string;
}

const SWITCH_HEADER_RE = /\bswitch\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/;
const CASE_BODY_RE =
	/\bcase\s+(['"])([^'"]+)\1\s*:\s*(?:return\s+)?([^;{]+);?/g;

const toCamel = (s: string): string =>
	s
		.replace(/[^A-Za-z0-9]+/g, ' ')
		.trim()
		.split(/\s+/)
		.map((w, i) =>
			i === 0 ? w.toLowerCase() : w[0]?.toUpperCase() + w.slice(1),
		)
		.join('');

/**
 * Build a registry skeleton for the first long switch-on-string in `body`.
 * Returns `null` if the chain is not a simple switch-on-string.
 */
export const buildRegistrySkeleton = (
	relPath: string,
	body: string,
	minArms = 5,
): IFixProposal | null => {
	const chains = detectLongChains(body, { minArms });
	const switchChain = chains.find((c) => c.kind === 'switch');
	if (!switchChain) return null;
	// Re-parse the switch to extract the variable + cases
	const switchRegex = /\bswitch\s*\([^)]*\)\s*\{/g;
	let match: RegExpExecArray | null = null;
	match = switchRegex.exec(body);
	while (match !== null) {
		if (lineOf(body, match.index) !== switchChain.line) {
			match = switchRegex.exec(body);
			continue;
		}
		const headerMatch = body
			.slice(match.index, match.index + match[0].length)
			.match(SWITCH_HEADER_RE);
		if (!headerMatch) return null;
		const variable = headerMatch[1] ?? 'key';
		// Read the switch body up to the matching closing brace
		let depth = 1;
		let i = match.index + match[0].length;
		while (i < body.length && depth > 0) {
			const ch = body[i];
			if (ch === '{') depth += 1;
			else if (ch === '}') depth -= 1;
			i += 1;
		}
		const block = body.slice(match.index + match[0].length, i - 1);
		const cases: { key: string; value: string }[] = [];
		let m: RegExpExecArray | null;
		m = CASE_BODY_RE.exec(block);
		while (m !== null) {
			const quote = m[1] ?? "'";
			const key = m[2] ?? '';
			const value = (m[3] ?? '').trim();
			cases.push({ key: `${quote}${key}${quote}`, value });
			m = CASE_BODY_RE.exec(block);
		}
		if (cases.length < minArms) return null;
		const registryName = `${toCamel(relPath.split('/').pop()?.replace(/\.ts$/, '') ?? 'lookup')}Registry`;
		const registry =
			`export const ${registryName}: ReadonlyMap<string, ${cases[0]?.value ? inferType(cases[0].value) : 'unknown'}> = new Map([\n` +
			cases
				.map(
					(c, idx) =>
						`  [${c.key}, ${c.value}]${idx === cases.length - 1 ? '' : ','}`,
				)
				.join('\n') +
			'\n]);';
		const delegate = `export const ${toCamel(relPath.split('/').pop()?.replace(/\.ts$/, '') ?? 'route')} = (${variable}: string): ${cases[0]?.value ? inferType(cases[0].value) : 'unknown'} => {\n  const hit = ${registryName}.get(${variable});\n  if (hit !== undefined) return hit;\n  throw new Error(\`${variable} not found: \${${variable}}\`);\n};`;
		return {
			relPath,
			switchLine: switchChain.line,
			switchVariable: variable,
			caseCount: cases.length,
			registry,
			delegate,
		};
	}
	return null;
};

const inferType = (value: string): string => {
	const trimmed = value.trim();
	if (/^['"].*['"]$/.test(trimmed)) return 'string';
	if (/^-?\d+(\.\d+)?$/.test(trimmed)) return 'number';
	if (/^(true|false)$/.test(trimmed)) return 'boolean';
	return 'unknown';
};

/** Render an `IFixProposal` as a printable TypeScript block. */
export const formatFixProposal = (p: IFixProposal): string => {
	const banner = `// Proposed registry for ${p.relPath} (replaces the long switch at line ${p.switchLine}, ${p.caseCount} cases)`;
	return [banner, p.registry, '', p.delegate].join('\n');
};
