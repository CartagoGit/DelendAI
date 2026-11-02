/**
 * help-translation.interface.ts — f00037 contract surface for
 * `contracts/constants/help-translation.constant.ts`.
 *
 * The translation table is keyed by language; each row follows this
 * shape. The shape lives here (and not in the constant module) because
 * f00037 reserves `contracts/constants/` for **values**, not for type
 * declarations. Consumers that only need the row shape can `import
 * type` this file without dragging the i18n dictionary along.
 */

export interface IHelpTranslation {
	readonly usage: string;
	readonly globalFlags: string;
	readonly commands: string;
	readonly flagWorkspace: string;
	readonly flagRemote: string;
	readonly flagPlugins: string;
	readonly flagPreset: string;
	readonly flagConfig: string;
	readonly flagAgentWorktree: string;
	readonly flagJson: string;
	readonly flagHelp: string;
	readonly flagVersion: string;
	readonly commandSummaries: Readonly<Record<string, string>>;
}
