---
title: Centro configurazione
description: Configura i plugin mcp-vertex e verifica la provenienza degli artefatti da VS Code.
order: 2
navLabel: Configurazione
---

# Centro configurazione

Esegui **MCP Vertex: Open Configuration Center** in VS Code e scegli il progetto nelle finestre multi-root. Le sezioni mostrano impostazioni generali, plugin, provider, agenti, skill, prompt, risorse e conoscenza con proprietario e origine.

## Modifica sicura

Viene modificato solo `mcp-vertex.config.json`; comando del server, argomenti, prefisso, tema e lingua restano preferenze di VS Code. Il salvataggio controlla il digest, unisce solo i percorsi cambiati, valida l’intero documento e sostituisce il file atomicamente. Campi sconosciuti e server esterni disattivati vengono conservati. In caso di conflitto, ricarica e riapplica la modifica.

I segreti sono nascosti; `env` contiene solo nomi di variabili. Riavvia il server dopo le modifiche.

## Autori di plugin

Pubblica `optionsSchema` nello stesso `definePlugin(...)` che valida `ctx.options` e mantieni valido `configExample.options`. Plugin locali via `plugins.<id>.path` e figli MCP esterni appaiono automaticamente con schema e origine.
