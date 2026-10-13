/**
 * scss-preload.ts — x00162 S2.
 *
 * Registers `scssPlugin` globally for `bun test` via `bunfig.toml`'s
 * `[test].preload`. Production bundling already wires the same plugin
 * directly into its own `Bun.build({ plugins: [scssPlugin] })` call
 * (see `bundle-js.ts`); tests need the equivalent because any spec
 * that transitively imports a `.scss` file (shared webview-rendering
 * helpers under `apps/shared/src/styles/`) otherwise sees the raw,
 * unparsed SCSS source and a `SyntaxError: Export named 'compiledCss'
 * not found`.
 */
import { plugin } from 'bun';

import { scssPlugin } from './scss-plugin';

plugin(scssPlugin);
