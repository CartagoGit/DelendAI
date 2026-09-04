# Bootstrap surface

El bootstrap del surface no nativo queda reducido al conjunto mínimo que permite orientar, descubrir, activar y enrutar sin pagar el catálogo completo en el primer listTools.

Las herramientas bootstrap actuales son:

- overview
- tool_search
- plugin_activate
- plugin_deactivate
- status
- vertex

El resto del surface se expone según el modo resuelto para el cliente. En negociación automática, el servidor arranca en un bootstrap mínimo y decide el modo final tras el handshake MCP del cliente.

La medición local vive en tools/scripts/measure/bootstrap.script.ts. El script imprime bytes y una estimación grosera de tokens para native, adaptive y compact, y falla si adaptive supera 50 KB.