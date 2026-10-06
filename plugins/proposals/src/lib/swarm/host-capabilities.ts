/**
 * host-capabilities.ts — Solid Open/Closed + Dependency Inversion.
 *
 * The chat-titling reminder needs to know whether the host IDE exposes
 * a programmatic chat-rename action, and how to phrase the manual-
 * rename instructions in the user's vocabulary. Before this split,
 * `chat-titling-reminder.ts` violated two SOLID principles:
 *
 *   1. **OCP**: every new host (Cursor, Windsurf, JetBrains AI Assistant,
 *      an eventual Copilot Chat release that registers the rename
 *      action) would have required editing the reminder module to add
 *      a new literal branch. The reminder's only knob was a hardcoded
 *      string.
 *
 *   2. **DIP**: the reminder depended on the *concrete* knowledge that
 *      "we run on VS Code 1.123 / Copilot Chat 0.43 and `workbench.
 *      action.chat.rename` is not registered". That made the reminder
 *      untestable without monkey-patching globals, and coupled the
 *      orchestrator's domain (chat titling) to a host release number.
 *
 * With `IHostCapabilities`:
 *
 *   - The reminder depends on a small data interface, not on literals.
 *   - Hosts register concrete capabilities via `ctx.options.hostCapabilities`
 *     or via the default `createDefaultHostCapabilities()` below.
 *   - A new Copilot release that *does* expose `workbench.action.chat.
 *     rename` flips `renameable: true` and the reminder switches
 *     branches without code changes.
 *   - Tests inject a stub `IHostCapabilities` to assert branching
 *     without depending on the real VS Code release.
 */

export interface IHostCapabilities {
	/**
	 * Friendly name of the IDE that hosts the chat session. Used in
	 * user-facing prose ("the VS Code sidebar", "the Cursor panel").
	 */
	readonly ideDisplayName: string;
	/**
	 * Where the chat session title lives in the IDE. Used to phrase
	 * "auto-derived from the first prompt" without leaking the
	 * product name twice.
	 */
	readonly chatPanelLocation: string;
	/**
	 * Phrase the user follows to open the rename UI ("right-click the
	 * editor tab → **Rename**" for VS Code).
	 */
	readonly manualRenameInstruction: string;
	/**
	 * The fully-qualified action id the orchestrator would invoke if
	 * the host exposed a programmatic rename. `null` when the action
	 * is not registered in the current release.
	 */
	readonly programmaticRenameActionId: string | null;
	/**
	 * Human-readable reason the programmatic action is not available.
	 * Rendered into the reminder when `programmaticRenameActionId` is
	 * `null`. `null` itself when the action IS available and the
	 * reminder should not mention the workaround.
	 */
	readonly programmaticRenameBlockedReason: string | null;
	/**
	 * The cap the user must observe when picking a title. Defaults to
	 * the project's `CHAT_TITLING_PREFIX_MAX_LENGTH` (40) but exposed
	 * here so other hosts can override (e.g. a future IDE with a
	 * 60-character sidebar).
	 */
	readonly prefixCharCap: number;
}

/**
 * The capabilities of the default host: VS Code with Copilot Chat
 * 0.43, where `workbench.action.chat.rename` is not registered.
 *
 * When Copilot Chat ships a release that registers the action, hosts
 * can register a different capability object via
 * `ctx.options.hostCapabilities` and the reminder will switch branches
 * without any code edit here.
 */
export const VSCODE_COPILOT_043_CAPABILITIES: IHostCapabilities = {
	ideDisplayName: 'VS Code',
	chatPanelLocation: 'sidebar',
	manualRenameInstruction: 'right-click the editor tab → **Rename**',
	programmaticRenameActionId: 'workbench.action.chat.rename',
	// Phrased to slot into the reminder as
	// `(no \`<actionId>\` — <reason>)`. The em-dash separates the
	// absent action from the reason it is absent.
	programmaticRenameBlockedReason:
		'not registered in VS Code 1.123 / Copilot Chat 0.43',
	prefixCharCap: 40,
};

/**
 * A host-agnostic default that the reminder can fall back to when no
 * `hostCapabilities` are registered. The text is intentionally generic
 * ("the IDE sidebar", "right-click the chat tab → **Rename**") so
 * that:
 *
 *   1. The plugin does not leak a vendor name when the host is
 *      unknown.
 *   2. A new host only needs to plug in its own `IHostCapabilities`
 *      object to get accurate prose.
 */
export const GENERIC_IDE_CAPABILITIES: IHostCapabilities = {
	ideDisplayName: 'the IDE',
	chatPanelLocation: 'sidebar',
	manualRenameInstruction: 'right-click the chat tab → **Rename**',
	programmaticRenameActionId: null,
	programmaticRenameBlockedReason:
		'no programmatic chat-rename action is registered in this host',
	prefixCharCap: 40,
};

/**
 * Default capabilities — r00003 S8 (F3): the **generic** IDE set, NOT the
 * VS Code / Copilot one. The plugin is host-agnostic, so an
 * orchestrator that has not registered `ctx.options.hostCapabilities`
 * must never leak a vendor name or a host release number into the
 * reminder. A VS Code host opts into the richer prose explicitly by
 * registering `VSCODE_COPILOT_043_CAPABILITIES` (or its own object).
 */
export const createDefaultHostCapabilities = (): IHostCapabilities =>
	GENERIC_IDE_CAPABILITIES;
