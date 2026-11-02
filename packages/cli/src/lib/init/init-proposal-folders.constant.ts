/**
 * init-proposal-folders.constant — single source of truth for the
 * canonical proposal status folder names used by the `init` family of
 * commands.
 *
 * Hoisted out of `init-render.service.ts` to break a circular-import
 * trap: the migration helpers (`init-migrate-offer.service.ts`,
 * `init-foreign-detect.service.ts`) needed the list, but the render
 * module imports from them too. With the constant declared at the
 * bottom of `init-render.service.ts`, any top-level reference from
 * the helpers would hit a TDZ (`Cannot access 'PROPOSAL_STATUS_FOLDERS'
 * before initialization`). The constant here is loaded eagerly at
 * module-init time and is safe to import from anywhere.
 *
 * The CLI keeps a local mirror of the status list (instead of
 * importing from the plugin) because `proposals` is opt-in: the
 * CLI must build and run even when the plugin is absent. A
 * divergence between this list and the plugin's `PROPOSAL_STATUSES`
 * is caught by `init-render.spec.ts` (see the `proposals-folders
 * -match-plugin-statuses` test).
 */
export const PROPOSAL_STATUS_FOLDERS: readonly string[] = [
	'ready',
	'in-progress',
	'review',
	'done',
	'paused',
	'blocked',
	'retired',
];
