/**
 * `*.scss?raw` ambient declarations — typed by the SCSS Bun.build
 * plugin in `tools/scripts/dev/dev.script.ts`. Both `./foo.scss` and
 * `./foo.scss?raw` resolve to a string module: the plugin reads the
 * file as UTF-8 and exports it as `default`. The downstream `.ts`
 * files (e.g. `dashboard-css.ts`) feed that string into
 * `sass.compileString(...)` to get the compiled CSS.
 *
 * We deliberately type the default export as `string` (not a `URL`).
 * Other bundlers treat `*.scss?raw` differently (Vite emits a `?raw`
 * suffix that resolves to a string); Bun's plugin shape is the same.
 */
declare module '*.scss?raw' {
	const content: string;
	export default content;
}
declare module '*.scss' {
	const content: string;
	export default content;
}
