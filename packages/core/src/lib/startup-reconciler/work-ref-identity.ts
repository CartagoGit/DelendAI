/**
 * work-ref-identity.ts — reads a work ref BACK into the identity that
 * produced it.
 *
 * The WIP engine can expand `branches.workRefTemplate` into a ref
 * (`wip-engine/ref-name.ts`). A machine that has just cloned the
 * repository needs the inverse: it sees `refs/wip/agent-a/f1-s2-g3` and
 * nothing else, and it must recover `(agent, proposal, slice,
 * generation)` — the four-part checkpoint identity — or admit that it
 * cannot. Deriving the parser from the SAME template is what keeps the
 * two directions from drifting: an operator who changes the template
 * changes both at once.
 *
 * WHY the failure is loud: a ref that does not match carries commits
 * that cannot be attributed to any work unit. That is an AMBIGUOUS
 * condition (`work-refs.unattributable`) — the reconciler refuses to
 * invent an owner for it and refuses, even more firmly, to delete it.
 */

import type {
	IWorkRefIdentity,
	IWorkRefParser,
} from './work-ref-identity.interface';

export type {
	IWorkRefIdentity,
	IWorkRefParser,
} from './work-ref-identity.interface';

const PLACEHOLDER = /\$\{(agent|proposal|slice|generation)\}/gu;

/** Characters `sanitizeRefComponent` can emit (`-` last: literal). */
const COMPONENT_CLASS = 'A-Za-z0-9._-';

/** Escape a literal stretch of the template. `-` needs no escaping here. */
const escapeLiteral = (value: string): string =>
	value.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/**
 * A placeholder must not swallow the separator that follows it. When the
 * next literal character is itself a legal component character (`-` in
 * the shipped template `…${proposal}-${slice}-g${generation}`), it is
 * excluded from the class; otherwise the full component class is used.
 */
const classFor = (key: string, nextChar: string | undefined): string => {
	if (key === 'generation') return '\\d+';
	if (nextChar === '-') return '[A-Za-z0-9._]+';
	if (nextChar === '.') return '[A-Za-z0-9_-]+';
	if (nextChar === '_') return '[A-Za-z0-9.-]+';
	return `[${COMPONENT_CLASS}]+`;
};

/** Ensure a ref name is fully qualified the way the engine writes it. */
export const qualifyRef = (name: string): string =>
	name.startsWith('refs/') ? name : `refs/${name}`;

/** The namespace `for-each-ref` should be asked about. */
export const workRefNamespace = (prefix: string): string => {
	const trimmed = prefix.replace(/\/+$/u, '');
	if (trimmed.length === 0) return '';
	return qualifyRef(trimmed);
};

/**
 * Compile `branches.workRefTemplate` into a parser. Returns `undefined`
 * for an empty template — a policy whose persistence strategy writes no
 * per-unit ref has nothing to parse, and that is not an error.
 */
export const compileWorkRefParser = (
	template: string,
	prefix: string,
): IWorkRefParser | undefined => {
	if (template.trim().length === 0) return undefined;
	const qualified = qualifyRef(template);
	const order: string[] = [];
	let pattern = '';
	let cursor = 0;
	PLACEHOLDER.lastIndex = 0;
	for (
		let match = PLACEHOLDER.exec(qualified);
		match !== null;
		match = PLACEHOLDER.exec(qualified)
	) {
		const key = match[1];
		if (key === undefined) continue;
		pattern += escapeLiteral(qualified.slice(cursor, match.index));
		const nextChar = qualified.charAt(match.index + match[0].length);
		pattern += `(${classFor(key, nextChar === '' ? undefined : nextChar)})`;
		order.push(key);
		cursor = match.index + match[0].length;
	}
	if (order.length === 0) return undefined;
	pattern += escapeLiteral(qualified.slice(cursor));
	const regex = new RegExp(`^${pattern}$`, 'u');

	return {
		namespace: workRefNamespace(prefix.length > 0 ? prefix : qualified),
		parse: (refName: string): IWorkRefIdentity | undefined => {
			const found = regex.exec(refName);
			if (found === null) return undefined;
			const values: Record<string, string> = {};
			order.forEach((key, index) => {
				values[key] = found[index + 1] ?? '';
			});
			const generation = Number.parseInt(values.generation ?? '', 10);
			if (!Number.isFinite(generation)) return undefined;
			return {
				agent: values.agent ?? '',
				proposal: values.proposal ?? '',
				slice: values.slice ?? '',
				generation,
			};
		},
	};
};
