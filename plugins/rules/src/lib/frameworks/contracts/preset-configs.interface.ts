/**
 * Single Responsibility: declare the file-shaped DATA a preset ships.
 * The manifest writer depends on this and nothing else; the
 * command provider depends on the *language* (not the file contents).
 *
 * Interface Segregation: `get_rules` does not need this — it only
 * shows the `conventions` bullets. `ensureRulesCache` is the *only*
 * legitimate consumer of the file contents.
 */
export interface IPresetConfigs {
	/** Cache filename for the materialised linter config. */
	readonly linterConfigFile: string;
	/** Cache filename for the materialised typecheck config (optional). */
	readonly typecheckConfigFile?: string;
	/** Linter config file contents (text). DATA only — no logic. */
	readonly linterConfigContent: string;
	/** Typecheck config file contents (text), optional. */
	readonly typecheckConfigContent?: string;
}
