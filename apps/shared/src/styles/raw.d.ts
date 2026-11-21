/**
 * `*.scss?raw` ambient declarations — typed by the SCSS Bun.build
 * plugin in `tools/scripts/dev/dev.script.ts`. The plugin reads the
 * file as UTF-8, compiles it through `sass.compileString`, and
 * exports the compiled CSS as a NAMED export `compiledCss` (not
 * default). The `?raw` form is kept for symmetry with Vite but
 * currently returns the same shape.
 *
 * Why named (and not default) export?
 *   - `splitting: true` in `Bun.build` deduplicates modules by
 *     path. Two `import { devPreviewCss } from
 *     '@delendai/.../dev-preview-css'` and `import compiledCss
 *     from './dev-preview.scss'` both end up in the same chunk;
 *     a default export gets emitted as `<basename>_default` and
 *     collides on re-export. Named exports share the same
 *     identifier and Bun.build's chunk merger keeps one.
 *   - The wrapper `*-css.ts` files can do
 *     `export const devPreviewCss = compiledCss;` without
 *     re-binding, and the consumer's `import { devPreviewCss }`
 *     resolves straight through.
 */
declare module '*.scss?raw' {
	export const compiledCss: string;
}
declare module '*.scss' {
	export const compiledCss: string;
}
