# Agent Loop Detection & Handoff Protocol

This document defines the in-process loop detection and handoff protocol implemented in `@mcp-vertex/core` via the `proposals` and `notification` plugins.

---

## 1. Context and Problem

AI agents (LLMs) running inside autonomous loops can occasionally become stuck in infinite loops. This generally manifests in two ways:
1. **Repetitive Tool Calls**: The agent repeatedly calls a tool (like `read_file` or `grep_search`) with the same or near-identical arguments because it believes it has not received the correct information.
2. **Intention without Progress (Git Stalling)**: The agent declares that it is modifying a file (e.g. "I am applying a fix to `foo.ts`") but the tool execution fails to make actual changes (the file is not written/modified, or git diff does not change), leading to a stall.

Since MCP is a stdio-based stateless protocol, the server cannot force the agent to stop directly. Instead, the loop detector acts as an **in-process observer** that monitors the stream of tool executions, halts the execution with a `stop: true` directive if a loop is detected, writes a portable state packet (handoff packet) to disk, and pushes a warning notification to the host client.

---

## 2. Active Detection Signals

The loop detector tracks a sliding window of recent tool calls (default size: 50) per active agent and evaluates two signals:

### 2.1 Exact-Repeat Detection
- **Trigger**: The same tool is invoked with the exact same arguments (by SHA-256 hash of serialized args) consecutively or multiple times within the window.
- **Default Threshold**: 3 calls.
- **Result**: The agent is flagged as stuck with reason `exact-repeat`.

### 2.2 Git No-Progress Detection
- **Trigger**: The agent invokes file-modifying tools (like `edit_file`, `write_file`, `multi_replace_string_in_file`, etc.) consecutively, but the workspace `git diff --stat` remains unchanged across those calls.
- **Default Threshold**: 3 calls.
- **Result**: The agent is flagged as stuck with reason `no-progress`.

---

## 3. The Handoff Packet Schema

When an agent is flagged as stuck, a JSON file is written to `.mcp-vertex/handoff/<agent>-<timestamp>.json` with the following structure. Secrets (like Stripe keys, database passwords, or auth headers) are automatically redacted using `redactSecrets`.

```json
{
  "schema": "mcp-vertex/handoff/1",
  "createdAt": "2026-06-20T12:34:56.789Z",
  "reason": "exact-repeat | no-progress",
  "signals": {
    "repeatCount": 3,
    "nearRepeatCount": 0,
    "idleCount": 0,
    "noProgressCount": 0
  },
  "from": {
    "agent": "my-agent",
    "model": "unknown"
  },
  "workspaceRoot": "/absolute/path/to/workspace",
  "activeLocks": [
    {
      "task_id": "l103-s7",
      "agent": "my-agent",
      "ownership": ["plugins/notification/src/lib/tools.ts"]
    }
  ],
  "currentProposal": {
    "id": "l103",
    "title": "Agent Loop Detection & Handoff",
    "status": "in-progress"
  },
  "roundContextDigestPath": "/absolute/path/to/workspace/.cache/mcp-vertex/proposals/round-context.digest.json",
  "recentToolCalls": [
    {
      "ts": "2026-06-20T12:34:50.000Z",
      "tool": "read_file",
      "args": {
        "path": "foo.ts",
        "secret_key": "[REDACTED]"
      }
    }
  ],
  "gitHead": "a1b2c3d4e5f6...",
  "gitDirtySummary": "M plugins/notification/src/lib/tools.ts",
  "instructionsForNextAgent": ""
}
```

---

## 4. Configuration

The detector is enabled by default. It can be configured globally in `mcp-vertex.config.json` under the root `loopDetector` key:

```json
{
  "loopDetector": {
    "enabled": true,
    "repeatThreshold": 8,
    "nearRepeatThreshold": 5,
    "similarityThreshold": 0.9,
    "idleThreshold": 3,
    "noProgressThreshold": 3,
    "ringSize": 50,
    "gitCheckTools": [
      "edit_file",
      "write_file",
      "multi_replace_string_in_file",
      "replace_string_in_file"
    ],
    "handoffDir": ".mcp-vertex/handoff",
    "handoffTtlDays": 7,
    "notifyOnDetect": true,
    "interactiveAgentPatterns": ["*-default", "default-*", "host", "interactive"]
  }
}
```

### Interactive host sessions are excluded by default

The detector was originally tuned for **swarm agents** (long-running
background workers that claim slices via `agent_lock`). For those
agents, calling the same `edit_file` 3 times in a row is unambiguous
stuck and the original `repeatThreshold: 3` was reasonable.

But **interactive host sessions** (Copilot chat, Cursor tab,
Windsurf etc.) legitimately re-call orient tools like
`proposals_continue_proposal`, `proposals_round_context` and
`proposals_auto_work` multiple times in a row while the human drives.
At `repeatThreshold: 3` that produced false-positive stuck warnings
on every working session, even when the agent is making progress.

To keep both audiences working, the detector now:

- Defaults `repeatThreshold` to **8** (high enough that interactive
  re-orient calls do not trip it; still unambiguously stuck for any
  swarm agent).
- Maintains a per-config list `interactiveAgentPatterns` of agent
  names or wildcard patterns that are **completely ignored** by the
  detector (no window accumulation, no verdict, no handoff packet).
  Defaults to `["*-default", "default-*", "host", "interactive"]`
  which covers every host that calls its user-facing session
  `*-default`. Hosts whose interactive session is named differently
  can extend the list from `mcp-vertex.config.json`.
- The empty list (`[]`) opts back into universal monitoring — useful
  in CI or for hosts that want to police every agent unconditionally.

### CLI Overrides
You can temporarily change thresholds or disable the detector per-session via command-line arguments:
- Disable loop detection: `mcp-vertex --no-loop-detector`
- Customize repeat threshold: `mcp-vertex --loop-detector.repeat-threshold=5`
- Change handoff directory: `mcp-vertex --loop-detector.handoff-dir=/tmp/handoff`
- Tighten or relax the interactive-agent ignore list:
  `mcp-vertex --loop-detector.interactive-agent-patterns=*-default,cursor-*`
  (empty value disables the ignore list entirely)

---

## 5. Host Integration & Handoff Flow

When a loop detector fires:
1. The server intercepts the next tool call and returns `{ __stuck_detected: true, handoffPath: "...", suggestedAction: "..." }` in `structuredContent`.
2. If `notification` plugin is loaded, the server pushes an MCP `notifications/message` log payload containing:
   ```json
   {
     "event": "stuck-detected",
     "agent": "my-agent",
     "reason": "exact-repeat",
     "handoffPath": ".mcp-vertex/handoff/my-agent-1234567.json"
   }
   ```
3. **The Host Reaction**:
   - The IDE or host agent (e.g. Antigravity) receives the `stuck-detected` warning.
   - It terminates the current stuck agent instance.
   - It reads the handoff JSON file to recover the workspace status (locks, dirty git files, active proposals).
   - It boots a new agent instance (perhaps using a different or more powerful model) and initializes it with the handoff payload, allowing the new agent to resume the task immediately without user intervention.
