/**
 * Single Responsibility: the agent-facing bullets for a preset.
 * `get_rules.conventions[presetId]` consumes only this; it never
 * reads the file contents (segregated from `IPresetConfigs`).
 */
export interface IPresetConventions {
	/**
	 * 3-7 idiomatic do/don't bullets per language. The S3 spec
	 * rejects generic ESLint-style advice; the bullets must be
	 * language-specific.
	 */
	readonly conventions: readonly string[];
}
