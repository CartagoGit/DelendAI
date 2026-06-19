// Tool / prompt / resource / knowledge i18n catalogue — lookup helpers.
//
// `apps/web/src/i18n/tools/index.ts` imports each entry from
// `apps/web/src/i18n/tools/<name>.ts` and exposes lookup functions
// with English fallback. The catalogue starts empty by design (see
// `_shape.ts`) so the site falls back to the runtime description
// (always English) — that matches today's behaviour exactly. Future
// proposals populate the catalogue entry by entry.
//
// Lookup convention:
//   describeTool('deps_deps_check', 'es') → es → en → '' (never throws)

import type { Lang } from '../shared';
import type {
	IKnowledgeI18n,
	IPromptI18n,
	IResourceI18n,
	IToolI18n,
} from './_shape';
import { mcpVertexOverviewI18n } from './mcp-vertex_overview';
import { proposalsAutoWorkI18n } from './proposals_auto_work';
import { memorySaveI18n } from './memory_save';

// ─── Catalogue storage ────────────────────────────────────────────────────────
// We use a module-level Map so additions via `register*` survive Astro's
// SSR. The shared i18n helper pattern (`./langs/<code>.ts`) populates
// its own dict at module import time; we mirror that pattern with a
// `register*` API so each catalogue entry can opt in lazily without
// forcing an import-time side effect on the whole app.

const tools = new Map<string, IToolI18n>();
const prompts = new Map<string, IPromptI18n>();
const resources = new Map<string, IResourceI18n>();
const knowledge = new Map<string, IKnowledgeI18n>();

export const registerToolI18n = (name: string, dict: IToolI18n): void => {
	tools.set(name, dict);
};
export const registerPromptI18n = (name: string, dict: IPromptI18n): void => {
	prompts.set(name, dict);
};
export const registerResourceI18n = (
	uri: string,
	dict: IResourceI18n,
): void => {
	resources.set(uri, dict);
};
export const registerKnowledgeI18n = (
	id: string,
	dict: IKnowledgeI18n,
): void => {
	knowledge.set(id, dict);
};

// ─── Catalogue entries (one per tool/prompt/resource/knowledge) ──────────────
// Each new catalogue file imports its `*I18n` constant above and registers it
// here. The lookup helpers below fall back to English, then to undefined, so a
// stale entry (key changed without updating the catalogue) is harmless: the
// runtime description still renders.
registerToolI18n('mcp-vertex_overview', mcpVertexOverviewI18n);
registerToolI18n('proposals_auto_work', proposalsAutoWorkI18n);
registerToolI18n('memory_save', memorySaveI18n);

// ─── Lookup helpers ───────────────────────────────────────────────────────────

/** Pick the localized value from a per-language map with English fallback. */
const pick = <V>(
	record: Readonly<Record<Lang, V>> | undefined,
	lang: Lang,
): V | undefined => {
	if (!record) return undefined;
	return record[lang] ?? record.en;
};

/** Description of a tool in the active language (falls back to English). */
export const describeTool = (name: string, lang: Lang): string | undefined => {
	const dict = tools.get(name);
	const v = pick(dict?.description, lang);
	return v;
};

// ─── Validation API ───────────────────────────────────────────────────────────
// Used by `apps/web/scripts/check-i18n.ts` to enforce 12-lang completeness on
// every catalogue entry that opted in. Tools NOT in the catalogue are exempt:
// joining the catalogue is opt-in (each plugin declares its own entries as
// they get translated). Joining means committing to 12-lang immediately, so
// the gate cannot drift silently.

/** All catalogue entries that opted in, in insertion order. */
export const listRegisteredTools = (): ReadonlyArray<{
	readonly name: string;
	readonly dict: IToolI18n;
}> => Array.from(tools.entries()).map(([name, dict]) => ({ name, dict }));

/** Description of a single tool argument, if the catalogue has one. */
export const describeToolArg = (
	name: string,
	arg: string,
	lang: Lang,
): string | undefined => {
	const dict = tools.get(name);
	const args = dict?.arguments?.[arg];
	return pick(args, lang);
};

/** Description of a prompt in the active language (falls back to English). */
export const describePrompt = (
	name: string,
	lang: Lang,
): string | undefined => {
	const dict = prompts.get(name);
	return pick(dict?.description, lang);
};

/** Description of a single prompt argument, if the catalogue has one. */
export const describePromptArg = (
	name: string,
	arg: string,
	lang: Lang,
): string | undefined => {
	const dict = prompts.get(name);
	return pick(dict?.arguments?.[arg], lang);
};

/** Localized resource name (falls back to English, then to caller-provided default). */
export const describeResourceName = (
	uri: string,
	lang: Lang,
): string | undefined => {
	const dict = resources.get(uri);
	return pick(dict?.name, lang);
};

/** Description of a resource in the active language. */
export const describeResource = (
	uri: string,
	lang: Lang,
): string | undefined => {
	const dict = resources.get(uri);
	return pick(dict?.description, lang);
};

/** Title of a knowledge entry in the active language. */
export const describeKnowledge = (
	id: string,
	lang: Lang,
): string | undefined => {
	const dict = knowledge.get(id);
	return pick(dict?.title, lang);
};
