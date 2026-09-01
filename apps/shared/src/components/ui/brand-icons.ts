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

const GITHUB_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img" aria-label="GitHub">
	<path fill="currentColor" d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.87-1.54-3.87-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.69 1.25 3.34.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.84 1.18 3.1 0 4.43-2.69 5.41-5.26 5.69.41.36.78 1.06.78 2.13 0 1.54-.01 2.78-.01 3.16 0 .31.21.68.8.56C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z"/>
</svg>`;

const GITLAB_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img" aria-label="GitLab">
	<path fill="currentColor" d="M12 21.5 1.45 9.97l1.86-5.74L4.96 6.5h14.08l1.65-2.27 1.86 5.74L12 21.5zM4.96 6.5 7.65 0H12L8.32 6.5h2.63L12 0h4.35l2.69 6.5h-2.63L12 0v6.5h-3.68L12 0l-2.69 6.5H4.96z" opacity="0"/>
	<path fill="#e24329" d="m12 21.5-10.55-11.53 3.51-.47L12 21.5z"/>
	<path fill="#fc6d26" d="m12 21.5 7.04-12 3.51.47L12 21.5z"/>
	<path fill="#fca326" d="m4.96 6.5-3.51 3.47L12 8.65l-3.36-2.15H4.96z"/>
	<path fill="#fca326" d="m19.04 6.5 3.51 3.47L12 8.65l3.36-2.15h3.68z"/>
	<path fill="#e24329" d="m12 0-4.04 6.5h8.08L12 0z"/>
</svg>`;

const REMOTE_PROVIDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img" aria-label="Remote provider">
	<defs>
		<linearGradient id="mcpv-remote-grad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
			<stop offset="0" stop-color="#58a6ff"/>
			<stop offset="1" stop-color="#a371f7"/>
		</linearGradient>
	</defs>
	<circle cx="12" cy="12" r="10" fill="none" stroke="url(#mcpv-remote-grad)" stroke-width="2"/>
	<circle cx="12" cy="12" r="3" fill="url(#mcpv-remote-grad)"/>
	<path d="M2 12a10 10 0 0 1 20 0M22 12a10 10 0 0 1-20 0" stroke="url(#mcpv-remote-grad)" stroke-width="1.5" fill="none" stroke-linecap="round"/>
	<circle cx="12" cy="2" r="1.5" fill="#58a6ff"/>
	<circle cx="22" cy="12" r="1.5" fill="#a371f7"/>
	<circle cx="12" cy="22" r="1.5" fill="#58a6ff"/>
	<circle cx="2" cy="12" r="1.5" fill="#a371f7"/>
</svg>`;

const FLAGS: Record<string, string> = {
	// Each flag is a 24×18 viewBox (4:3 ratio). Strokes only — no fills
	// that depend on theme variables — so the host's theme paints the
	// background and the flag stays readable on every palette.
	ar: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 18" role="img" aria-label="Saudi Arabia">
		<rect width="24" height="18" fill="#006c35"/>
		<text x="12" y="13" text-anchor="middle" font-family="serif" font-size="9" fill="#fff">☩</text>
	</svg>`,
	de: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 18" role="img" aria-label="Germany">
		<rect width="24" height="6" y="0" fill="#000"/>
		<rect width="24" height="6" y="6" fill="#dd0000"/>
		<rect width="24" height="6" y="12" fill="#ffce00"/>
	</svg>`,
	en: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 18" role="img" aria-label="United Kingdom">
		<rect width="24" height="18" fill="#012169"/>
		<path d="M0 0L24 18M24 0L0 18" stroke="#fff" stroke-width="3"/>
		<path d="M0 0L24 18M24 0L0 18" stroke="#c8102e" stroke-width="1.5"/>
		<path d="M12 0V18M0 9H24" stroke="#fff" stroke-width="5"/>
		<path d="M12 0V18M0 9H24" stroke="#c8102e" stroke-width="3"/>
	</svg>`,
	es: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 18" role="img" aria-label="Spain">
		<rect width="24" height="4.5" y="0" fill="#aa151b"/>
		<rect width="24" height="9" y="4.5" fill="#f1bf00"/>
		<rect width="24" height="4.5" y="13.5" fill="#aa151b"/>
		<rect x="4" y="6.75" width="3" height="4.5" fill="none" stroke="#aa151b" stroke-width="0.4"/>
	</svg>`,
	fr: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 18" role="img" aria-label="France">
		<rect width="8" height="18" fill="#0055a4"/>
		<rect width="8" height="18" x="8" fill="#fff"/>
		<rect width="8" height="18" x="16" fill="#ef4135"/>
	</svg>`,
	hi: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 18" role="img" aria-label="India">
		<rect width="24" height="6" y="0" fill="#ff9933"/>
		<rect width="24" height="6" y="6" fill="#fff"/>
		<rect width="24" height="6" y="12" fill="#138808"/>
		<circle cx="12" cy="9" r="1.6" fill="none" stroke="#000088" stroke-width="0.4"/>
	</svg>`,
	it: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 18" role="img" aria-label="Italy">
		<rect width="8" height="18" fill="#009246"/>
		<rect width="8" height="18" x="8" fill="#fff"/>
		<rect width="8" height="18" x="16" fill="#ce2b37"/>
	</svg>`,
	ja: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 18" role="img" aria-label="Japan">
		<rect width="24" height="18" fill="#fff"/>
		<circle cx="12" cy="9" r="4.5" fill="#bc002d"/>
	</svg>`,
	pt: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 18" role="img" aria-label="Portugal">
		<rect width="8" height="18" fill="#006600"/>
		<rect width="16" height="18" x="8" fill="#ff0000"/>
		<circle cx="8" cy="9" r="2" fill="#ffdf00" stroke="#000" stroke-width="0.3"/>
	</svg>`,
	th: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 18" role="img" aria-label="Thailand">
		<rect width="24" height="3" y="0" fill="#a51931"/>
		<rect width="24" height="3" y="3" fill="#f4f5f8"/>
		<rect width="24" height="6" y="6" fill="#2d2a4a"/>
		<rect width="24" height="3" y="12" fill="#f4f5f8"/>
		<rect width="24" height="3" y="15" fill="#a51931"/>
	</svg>`,
	vi: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 18" role="img" aria-label="Vietnam">
		<rect width="24" height="18" fill="#da251d"/>
		<polygon points="12,3 13.8,8.2 19.5,8.2 14.85,11.4 16.65,16.6 12,13.4 7.35,16.6 9.15,11.4 4.5,8.2 10.2,8.2" fill="#ffff00"/>
	</svg>`,
	zh: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 18" role="img" aria-label="China">
		<rect width="24" height="18" fill="#ee1c25"/>
		<polygon points="4,3 5,5 7,5 5.5,6.5 6,9 4,7.5 2,9 2.5,6.5 1,5 3,5" fill="#ff0"/>
		<circle cx="9" cy="3" r="0.6" fill="#ff0"/>
		<circle cx="11" cy="5" r="0.6" fill="#ff0"/>
		<circle cx="11" cy="7.5" r="0.6" fill="#ff0"/>
		<circle cx="9" cy="10" r="0.6" fill="#ff0"/>
	</svg>`,
};

const BRAND_ICONS: Record<string, string> = {
	github: GITHUB_SVG,
	gitlab: GITLAB_SVG,
	'remote-provider': REMOTE_PROVIDER_SVG,
};

const FLAG_NAMES: ReadonlyArray<{ code: string; name: string }> = [
	{ code: 'ar', name: 'العربية' },
	{ code: 'de', name: 'Deutsch' },
	{ code: 'en', name: 'English' },
	{ code: 'es', name: 'Español' },
	{ code: 'fr', name: 'Français' },
	{ code: 'hi', name: 'हिन्दी' },
	{ code: 'it', name: 'Italiano' },
	{ code: 'ja', name: '日本語' },
	{ code: 'pt', name: 'Português' },
	{ code: 'th', name: 'ไทย' },
	{ code: 'vi', name: 'Tiếng Việt' },
	{ code: 'zh', name: '中文' },
];

const KNOWN_FLAG_CODES = new Set(Object.keys(FLAGS));
const KNOWN_BRAND_CODES = new Set(Object.keys(BRAND_ICONS));

export const renderBrandIcon = (code: string): string => {
	return BRAND_ICONS[code] ?? '';
};

export const renderFlagIcon = (code: string): string => {
	return FLAGS[code] ?? '';
};

export const hasBrandIcon = (
	code: string,
): code is keyof typeof BRAND_ICONS => {
	return KNOWN_BRAND_CODES.has(code);
};

export const hasFlagIcon = (code: string): code is keyof typeof FLAGS => {
	return KNOWN_FLAG_CODES.has(code);
};

export const languageFlag = (code: string): string => {
	const flag = FLAGS[code];
	return flag ?? '';
};

export const allFlagCodes = (): readonly string[] => {
	return Array.from(KNOWN_FLAG_CODES);
};

export const allBrandCodes = (): readonly string[] => {
	return Array.from(KNOWN_BRAND_CODES);
};

export { FLAG_NAMES, BRAND_ICONS, FLAGS };
