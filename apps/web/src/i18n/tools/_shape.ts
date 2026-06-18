// Tool / prompt / resource description i18n catalogue.
//
// One file per tool/prompt/resource/knowledge entry, each exporting a
// `IToolI18n` / `IPromptI18n` / `IResourceI18n` / `IKnowledgeI18n` shape:
//
//   {
//     description: Record<Lang, string>,            // required, 12 langs
//     arguments?: Record<key, Record<Lang, string>>, // optional, 12 langs each
//   }
//
// `apps/web/src/i18n/tools/index.ts` aggregates them and exposes lookup
// helpers (`describeTool`, `describePrompt`, `describeResource`,
// `describeKnowledge`) with graceful English fallback when a translation
// is missing. The fallback is what kept the site usable **before** this
// catalogue existed (server-side description was always English).
//
// The `check-i18n.ts` gate is NOT extended to require 12-language
// completeness on these files in this proposal: the catalogue starts
// empty by design so we ship the infrastructure without breaking the
// build. A future proposal (p106) will populate it language by language
// and then tighten the gate to require 12-lang completeness per entry.

import type { Lang } from '../shared';

export interface IToolI18n {
	readonly description: Readonly<Record<Lang, string>>;
	readonly arguments?: Readonly<
		Record<string, Readonly<Record<Lang, string>>>
	>;
}

export interface IPromptI18n {
	readonly description: Readonly<Record<Lang, string>>;
	readonly arguments?: Readonly<
		Record<string, Readonly<Record<Lang, string>>>
	>;
}

export interface IResourceI18n {
	readonly name: Readonly<Record<Lang, string>>;
	readonly description: Readonly<Record<Lang, string>>;
}

export interface IKnowledgeI18n {
	readonly title: Readonly<Record<Lang, string>>;
}
