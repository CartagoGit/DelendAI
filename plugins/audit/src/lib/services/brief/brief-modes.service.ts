/**
 * Audit modes — the three buckets the brief can be in, plus the
 * helpers that derive one from `scope` + `projects` and render the
 * brief's mode-related markdown fragments (the monorepo badge, the
 * "Available modes" legend, …).
 *
 * SOLID — SRP: this file owns the `AuditMode` type union, the
 * `inferMode` derivation, the monorepo badge block, and the
 * "Modos disponibles" legend table. Consumers reach in for a
 * derived mode or a rendered markdown fragment without owning any
 * of these themselves.
 *
 * The `AuditMode` type lives here (next to `inferMode`, which
 * returns it) and is re-exported from `brief-builder.service.ts`
 * so the public barrel keeps a stable export point. TypeScript's
 * `verbatimModuleSyntax` keeps the cross-file import type-only, so
 * the cycle erases at runtime.
 */

import { SCOPE_LABEL, type ILayerConfig } from '../audit-brief.constants';

/**
 * The three audit modes the brief supports. Every mode is reachable
 * through the existing `scope` parameter — `mode` is an explicit
 * declaration of intent that the host's API surface (`audit_plan` /
 * `audit_run`) surfaces for human callers and that the brief can use
 * to render a clearer header.
 *
 *  - `general`: whole-project audit (`scope` defaults to `'full'`,
 *               every configured layer is included).
 *  - `specific`: targeted audit of one dimension / one layer (`scope`
 *               must point at a known universal scope or layer name).
 *  - `monorepo`: subset-of-monorepo audit (`projects` filters the
 *               configured layers to the names provided; if `projects`
 *               is empty the whole layer set is included, identical to
 *               `general`).
 */
export type AuditMode = 'general' | 'specific' | 'monorepo';

/**
 * Infer the audit mode from the scope and the projects filter when
 * the caller did not pass an explicit `mode`. Pure: same inputs
 * always yield the same inferred mode.
 *
 * Same logic the brief builder uses; the audit tool imports it
 * directly so the tool layer can short-circuit invalid combinations
 * BEFORE building the markdown (without duplicating the derivation).
 */
export const inferMode = (
	scope: string,
	layers: readonly ILayerConfig[],
	projects: readonly string[] | undefined,
): AuditMode => {
	if (projects && projects.length > 0) return 'monorepo';
	if (scope === 'full') return 'general';
	if (scope in SCOPE_LABEL || layers.some((l) => l.name === scope)) {
		return 'specific';
	}
	return 'general';
};

/**
 * Render a small monorepo badge that the model pastes into its
 * audit report so reviewers can see which slice of the monorepo was
 * covered. Returns an empty string when no projects are selected
 * (the renderer decides whether to insert the badge at all).
 *
 * The leading/trailing empty string entries in the join produce the
 * blank lines the brief template expects before and after the
 * blockquote lines — the consumers concatenate this directly into
 * the phase sequence, so the punctuation is part of the contract.
 */
export const renderMonorepoBadge = (projects: readonly string[]): string => {
	if (projects.length === 0) return '';
	return [
		'',
		'> **Monorepo mode active**: this brief covers ONLY the following projects/layers:',
		'> ',
		...projects.map((p) => `> - \`${p}\``),
		'',
	].join('\n');
};

/**
 * Render the "Available modes" legend that the brief inlines right
 * under the Scope section so reviewers can see the contract at a
 * glance. Pure: no inputs, no side effects. The two-table alignment
 * (ASCII art with `_` italics, em-dash separators) is preserved
 * verbatim so the brief stays byte-identical to the previous
 * hand-inlined version.
 */
export const renderAvailableModes = (): string => {
	return `> **Available modes** (pass to the tool as \`mode\`, or derive from \`scope\` + \`projects\`):
>
> | Mode | When | \`scope\` | \`projects\` |
> |---|---|---|---|
> | \`general\` | Whole-project audit | \`full\` | _(omit)_ |
> | \`specific\` | A single dimension or layer | any of \`security\` / \`tokens\` / \`tests\` / \`docs\` / a layer name | _(omit)_ |
> | \`monorepo\` | Audit only selected monorepo packages | \`full\` _(or applicable)_ | list of layer names |`;
};
