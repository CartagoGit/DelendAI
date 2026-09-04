# @delendai/env

Environment configuration diagnostics for [@delendai/core](../../packages/core).
The plugin is read-only: it parses `.env`, validates presence and type against a
derived schema, and explains which variables unlock which plugin or provider
capabilities. Values are always redacted to presence-only signals.

## Tools

### `env_check`

Validate a dotenv file and return normalized findings.

- Input:

```json
{
  "path": ".env"
}
```

- Output shape:

```json
{
  "found": true,
  "path": ".env",
  "findings": [
    {
      "ruleId": "env/missing-required",
      "severity": "high",
      "message": "Required variable \"DATABASE_URL\" is missing from the env schema.",
      "location": { "file": ".env" }
    }
  ],
  "summary": {
    "critical": 0,
    "high": 1,
    "medium": 0,
    "low": 0,
    "info": 0
  },
  "worst": "high"
}
```

- What it checks:

  - missing required variables
  - missing typed variables
  - undeclared extra variables
  - mistyped values
  - duplicate keys
  - empty values
  - malformed lines

### `env_explains`

Explain which plugin/provider capabilities each environment variable unlocks.
The requirements catalog is derived from plugin `optionsSchema` metadata, not
hand-maintained.

- Input:

```json
{
  "path": ".env"
}
```

- Output shape:

```json
{
  "found": true,
  "path": ".env",
  "explain": {
    "variables": [
      {
        "varName": "DATABASE_URL",
        "plugins": [
          {
            "plugin": "database",
            "reason": "Database DSN",
            "present": false
          }
        ],
        "providers": [
          {
            "provider": "database",
            "reason": "Database DSN",
            "present": false
          }
        ]
      }
    ],
    "blockedCapabilities": [
      {
        "plugin": "database",
        "reason": "Database DSN",
        "provider": "database",
        "missingVars": ["DATABASE_URL"]
      }
    ]
  }
}
```

- Missing file behavior:

```json
{
  "found": false,
  "path": ".env",
  "explain": {
    "variables": [],
    "blockedCapabilities": []
  }
}
```

## Example invocations

```bash
mcp-vertex --plugins=env
```

```json
{"tool":"mcp-vertex_env_check","arguments":{"path":".env"}}
```

```json
{"tool":"mcp-vertex_env_explains","arguments":{"path":".env"}}
```

## Integrations

### `init`

When the resolved preset/plugin set includes `env`, the CLI `init` flow runs an
early env diagnostic before writing files. Any `high` or `critical` findings are
printed as a warning block so missing required variables surface during
bootstrap.

### `configuration_center`

The core `configuration_center` tool exposes a dedicated `section: "env"`
payload:

```json
{
  "section": "env",
  "env": {
    "pluginId": "env",
    "present": true,
    "missing": ["DATABASE_URL"],
    "findingsCount": 2,
    "sampleFindings": [
      {
        "ruleId": "env/missing-required",
        "severity": "high",
        "message": "Required variable \"DATABASE_URL\" is missing from the env schema."
      }
    ]
  }
}
```

Only presence and finding metadata are returned. Raw env values are never
included.

## Consent gate

None. The plugin is read-only: no writes, no network, no secret-value logging.

## Catalog

`env` is part of the `standard` preset.

## License

BSD-3-Clause © Cartago
