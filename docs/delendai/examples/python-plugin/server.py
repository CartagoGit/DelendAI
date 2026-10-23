#!/usr/bin/env python3
"""A delendai plugin written in Python: an MCP server over stdio.

Standard library only. It speaks newline-delimited JSON-RPC 2.0, opens the
MCP session (initialize, then notifications/initialized) before it answers
any request, and offers one tool, `greet`.
"""
import json
import sys

TOOLS = [
    {
        "name": "greet",
        "description": "Greets someone by name.",
        "inputSchema": {
            "type": "object",
            "properties": {"name": {"type": "string"}},
            "required": ["name"],
        },
    }
]

initialized = False


def reply(message_id, result=None, error=None):
    body = {"jsonrpc": "2.0", "id": message_id}
    if error is not None:
        body["error"] = error
    else:
        body["result"] = result
    sys.stdout.write(json.dumps(body) + "\n")
    sys.stdout.flush()


def handle(message):
    global initialized
    method = message.get("method")
    message_id = message.get("id")
    params = message.get("params") or {}
    if method == "initialize":
        reply(
            message_id,
            {
                "protocolVersion": params.get("protocolVersion", "2025-06-18"),
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "greeter", "version": "0.1.0"},
            },
        )
        return
    if method == "notifications/initialized":
        initialized = True
        return
    if message_id is None:
        return
    if not initialized:
        reply(message_id, error={"code": -32002, "message": "session not initialized"})
        return
    if method == "tools/list":
        reply(message_id, {"tools": TOOLS})
        return
    if method == "tools/call" and params.get("name") == "greet":
        name = (params.get("arguments") or {}).get("name", "world")
        reply(message_id, {"content": [{"type": "text", "text": f"Hello, {name}!"}]})
        return
    reply(message_id, error={"code": -32601, "message": f"unknown method {method}"})


for line in sys.stdin:
    line = line.strip()
    if line:
        handle(json.loads(line))
