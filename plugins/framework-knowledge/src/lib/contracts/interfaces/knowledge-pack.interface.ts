import type { IKnowledgeRecord } from './knowledge-record.interface';

/**
 * Something a rule can be counted by in the project: files under
 * `directory` whose name ends with `suffix` and whose text holds `marker`.
 */
export interface IKnowledgePackPattern {
	readonly directory: string;
	readonly suffix: string;
	readonly marker: string;
}

/** One rule as the project writes it in a pack file. */
export interface IKnowledgePackRule {
	readonly id: string;
	readonly topic: string;
	readonly statement: string;
	readonly force: string;
	/** A version range: `*`, or comparators such as `>=17 <19`. */
	readonly appliesTo: string;
	readonly source: string;
	readonly retrievedAt: string;
	readonly pattern?: IKnowledgePackPattern;
}

/** A pack file: `.delendai/knowledge/<framework>.json`. */
export interface IKnowledgePack {
	readonly framework: string;
	readonly rules: readonly IKnowledgePackRule[];
}

/** What a pack holds for one resolved version. */
export interface IKnowledgePackSelection {
	/** The pack file the rules came from, relative to the workspace. */
	readonly packFile: string;
	readonly records: readonly IKnowledgeRecord[];
	/** Countable patterns of the selected rules, by rule id. */
	readonly patterns: Readonly<Record<string, IKnowledgePackPattern>>;
	/** Rules the pack holds that are malformed, with why. */
	readonly rejected: readonly string[];
}
