#!/usr/bin/env bun
/**
 * tool-ok-envelope.script.ts — a tool that answers with `toolOk` must
 * advertise an output schema that declares `ok`.
 *
 * `toolOk(data)` puts `{ ok: true, ...data }` on the wire. A client that
 * has listed tools validates `structuredContent` against the advertised
 * JSON Schema, and a plain `z.object` emits `additionalProperties: false`
 * — so a schema that forgets `ok` makes the tool reject its own
 * SUCCESSFUL answer with `-32602 ... must NOT have additional
 * properties`. The tool is broken over the protocol while every local
 * test passes.
 *
 * MEASURED. `withOkEnvelope` was written after seven tools were fixed one
 * at a time and two more were still failing; its own header says the
 * reason they kept happening is that "nothing made forgetting
 * impossible". `commit_policy_status` and `commit_policy_storms` were
 * still shipping the bug when this lint was written — both even
 * `safeParse`d their own pre-envelope payload against the same schema,
 * which agreed with them and caught nothing.
 *
 * `verify:tools` cannot catch this: it skips invocation for every tool
 * that declares `effects` (an empty payload is only safe for read-only
 * tools), and Zod strips unknown keys rather than rejecting them, so a
 * non-strict parse passes whatever the schema says.
 *
 * Conservative by construction: it reports only what it can resolve
 * inside one file — an identifier defined there, or an inline
 * `z.object`. A schema built by a helper call (`compactOutputSchema()`,
 * which is a `looseObject`) or imported from elsewhere is left alone
 * rather than guessed at, because a false positive on a gate is worse
 * than a miss.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';

const SCAN_ROOTS = ['plugins', 'packages'] as const;

export interface IOkEnvelopeFinding {
	readonly file: string;
	readonly line: number;
	readonly schema: string;
}

const walk = (dir: string, out: string[]): void => {
	for (const entry of readdirSync(dir)) {
		if (
			entry === 'node_modules' ||
			entry === 'dist' ||
			entry === 'build' ||
			entry === 'coverage'
		)
			continue;
		const abs = join(dir, entry);
		if (statSync(abs).isDirectory()) walk(abs, out);
		else if (
			abs.endsWith('.ts') &&
			!abs.endsWith('.d.ts') &&
			!abs.endsWith('.spec.ts')
		)
			out.push(abs);
	}
};

/** Substring from the first `(` after `from` to its matching `)`. */
const balanced = (text: string, from: number): string => {
	const open = text.indexOf('(', from);
	if (open === -1) return '';
	let depth = 0;
	for (let i = open; i < text.length; i += 1) {
		const ch = text[i];
		if (ch === '(') depth += 1;
		else if (ch === ')') {
			depth -= 1;
			if (depth === 0) return text.slice(open, i + 1);
		}
	}
	return text.slice(open);
};

/** The initialiser of `const <name> = ...`, parens balanced. */
export const declarationBody = (
	body: string,
	name: string,
): string | undefined => {
	const re = new RegExp(`(?:export\\s+)?const\\s+${name}\\s*=`);
	const m = re.exec(body);
	if (m === null) return undefined;
	return balanced(body, m.index + m[0].length);
};

/**
 * The keys of the OUTERMOST object literal, and only those.
 *
 * A flat search for `ok:` is wrong: `commit_policy_status` declares
 * `ok: z.boolean()` deep inside `branchPolicy.remote`, which says
 * nothing about the envelope. Reading that as "declares ok" made this
 * lint miss one of the two tools it was written for.
 */
export const topLevelKeys = (schemaText: string): readonly string[] => {
	const start = schemaText.indexOf('{');
	if (start === -1) return [];
	const keys: string[] = [];
	let depth = 0;
	let expectKey = false;
	for (let i = start; i < schemaText.length; i += 1) {
		const ch = schemaText[i]!;
		if (ch === '{' || ch === '(' || ch === '[') {
			depth += 1;
			expectKey = depth === 1;
			continue;
		}
		if (ch === '}' || ch === ')' || ch === ']') {
			depth -= 1;
			if (depth === 0) break;
			continue;
		}
		if (depth !== 1) continue;
		// Comments must not consume `expectKey`. `close-plan` writes
		// `// real-close variant` between two top-level fields, and
		// clearing the flag here dropped the key that followed it — the
		// declared `ok` went unseen and an innocent tool was reported.
		if (ch === '/' && schemaText[i + 1] === '/') {
			const eol = schemaText.indexOf('\n', i);
			if (eol === -1) break;
			i = eol;
			continue;
		}
		if (ch === '/' && schemaText[i + 1] === '*') {
			const end = schemaText.indexOf('*/', i);
			i = end === -1 ? schemaText.length : end + 1;
			continue;
		}
		if (ch === ',') {
			expectKey = true;
			continue;
		}
		if (!expectKey || /\s/.test(ch)) continue;
		const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*:/.exec(schemaText.slice(i));
		if (m !== null) {
			keys.push(m[1]!);
			i += m[0].length - 1;
		}
		expectKey = false;
	}
	return keys;
};

/** True when this schema declares `ok` itself, or cannot reject extra keys. */
const declaresOk = (schemaText: string): boolean =>
	schemaText.includes('withOkEnvelope') ||
	schemaText.includes('looseObject') ||
	schemaText.includes('passthrough') ||
	topLevelKeys(schemaText).includes('ok');

/**
 * The body of a same-file `const name = ...` / `function name(...)`.
 *
 * Registrations rarely answer inline: the handler is usually
 * `async () => runTheTool(options)`, and the `toolOk` call lives in that
 * function, declared ABOVE the registration. Judging only the text
 * between one `registerTool(` and the next therefore misses exactly the
 * tools this lint exists for — it did, for both commit-policy tools,
 * until this followed the delegation.
 */
const functionBody = (body: string, name: string): string => {
	const re = new RegExp(
		`(?:export\\s+)?(?:const\\s+${name}\\s*=|function\\s+${name}\\b)`,
	);
	const m = re.exec(body);
	if (m === null) return '';
	const rest = body.slice(m.index + m[0].length);
	const next = /\n(?:export\s+)?(?:const|function|class)\s/.exec(rest);
	return next === null ? rest : rest.slice(0, next.index);
};

/** True when this registration answers with `toolOk`, directly or via one hop. */
const answersWithToolOk = (chunk: string, body: string): boolean => {
	if (chunk.includes('toolOk(')) return true;
	const called = new Set<string>();
	for (const m of chunk.matchAll(
		/(?:=>|return)\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
	))
		called.add(m[1]!);
	for (const name of called) {
		if (functionBody(body, name).includes('toolOk(')) return true;
	}
	return false;
};

/**
 * Judge each registration on ITS OWN handler.
 *
 * A file-level "does this file mention toolOk" test is wrong: the big
 * multi-tool files register a dozen tools side by side, and one of them
 * using `toolOk` says nothing about the schema of another that answers
 * with `toolJson` (which adds no `ok` and whose strict schema is
 * correct). Splitting on `registerTool(` keeps each verdict local to the
 * tool it is about.
 */
export const findOkEnvelopeViolations = (
	file: string,
	body: string,
): readonly IOkEnvelopeFinding[] => {
	if (!body.includes('toolOk(') || !body.includes('outputSchema:')) return [];

	const findings: IOkEnvelopeFinding[] = [];
	const marker = 'registerTool(';
	const starts: number[] = [];
	for (
		let i = body.indexOf(marker);
		i !== -1;
		i = body.indexOf(marker, i + 1)
	)
		starts.push(i);

	starts.forEach((start, index) => {
		const chunk = body.slice(start, starts[index + 1] ?? body.length);
		// Only a handler that actually answers with `toolOk` is judged,
		// following one hop when the registration delegates to a function.
		if (!answersWithToolOk(chunk, body)) return;

		const lineOf = (offset: number): number =>
			body.slice(0, start + offset).split('\n').length;

		const named = /outputSchema:\s*([A-Za-z_][A-Za-z0-9_]*)\s*,/.exec(
			chunk,
		);
		if (named !== null) {
			const decl = declarationBody(body, named[1]!);
			// Unresolved (imported, or built elsewhere): not judged.
			if (decl === undefined) return;
			if (!declaresOk(decl))
				findings.push({
					file,
					line: lineOf(named.index),
					schema: named[1]!,
				});
			return;
		}

		const inline = /outputSchema:\s*z\.object\(/.exec(chunk);
		if (inline !== null) {
			const schemaText = balanced(chunk, inline.index);
			if (!declaresOk(schemaText))
				findings.push({
					file,
					line: lineOf(inline.index),
					schema: 'z.object({…})',
				});
		}
	});
	return findings;
};

export const scanOkEnvelope = (root: string): readonly IOkEnvelopeFinding[] => {
	const findings: IOkEnvelopeFinding[] = [];
	for (const scanRoot of SCAN_ROOTS) {
		const abs = join(root, scanRoot);
		const files: string[] = [];
		try {
			walk(abs, files);
		} catch {
			continue;
		}
		for (const file of files) {
			findings.push(
				...findOkEnvelopeViolations(
					relative(root, file).split('\\').join('/'),
					readFileSync(file, 'utf8'),
				),
			);
		}
	}
	return findings;
};

const main = (): number => {
	const findings = scanOkEnvelope(repoRoot());
	if (findings.length === 0) {
		console.log(
			'✓ tool-ok-envelope: every tool answering with toolOk declares `ok` in its output schema.',
		);
		return 0;
	}
	console.error(
		`✖ tool-ok-envelope: ${String(findings.length)} tool(s) answer with toolOk but never declare \`ok\`:`,
	);
	for (const finding of findings) {
		console.error(
			`  ${finding.file}:${String(finding.line)} — outputSchema: ${finding.schema}`,
		);
	}
	console.error(
		'\n  A client that listed tools validates structuredContent against the',
	);
	console.error(
		'  advertised JSON Schema, which forbids undeclared keys, so the tool',
	);
	console.error(
		'  rejects its own successful answer with -32602. Wrap the payload:',
	);
	console.error('\n    outputSchema: withOkEnvelope(YOUR_PAYLOAD_SCHEMA)\n');
	return 1;
};

if (import.meta.main) process.exit(main());
