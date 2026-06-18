import type { IKnowledgeEntry } from '../contracts/interfaces/knowledge.interface';

/**
 * How a NEW project adopts mcp-vertex. This is the npm-readiness doc
 *: everything a host must provide lives in
 * `IMcpVertexHostConfig`; nothing project-specific hides inside the
 * framework.
 */
export const HOST_ONBOARDING_KNOWLEDGE: IKnowledgeEntry = {
	id: 'mcp-vertex-host-onboarding',
	title: 'Adopting @mcp-vertex/core in a new project',
	body: [
		'# Host onboarding',
		'',
		'1. Add the package and create a host-config module that returns an `IMcpVertexHostConfig`:',
		'   - `metadata`: name/version/description of YOUR server.',
		'   - `namespacePrefix`: your tool prefix (e.g. `myproj` → `myproj_*`).',
		'   - `workspace`: `createWorkspacePathProvider(<workspace root>)`.',
		'   - `pathLayout`: start from `DEFAULT_PATH_LAYOUT` (a `.cache/` scratch dir plus `docs/proposals/`); override any field.',
		'   - `proposalStore`: your proposal families, cascade order and folder names.',
		'   - `closeMarkers`: the literal close markers your agents must emit.',
		'   - `modelRouting`: your default model and per-role routes.',
		'   - `validationMatrix`: the quality-gate commands of YOUR repo, per scope.',
		'   - `statusCollectors`: optional seams wrapping your runtime (anything with `collect()`).',
		'   - `extraTools` / `extraPrompts`: your MCP registrations, in deterministic order (use `registerAfter` to anchor).',
		'2. Boot with `createMcpServer(config)` and call `.start()` (stdio transport).',
		'3. Register the server in your editor (e.g. `.vscode/mcp.json`) pointing at your entry file.',
		'4. The framework gives you: deterministic registration, workspace path resolution, the proposal engine (frontmatter, budgets, acceptance, parallelism, registry sync), the swarm runtime (round context, continuity policies, chat titling), file-level agent locks with heartbeat/GC, the persistent task queue, closure-report gates with injectable vocabulary, and the delivery verifier.',
		'5. Hard rule: mcp-vertex never imports host packages. If you need host data inside an engine, add a parameter to the engine, never an import.',
	].join('\n'),
};
