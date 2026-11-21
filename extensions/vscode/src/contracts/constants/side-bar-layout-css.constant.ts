/**
 * A side bar is far narrower than the editor area the dashboard was drawn for.
 * Below the shell's breakpoint the navigation folds behind its menu button and
 * flows above the content when opened, so it never sits over the content.
 */
export const SIDE_BAR_LAYOUT_CSS = `
.delendai-app-nav__mobile { display: none; }
.delendai-shell, .delendai-content { min-width: 0; max-width: 100%; }
@media (max-width: 960px) {
	.delendai-app-nav__mobile { display: block; }
	.delendai-app-nav { display: none; position: static; width: auto; max-width: 100%; }
	.delendai-app-nav.is-open { display: block; }
	.delendai-content, .delendai-main { overflow-x: auto; }
}
`;
