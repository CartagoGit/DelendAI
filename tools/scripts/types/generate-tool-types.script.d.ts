/**
 * generate-tool-types.ts — N23 generated tool-output SDK.
 *
 * Assembles the canonical reference server (every shipped plugin),
 * harvests each tool's Zod `outputSchema`, converts it to JSON Schema
 * via `z.toJSONSchema` (Zod v4, zero extra deps) and writes one
 * `src/generated/tool-outputs.ts` per package using the pure emitter in
 * `emit-tool-types.script.ts`.
 *
 *     bun run types:generate          # write the files
 *
 * The pure routing/emitting lives in `emit-tool-types.script.ts`; the only
 * impure parts here are assembling the server and writing files. The
 * harvester is exported so the drift-guard test can compare the
 * checked-in files against a fresh in-memory generation.
 */
import { type IHarvestedTool } from './emit-tool-types.script';
/**
 * Assemble the reference server with every plugin and harvest each
 * tool's output JSON Schema. Closes the server before returning so no
 * background watcher keeps the process (or the test runner) alive.
 */
export declare const harvestToolSchemas: () => Promise<IHarvestedTool[]>;
/** Generate the file map (path relative to repo root → content). */
export declare const generateToolOutputModules: () => Promise<
	Map<string, string>
>;
