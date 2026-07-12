---
title: Centro de configuración
description: Configura plugins de mcp-vertex y consulta la procedencia de sus artefactos de forma segura desde VS Code.
order: 2
navLabel: Configuración
---

# Centro de configuración

Ejecuta **MCP Vertex: Open Configuration Center** en VS Code. En ventanas con varias raíces, elige el proyecto. El editor muestra ajustes generales, plugins, proveedores, agentes, skills, prompts, recursos y conocimiento. Las insignias indican si el propietario está integrado, pertenece al proyecto o es externo.

## Edición segura del proyecto

El centro solo modifica `mcp-vertex.config.json`. El comando, argumentos y prefijo del servidor, junto con el tema y el idioma, siguen siendo preferencias de VS Code. El guardado usa el hash exacto del archivo, combina únicamente las rutas editadas, valida el documento completo y lo sustituye atómicamente. Conserva campos desconocidos y servidores externos desactivados. Si otro editor cambió el archivo, descarta/recarga y vuelve a aplicar el cambio.

Los valores que parecen secretos se ocultan y son de solo lectura. En MCP externos, `env` contiene nombres de variables, nunca valores. Reinicia el servidor MCP después de un guardado con cambios.

## Autores de plugins

Publica `optionsSchema` en el mismo `definePlugin(...)` que valida `ctx.options`; los campos y valores predeterminados aparecen automáticamente. Mantén `configExample.options` válido contra ese esquema. Un plugin declarado mediante `plugins.<id>.path` aparece como local del proyecto sin registro adicional. Los plugins de composición pueden adjuntar metadatos genéricos a sus hijos; `external-mcps` los usa para comando, versión, argumentos y nombres de entorno seguros.

Consulta la [guía completa del Centro de configuración](https://github.com/cartagogit/mcp-vertex/blob/main/docs/mcp-vertex/CONFIGURATION-CENTER.md).
