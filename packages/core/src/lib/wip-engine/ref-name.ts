/**
 * ref-name.ts — expands the development policy's
 * `branches.workRefTemplate` into the actual ref a unit of work is
 * persisted to.
 *
 * The template is the operator's choice, but the ref has to satisfy git,
 * and the two do not automatically agree: agent ids, proposal ids and
 * slice names arrive from configuration and from the model, and any of
 * them can contain a space, a colon or a `~` that `update-ref` refuses.
 * Sanitising at expansion time means an unusual slice name degrades to a
 * slightly uglier ref instead of failing a checkpoint — durability must
 * not hinge on cosmetics.
 *
 * Expanded refs are fully qualified. Policy decides whether they are visible
 * under `refs/heads/` or hidden under `refs/wip/`; plumbing keeps the shared
 * checkout pinned in both cases.
 */

import { renderWorkRefScope } from '../development-policy/work-ref-scope';
import { DEFAULT_WORK_KIND } from '../development-policy/profiles.constant';
import { workRefPlaceholderPattern } from '../development-policy/work-ref-placeholders';

import type { IWorkRefVariables } from './ref-name.interface';

export type { IWorkRefVariables } from './ref-name.interface';

/**
 * Reduce one interpolated value to characters git accepts inside a ref
 * component: letters, digits, `.`, `_` and `-`. Everything else collapses
 * to a single `-`, and leading/trailing separators are trimmed so no
 * component can start with `.` or end with `.lock`.
 */
const isEdgeSeparator = (char: string): boolean =>
	char === '-' || char === '.' || char === '_';

/**
 * Trim leading and trailing separators by index, not by an anchored
 * `[-._]+$` pattern: that pattern backtracks quadratically over a long
 * run of separators followed by anything else.
 */
const trimEdgeSeparators = (value: string): string => {
	let start = 0;
	let end = value.length;
	while (start < end && isEdgeSeparator(value.charAt(start))) start += 1;
	while (end > start && isEdgeSeparator(value.charAt(end - 1))) end -= 1;
	return value.slice(start, end);
};

export const sanitizeRefComponent = (value: string): string => {
	const cleaned = trimEdgeSeparators(
		value
			.trim()
			.replaceAll(/[^A-Za-z0-9._-]+/gu, '-')
			.replaceAll(/-{2,}/gu, '-'),
	);
	return cleaned.length > 0 ? cleaned : 'unnamed';
};

/**
 * Expand a template. Unknown placeholders are left alone rather than
 * blanked: a typo in the config should be visible in the ref name, not
 * quietly produce `wip//-`.
 */
export const expandWorkRefTemplate = (
	template: string,
	variables: IWorkRefVariables,
): string =>
	template.replaceAll(workRefPlaceholderPattern(), (_match, key: string) => {
		if (key === 'agent') return sanitizeRefComponent(variables.agent);
		if (key === 'kind')
			return sanitizeRefComponent(variables.kind ?? DEFAULT_WORK_KIND);
		if (key === 'proposal') return sanitizeRefComponent(variables.proposal);
		if (key === 'slice') return sanitizeRefComponent(variables.slice);
		if (key === 'topic')
			return sanitizeRefComponent(variables.topic ?? 'work');
		if (key === 'scope')
			return renderWorkRefScope({
				proposal: variables.proposal,
				slice: variables.slice,
				generation: Number(variables.generation),
			});
		return sanitizeRefComponent(String(variables.generation));
	});

/**
 * The fully-qualified ref for a unit of work. A template that already
 * names a full ref is used as-is; a short one (`wip/${agent}/…`, the
 * hidden form) is placed under `refs/`.
 */
export const resolveWorkRef = (
	template: string,
	variables: IWorkRefVariables,
): string => {
	const expanded = expandWorkRefTemplate(template, variables)
		.split('/')
		.map((segment) => segment.trim())
		.filter((segment) => segment.length > 0)
		.join('/');
	return expanded.startsWith('refs/') ? expanded : `refs/${expanded}`;
};
