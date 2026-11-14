/** Decides which environment variables are shown and which are hidden. */
export interface IEnvRedactionPolicy {
	/** A variable whose name matches is shown as the placeholder. */
	readonly secretNamePattern: RegExp;
	/** Names that are never hidden, whatever their spelling. */
	readonly allowNames: readonly string[];
	/** What a hidden value is shown as. */
	readonly placeholder: string;
}
