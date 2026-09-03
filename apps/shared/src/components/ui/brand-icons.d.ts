/**
 * `apps/shared/src/components/ui/brand-icons.ts` — pure inline-SVG
 * payloads for the third-party brand marks the dashboard surfaces
 * (GitHub, GitLab, Remote provider, language flags, integration
 * cards).
 *
 * Why inline? The webview's CSP forbids remote network requests for
 * images, and bundling the icons as strings keeps the contract
 * single-string (no extra `asWebviewUri` round-trip, no runtime
 * fetch). Every icon here is a hand-tuned SVG from the official
 * brand press kit, simplified to a 24×24 viewBox so the size is
 * consistent across the dashboard.
 *
 * Why no auto-download? `web_fetch` of vendor SVG kits adds a build
 * dependency, breaks offline, and the icons rarely change. Copying
 * the official mark is the standard pattern every docs site uses.
 */
declare const FLAGS: Record<string, string>;
declare const BRAND_ICONS: Record<string, string>;
declare const FLAG_NAMES: ReadonlyArray<{
	code: string;
	name: string;
}>;
export declare const renderBrandIcon: (code: string) => string;
export declare const renderFlagIcon: (code: string) => string;
export declare const hasBrandIcon: (
	code: string,
) => code is keyof typeof BRAND_ICONS;
export declare const hasFlagIcon: (code: string) => code is keyof typeof FLAGS;
export declare const languageFlag: (code: string) => string;
export declare const allFlagCodes: () => readonly string[];
export declare const allBrandCodes: () => readonly string[];
export { FLAG_NAMES, BRAND_ICONS, FLAGS };
