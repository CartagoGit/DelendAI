# Surface mode by client capabilities

Cuando no existe un override explícito, el servidor decide el surface mode a partir de las capabilities declaradas por el cliente durante initialize.

Reglas actuales:

- Si el cliente declara la extensión mcp-vertex/surface con toolsListChanged=true, el modo final es adaptive.
- Si el cliente no declara soporte para tools list-changed, el modo final es native.
- Si el cliente declara preferredMode=compact sin toolsListChanged, el modo final puede bajar a compact.

Overrides explícitos:

- CLI: --surface=native|adaptive|compact tiene precedencia máxima.
- Config: mcp-vertex.config.json.surfaceMode aplica cuando la CLI no fijó el modo.

La negociación no usa heurísticas por nombre de cliente. clientInfo solo se usa para logging y diagnóstico.