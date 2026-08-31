/**
 * `tools/scripts/dev/api/setup-install.spec.ts` — pin the
 * contract for `runSetupInstall` so the four branches the
 * install path can take (fresh / already-declared / nested-splice /
 * unparseable) do not regress.
 *
 * Why a spec, and not an inline `bun -e` regression script?
 * The contract is wide enough that:
 *   - the original JSON-parse branch (JSONC) is easy to break
 *     by forgetting that the existing `mcp.json` may have a
 *     comment + a sibling server.
 *   - the new `spliceIntoNestedObject` path is a 70-line brace
 *     walker; missing one indent level or off-by-one in the
 *     depth counter shows up as silent corruption of a user's
 *     config.
 *   - the safety guard that refuses to overwrite a non-object
 *     `servers` field is the difference between a friendly
 *     "add the entry manually" note and a 3am rollback.
 *
 * Pinned contract:
 *   1. Empty workspace         → all three files written fresh.
 *   2. mcp.json already has    → skipped, no write.
 *      servers.mcp-vertex
 *   3. mcp.json with other     → splice (comments + sibling
 *      server preserved).
 *   4. mcp.json with            → skipped with descriptive
 *      "servers": "not-an-object"  reason; no write.
 *   5. mcp.json unparseable     → skipped with "unparseable".
 *   6. settings.json missing   → written fresh.
 *   7. settings.json with      → skipped.
 *      mcp-vertex.server
 *   8. mcp-vertex.config.json  → skipped (always; never
 *      existing                 overwritten).
 *
 * Every test uses a fresh `mkdtempSync` dir to keep the cases
 * isolated and parallel-safe (vitest by default runs the
 * describe blocks concurrently).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
	mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runSetupInstall } from './setup-install';

const setupTmpDir = (): string => mkdtempSync(join(tmpdir(), 'setup-install-'));

const readJsonc = (path: string): unknown => {
	const raw = readFileSync(path, 'utf8');
	const cleaned = raw
		.replace(/^\uFEFF/, '')
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/(^|[^:])\/\/.*$/gm, '$1')
		.replace(/,(\s*[}\]])/g, '$1');
	return JSON.parse(cleaned);
};

describe('runSetupInstall', () => {
	let cwd: string;

	beforeEach(() => {
		cwd = setupTmpDir();
		mkdirSync(join(cwd, '.vscode'), { recursive: true });
	});

	afterEach(() => {
		rmSync(cwd, { recursive: true, force: true });
	});

	it('writes a fresh mcp.json + settings.json + config on an empty workspace', () => {
		const result = runSetupInstall(cwd);
		expect(result.ok).toBe(true);
		expect(result.written).toContain('.vscode/mcp.json');
		expect(result.written).toContain('.vscode/settings.json');
		expect(result.written).toContain('mcp-vertex.config.json');
		expect(result.skipped).toEqual([]);
		const mcp = readJsonc(join(cwd, '.vscode/mcp.json')) as {
			servers: { 'mcp-vertex': { command: string } };
		};
		expect(mcp.servers['mcp-vertex'].command).toBe('bun');
	});

	it('skips mcp.json when servers.mcp-vertex is already declared (no rewrite)', () => {
		const mcpPath = join(cwd, '.vscode', 'mcp.json');
		const before = `{
  "servers": {
    "mcp-vertex": {
      "type": "stdio",
      "command": "bun",
      "args": ["run", "mcp-vertex"]
    }
  }
}
`;
		writeFileSync(mcpPath, before);
		const result = runSetupInstall(cwd);
		expect(result.skipped.some((s) => s.includes('mcp.json'))).toBe(true);
		expect(readFileSync(mcpPath, 'utf8')).toBe(before);
	});

	it('splices mcp-vertex into an existing mcp.json with sibling server + JSONC comment', () => {
		const mcpPath = join(cwd, '.vscode', 'mcp.json');
		const before = `{
  // my own server
  "servers": {
    "my-server": { "type": "stdio", "command": "foo", "args": ["bar"] }
  }
}
`;
		writeFileSync(mcpPath, before);
		const result = runSetupInstall(cwd);
		expect(result.written).toContain('.vscode/mcp.json');
		const after = readFileSync(mcpPath, 'utf8');
		expect(after).toContain('// my own server');
		expect(after).toContain('"my-server"');
		expect(after).toContain('"mcp-vertex"');
		// Round-trip: parsed result must contain both servers.
		const parsed = readJsonc(mcpPath) as {
			servers: Record<string, { command: string }>;
		};
		expect(Object.keys(parsed.servers).sort()).toEqual([
			'mcp-vertex',
			'my-server',
		]);
		expect(parsed.servers['mcp-vertex']?.command).toBe('bun');
		expect(parsed.servers['my-server']?.command).toBe('foo');
	});

	it('refuses to rewrite when existing "servers" is not an object', () => {
		const mcpPath = join(cwd, '.vscode', 'mcp.json');
		writeFileSync(mcpPath, '{ "servers": "not-an-object" }\n');
		const before = readFileSync(mcpPath, 'utf8');
		const result = runSetupInstall(cwd);
		expect(result.written).not.toContain('.vscode/mcp.json');
		expect(result.skipped.some((s) => s.includes('not an object'))).toBe(
			true,
		);
		expect(readFileSync(mcpPath, 'utf8')).toBe(before);
	});

	it('skips mcp.json when it is unparseable (does not clobber)', () => {
		const mcpPath = join(cwd, '.vscode', 'mcp.json');
		const before = '{ servers: { mcp-vertex: { oops, } }\n';
		writeFileSync(mcpPath, before);
		const result = runSetupInstall(cwd);
		expect(result.written).not.toContain('.vscode/mcp.json');
		expect(result.skipped.some((s) => s.includes('unparseable'))).toBe(
			true,
		);
		expect(readFileSync(mcpPath, 'utf8')).toBe(before);
	});

	it('skips an existing mcp-vertex.config.json (never overwrites curated preset)', () => {
		const configPath = join(cwd, 'mcp-vertex.config.json');
		const before = '{ "preset": "minimal", "plugins": [] }\n';
		writeFileSync(configPath, before);
		const result = runSetupInstall(cwd);
		expect(result.written).not.toContain('mcp-vertex.config.json');
		expect(
			result.skipped.some((s) => s.includes('mcp-vertex.config.json')),
		).toBe(true);
		expect(readFileSync(configPath, 'utf8')).toBe(before);
	});

	it('skips settings.json when mcp-vertex.server is already declared', () => {
		const settingsPath = join(cwd, '.vscode', 'settings.json');
		const before =
			'{ "mcp-vertex.server": { "command": "bun", "args": [] } }\n';
		writeFileSync(settingsPath, before);
		const result = runSetupInstall(cwd);
		expect(result.written).not.toContain('.vscode/settings.json');
		expect(readFileSync(settingsPath, 'utf8')).toBe(before);
	});

	it('splices mcp-vertex.server into an existing settings.json without clobbering siblings', () => {
		const settingsPath = join(cwd, '.vscode', 'settings.json');
		const before = '{\n  "editor.formatOnSave": true\n}\n';
		writeFileSync(settingsPath, before);
		const result = runSetupInstall(cwd);
		expect(result.written).toContain('.vscode/settings.json');
		const after = readFileSync(settingsPath, 'utf8');
		expect(after).toContain('"editor.formatOnSave": true');
		expect(after).toContain('"mcp-vertex.server"');
		const parsed = readJsonc(settingsPath) as {
			'editor.formatOnSave': boolean;
			'mcp-vertex.server': { command: string };
		};
		expect(parsed['editor.formatOnSave']).toBe(true);
		expect(parsed['mcp-vertex.server'].command).toBe('bun');
	});

	it('returns a non-empty note and an empty skipped list on a clean install', () => {
		const result = runSetupInstall(cwd);
		expect(result.skipped).toEqual([]);
		expect(result.note).toMatch(/^Wrote the missing mcp-vertex files\./);
	});
});
