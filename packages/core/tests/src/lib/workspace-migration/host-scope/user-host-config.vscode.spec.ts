/**
 * user-host-config.vscode.spec.ts — VS Code's user `mcp.json`.
 */
import { describeHostMigration } from './host-migration-spec.helper';

describeHostMigration({
	hostId: 'copilot',
	file: '/h/.config/Code/User/mcp.json',
	oldName: '{"servers":{"mcp-vertex":{"command":"bun"}}}',
	oldLaunchShape:
		'{"servers":{"delendai":{"command":"bun","args":["--config=/p/mcp-vertex.config.json"]}}}',
	mixed: '{"servers":{"mine":{"args":["/x/mcp-vertex/run.js"]},"mcp-vertex":{"command":"bun"}}}',
	foreignName: 'mine',
	foreignText: '"mine"',
	clean: '{"servers":{"delendai":{"command":"bun"}}}',
});
