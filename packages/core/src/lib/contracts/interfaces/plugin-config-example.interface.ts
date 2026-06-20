/**
 * `IPluginConfigExample` — contract a plugin can implement so the docs
 * site can render a ready-to-copy `mcp-vertex.config.json` snippet for
 * each plugin. See p100 s6.
 *
 * Plugins opt in by exporting a `configExample` object (or by adding
 * it to their `IMcpPlugin`). The docs site reads it via
 * `gen-capabilities.ts` and renders it inside a `<pre><code>` block on
 * `/plugins/<slug>`. A "copy" button is layered on top via a small
 * inline script.
 *
 * Why opt-in: not every plugin has user-facing config (e.g. the core
 * meta tools). Plugins without a `configExample` simply skip the
 * "Configuration" section on their page — the site never shows an
 * empty section.
 *
 * SRP: this interface only describes the SHAPE of the example. The
 * docs site is responsible for rendering; the plugin is responsible
 * for keeping the example up to date. The interface does NOT promise
 * the example is runnable as-is — it is a starting point, just like
 * the other scaffold outputs.
 */

export interface IPluginConfigExample {
	/**
	 * One-line, human-readable summary of what the plugin does when
	 * configured this way. Surfaced as the lead paragraph above the
	 * JSON block. Keep it short — one sentence.
	 */
	readonly summary: string;
	/**
	 * The example config object. Will be serialised with
	 * `JSON.stringify(value, null, 2)` and rendered as preformatted
	 * text. The shape MUST match what `mcp-vertex.config.json` accepts
	 * for this plugin (i.e. the keys under
	 * `plugins.<pluginShortName>.options`); the docs site wraps it in
	 * the outer object so users can copy-paste the whole file.
	 *
	 * The contract is "valid JSON, valid per the plugin's own runtime
	 * schema"; the core does not validate it. Plugins that want to
	 * assert "this example is up-to-date" should add a unit test that
	 * parses the example with the plugin's own Zod schema.
	 */
	readonly options: Readonly<Record<string, unknown>>;
}
