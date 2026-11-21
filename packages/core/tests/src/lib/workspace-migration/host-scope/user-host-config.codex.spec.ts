/**
 * user-host-config.codex.spec.ts — Codex's `~/.codex/config.toml`.
 */
import { describeHostMigration } from './host-migration-spec.helper';

describeHostMigration({
	hostId: 'codex',
	file: '/h/.codex/config.toml',
	oldName: '[mcp_servers.mcp-vertex]\ncommand = "bun"\n',
	oldLaunchShape:
		'[mcp_servers.delendai]\ncommand = "bun"\nargs = ["--config=/p/mcp-vertex.config.json"]\n',
	mixed: '[mcp_servers.mine]\nargs = ["/x/mcp-vertex/run.js"]\n\n[mcp_servers.mcp-vertex]\ncommand = "bun"\n',
	foreignName: 'mine',
	foreignText: '[mcp_servers.mine]\nargs = ["/x/mcp-vertex/run.js"]\n',
	clean: '[mcp_servers.delendai]\ncommand = "bun"\n',
});
