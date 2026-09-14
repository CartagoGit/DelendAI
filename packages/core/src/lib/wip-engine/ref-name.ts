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
 * Expanded refs are fully qualified and live OUTSIDE `refs/heads/`.
 * A WIP ref is not a branch: it must never appear in `git branch`, never
 * be a checkout target, and never be something a `git switch` can move
 * HEAD onto — which is the whole invariant this engine exists to protect.
 */

import type { IWorkRefVariables } from './ref-name.interface';

export type { IWorkRefVariables } from './ref-name.interface';

const PLACEHOLDER = /\$\{(agent|proposal|slice|generation)\}/gu;

/**
 * Reduce one interpolated value to characters git accepts inside a ref
 * component: letters, digits, `.`, `_` and `-`. Everything else collapses
 * to a single `-`, and leading/trailing separators are trimmed so no
 * component can start with `.` or end with `.lock`.
 */
export const sanitizeRefComponent = (value: string): string => {
	const cleaned = value
		.trim()
		.replaceAll(/[^A-Za-z0-9._-]+/gu, '-')
		.replaceAll(/-{2,}/gu, '-')
		.replace(/^[-._]+/u, '')
		.replace(/[-._]+$/u, '');
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
	template.replaceAll(PLACEHOLDER, (_match, key: string) => {
		if (key === 'agent') return sanitizeRefComponent(variables.agent);
		if (key === 'proposal') return sanitizeRefComponent(variables.proposal);
		if (key === 'slice') return sanitizeRefComponent(variables.slice);
		return sanitizeRefComponent(String(variables.generation));
	});

/**
 * The fully-qualified ref for a unit of work. A template that already
 * names a full ref is used as-is; a short one (`wip/${agent}/…`, the
 * shipped default) is placed under `refs/`, deliberately not under
 * `refs/heads/` — see the file header.
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
