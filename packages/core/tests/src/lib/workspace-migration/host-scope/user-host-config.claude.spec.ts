/**
 * user-host-config.claude.spec.ts — Claude's `~/.claude.json`.
 */
import { describeHostMigration } from './host-migration-spec.helper';

describeHostMigration({
	hostId: 'claude',
	file: '/h/.claude.json',
	oldName: '{"mcpServers":{"mcp-vertex":{"command":"bun"}}}',
	oldLaunchShape:
		'{"mcpServers":{"delendai":{"command":"bun","args":["--config=/p/mcp-vertex.config.json"]}}}',
	mixed: '{"mcpServers":{"mine":{"args":["/x/mcp-vertex/run.js"]},"mcp-vertex":{"command":"bun"}}}',
	foreignName: 'mine',
	foreignText: '"mine"',
	clean: '{"mcpServers":{"delendai":{"command":"bun"}}}',
});
