/**
 * `extensions/vscode/src/dev/welcome.ts` — thin re-export of the
 * shared `renderFirstRunScreen` / `renderQuickStartMenu` /
 * `CARDS` from `@mcp-vertex/shared/components/dev/welcome.ts`
 * (f00102 S4.6).
 *
 * Kept as its own file so the existing `entry.ts` import
 * (`from './welcome'`) keeps working without a rename, and so the
 * quick-start sessionStorage helpers (`isQuickStartDismissed` /
 * `dismissQuickStart`) live next to the only consumer that
 * imports them.
 *
 * If a future surface needs the same renderers (a CLI init
 * wizard, a JetBrains extension's first-launch panel), it imports
 * from `@mcp-vertex/shared/components/dev/welcome` directly —
 * this re-export is purely a stability seam for the dev preview.
 */
export {
	CARDS,
	dismissQuickStart,
	isQuickStartDismissed,
	renderFirstRunScreen,
	renderQuickStartMenu,
} from '@mcp-vertex/shared/components/dev/welcome';
