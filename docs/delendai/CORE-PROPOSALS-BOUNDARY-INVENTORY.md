# Core -> proposals boundary inventory

Inventario ejecutable de acoplamientos presentes hoy en packages/core/src.
Si el script detecta una linea candidata nueva sin regla en esta tabla, falla.

## Summary

- Findings: 121
- Unclassified candidates: 0
- Missing expected findings: 0
- Resolved by slices: 13
- Regressions (resolved rule still present): 0
- import: 1
- path: 7
- plugin-name: 12
- type: 67
- message: 26
- index-access: 8

## Findings

| File | Symbol or literal | Category | Proposed destination | Occurrences | Notes |
| --- | --- | --- | --- | ---: | --- |
| packages/core/src/lib/adopt/adopt-project-write-estimate.ts | `proposals` plugin | plugin-name | adapter | 1 | La ayuda bootstrap del store sigue nombrando el plugin concreto. |
| packages/core/src/lib/adopt/adopt-project-write-estimate.ts | Bootstrapped proposals store files | message | adapter | 1 | El resumen de escritura expone el store de proposals como artefacto del core. |
| packages/core/src/lib/adopt/adopt-project-write-estimate.ts | create_proposal | message | adapter | 1 | La ayuda del store remite a una tool de proposals concreta. |
| packages/core/src/lib/adopt/adopt-project-write-estimate.ts | docsDir/proposals/.gitkeep | path | adapter | 1 | El layout concreto del store de proposals se materializa en el core. |
| packages/core/src/lib/adopt/adopt-project-write-estimate.ts | docsDir/proposals/README.md | path | adapter | 1 | El README del store sigue generado por una ruta hardcodeada de proposals. |
| packages/core/src/lib/adopt/adopt-project-write-estimate.ts | proposals store managed by the delendai | message | adapter | 1 | El estimador de escritura documenta el store de proposals como estructura propia. |
| packages/core/src/lib/adopt/adopt-project-write-estimate.ts | sync_proposals inventory message | message | adapter | 1 | La ayuda del store referencia el regenerado del indice del plugin. |
| packages/core/src/lib/adopt/adoption-assessment.service.ts | Estimated adopt_project write surface ... proposals store | message | adapter | 1 | La evaluacion de adopcion sigue contabilizando proposals store como responsabilidad del core. |
| packages/core/src/lib/adopt/adoption-stages.constant.ts | pluginIds: proposals, agent-orchestrator | plugin-name | composition | 1 | La etapa agents del flujo de adopcion activa el plugin proposals por composicion declarativa. |
| packages/core/src/lib/adopt/adoption-stages.constant.ts | title: proposals+agents | message | composition | 1 | La etapa agents del flujo de adopcion enumera el workflow de proposals en su titulo visible. |
| packages/core/src/lib/agents/derive-agent-sessions.service.ts | const exact = proposals.find | index-access | adapter | 1 | La resolucion de taskId consulta directamente el arreglo de proposals. |
| packages/core/src/lib/agents/derive-agent-sessions.service.ts | input.proposals | index-access | adapter | 1 | La derivacion transforma el inventario de proposals para construir sesiones. |
| packages/core/src/lib/agents/derive-agent-sessions.service.ts | proposals: readonly IAgentSessionProposalSummary[] | type | adapter | 1 | El servicio de sesiones recibe la lista de proposals como parametro tipado. |
| packages/core/src/lib/agents/derive-agent-sessions.service.ts | return proposals.filter taskId prefix | index-access | adapter | 1 | El fallback de resolucion filtra y ordena sobre la lista de proposals. |
| packages/core/src/lib/bootstrap/body-content/prompt-bodies.ts | The proposals plugin is loaded | message | composition | 1 | El cuerpo del prompt cambia comportamiento segun proposals cargado. |
| packages/core/src/lib/bootstrap/build-blueprint.ts | plugins.includes('proposals') | plugin-name | composition | 1 | La composicion del blueprint activa subagentes segun el plugin proposals. |
| packages/core/src/lib/bootstrap/derive-config.ts | proposal workflow (proposals + coordination) | message | composition | 1 | La racionalidad del preset swarm sigue describiendo proposals por nombre. |
| packages/core/src/lib/bootstrap/pattern-catalog.ts | coordinate parallel work with the proposals plugin | message | composition | 1 | La descripcion del patron sigue anclada al plugin proposals. |
| packages/core/src/lib/bootstrap/pattern-catalog.ts | recommendedPlugins ['proposals', 'rules'] | plugin-name | composition | 2 | El catalogo de patrones sigue recomendando proposals desde el core. |
| packages/core/src/lib/bootstrap/prompt-artifact-rules.ts | plugins.includes('proposals') prompt rule | plugin-name | composition | 1 | La inclusion de artefactos de prompt depende del nombre del plugin. |
| packages/core/src/lib/catalog/agent-discovery-catalog.ts | ): IProposalSummary => ({ | type | contract | 1 | La salida del clonador sigue fijada al DTO de proposal. |
| packages/core/src/lib/catalog/agent-discovery-catalog.ts | ACTIONABLE_PROPOSAL_STATUSES | type | contract | 1 | La politica de accionabilidad del workflow entra en el catalogo desde core. |
| packages/core/src/lib/catalog/agent-discovery-catalog.ts | ACTIONABLE_PROPOSAL_STATUSES.includes | type | contract | 1 | La logica de visibilidad sigue dependiendo de actionable proposals. |
| packages/core/src/lib/catalog/agent-discovery-catalog.ts | const proposals = visibleProposals.map | type | contract | 1 | La materializacion del snapshot sigue nombrando proposals como entidad primaria del catalogo. |
| packages/core/src/lib/catalog/agent-discovery-catalog.ts | counts.proposals | type | intentional-compat | 1 | El conteo publico mantiene la clave proposals por compatibilidad. |
| packages/core/src/lib/catalog/agent-discovery-catalog.ts | IProposalSummary import | type | contract | 1 | El constructor del catalogo recibe el resumen concreto de proposals. |
| packages/core/src/lib/catalog/agent-discovery-catalog.ts | PROPOSAL_STATUS_VALUES | type | contract | 1 | El catalogo importa la lista nominal de estados de proposals. |
| packages/core/src/lib/catalog/agent-discovery-catalog.ts | PROPOSAL_STATUS_VALUES.map | type | contract | 1 | El recuento de estados itera sobre la constante nominal de proposals. |
| packages/core/src/lib/catalog/agent-discovery-catalog.ts | proposal: IProposalSummary | type | contract | 1 | La clonacion del catalogo recibe el tipo nominal IProposalSummary. |
| packages/core/src/lib/catalog/agent-discovery-catalog.ts | proposals result | type | intentional-compat | 1 | La propiedad proposals del snapshot se mantiene por compatibilidad del catalogo. |
| packages/core/src/lib/catalog/agent-discovery-catalog.ts | proposalStatusCounts | type | contract | 1 | Los contadores siguen codificados como proposalStatusCounts. |
| packages/core/src/lib/catalog/agent-discovery-catalog.ts | proposalStatusCounts result | type | contract | 1 | El snapshot devuelve proposalStatusCounts como parte del contrato publico. |
| packages/core/src/lib/catalog/agent-discovery-catalog.ts | proposalStatusCounts[proposal.status] | type | contract | 1 | El agregado de estados usa proposalStatusCounts con el vocabulario del plugin. |
| packages/core/src/lib/catalog/agent-discovery-catalog.ts | Record<typeof PROPOSAL_STATUS_VALUES> | type | contract | 1 | La forma del contador sigue tipada con PROPOSAL_STATUS_VALUES. |
| packages/core/src/lib/catalog/agent-discovery-catalog.ts | sources.proposals() | type | contract | 1 | La fuente del catalogo sigue nombrando proposals como entidad primaria. |
| packages/core/src/lib/catalog/agent-discovery-catalog.ts | visibleProposals | type | contract | 1 | El filtro de visibilidad sigue especializado en proposals. |
| packages/core/src/lib/catalog/agent-discovery-types.ts | ACTIONABLE_PROPOSAL_STATUSES | type | contract | 1 | La accionabilidad del workflow esta fijada en el core con nombre proposals. |
| packages/core/src/lib/catalog/agent-discovery-types.ts | CatalogSection.proposals | plugin-name | intentional-compat | 1 | La API publica de descubrimiento ya expone proposals como seccion compatible. |
| packages/core/src/lib/catalog/agent-discovery-types.ts | counts.proposals | type | intentional-compat | 1 | El recuento publico conserva la clave proposals por compatibilidad. |
| packages/core/src/lib/catalog/agent-discovery-types.ts | IProposalSummary | type | contract | 1 | El DTO visible desde core aun esta modelado como proposal concreta. |
| packages/core/src/lib/catalog/agent-discovery-types.ts | PROPOSAL_STATUS_VALUES | type | contract | 1 | Los estados se publican desde core como constante del dominio proposals. |
| packages/core/src/lib/catalog/agent-discovery-types.ts | proposals: IProposalSummary[] | type | contract | 1 | El catalogo publica la lista como proposals en vez de workflow summaries. |
| packages/core/src/lib/catalog/agent-discovery-types.ts | proposals(): IProposalSummary[] | type | contract | 1 | La fuente inyectable del catalogo conoce el nombre del dominio. |
| packages/core/src/lib/catalog/agent-discovery-types.ts | ProposalStatus | type | contract | 1 | El resumen publico del workflow fija el vocabulario de estados de proposals. |
| packages/core/src/lib/catalog/agent-discovery-types.ts | proposalStatusCounts | type | contract | 1 | El snapshot compacto expone contadores del workflow con nombre de proposals. |
| packages/core/src/lib/catalog/agent-discovery-types.ts | readonly status: ProposalStatus | type | contract | 1 | El DTO del workflow sigue exponiendo ProposalStatus en el core. |
| packages/core/src/lib/cli/assemble-core-tools.ts | bootstraps the proposals | message | adapter | 1 | La ayuda de adopt_project describe todavia el bootstrap de proposals desde el core. |
| packages/core/src/lib/cli/assemble-core-tools.ts | proposals: () => proposalSummaries | type | composition | 1 | La fuente del catalogo sigue cableada con el nombre proposals. |
| packages/core/src/lib/cli/assemble-core-tools.ts | proposalSummaries | type | composition | 1 | La composicion del catalogo inyecta proposalSummaries de forma nominal. |
| packages/core/src/lib/cli/assemble-core-tools.ts | TSkillsPhase['proposalSummaries'] | type | composition | 1 | La fase de ensamblado superior todavia transporta proposalSummaries. |
| packages/core/src/lib/cli/assemble-skills.ts | config + agents + proposals store | message | adapter | 2 | El mensaje de adopcion expone el bootstrap del store como detalle del core. |
| packages/core/src/lib/cli/assemble-skills.ts | do not hand-create proposals | message | composition | 1 | El mensaje de mismatch sigue mencionando el layout de proposals desde el core. |
| packages/core/src/lib/cli/assemble-skills.ts | proposalSummaries assignment | type | intentional-compat | 1 | La lectura de proposalSummaries queda en el borde del ensamblado para conservar la API publica. |
| packages/core/src/lib/cli/assemble-skills.ts | proposalSummaries compat via workflow state | type | intentional-compat | 1 | El resultado del ensamblado conserva proposalSummaries como compatibilidad de borde hacia la API publica. |
| packages/core/src/lib/cli/assemble-skills.ts | proposalSummaries value | type | composition | 1 | La composicion sigue propagando proposalSummaries a la capa superior. |
| packages/core/src/lib/cli/assemble.ts | proposalSummaries into CLI assembly | type | composition | 2 | El ensamblado CLI sigue transportando proposalSummaries como parte del estado. |
| packages/core/src/lib/cli/read-proposals-index.ts | Array.isArray(parsed.proposals) | index-access | adapter | 1 | La validacion estructural sigue mirando directamente la clave proposals. |
| packages/core/src/lib/cli/read-proposals-index.ts | IProposalIndexFile | type | adapter | 1 | El contenedor del indice sigue definido en el core. |
| packages/core/src/lib/cli/read-proposals-index.ts | IProposalIndexFileEntry | type | adapter | 1 | El schema concreto del indice pertenece al adaptador de proposals. |
| packages/core/src/lib/cli/read-proposals-index.ts | IProposalIndexFileEntry => typeof entry.id | type | adapter | 1 | El predicado de tipo sigue anclado al entry del indice de proposals. |
| packages/core/src/lib/cli/read-proposals-index.ts | IProposalSummary import | type | contract | 1 | La forma publica del resumen de workflow aun esta nombrada como proposal. |
| packages/core/src/lib/cli/read-proposals-index.ts | IProposalSummary['status'] | type | contract | 1 | La salida del normalizador sigue expresada con el tipo nominal de proposal. |
| packages/core/src/lib/cli/read-proposals-index.ts | JSON.parse(raw) as IProposalIndexFile | type | adapter | 1 | La deserializacion del indice concreto sigue ocurriendo en el core. |
| packages/core/src/lib/cli/read-proposals-index.ts | normalizeProposalStatus | type | adapter | 1 | La normalizacion del estado del workflow debe venir del adaptador. |
| packages/core/src/lib/cli/read-proposals-index.ts | parsed: IProposalIndexFile | type | adapter | 1 | El core sigue tipando internamente el payload del indice del plugin. |
| packages/core/src/lib/cli/read-proposals-index.ts | parsed.proposals | index-access | adapter | 1 | La lectura del array de proposals sigue acoplada a la forma interna del indice. |
| packages/core/src/lib/cli/read-proposals-index.ts | Promise<IProposalSummary[]> | type | contract | 1 | La firma del lector devuelve todavia el DTO nominal de proposals. |
| packages/core/src/lib/cli/read-proposals-index.ts | proposalKindFromId | type | adapter | 1 | La semantica de ids de proposals no deberia residir en el core. |
| packages/core/src/lib/cli/read-proposals-index.ts | proposals[] | index-access | adapter | 1 | El payload cacheado del plugin sigue interpretado directamente por el core. |
| packages/core/src/lib/cli/read-proposals-index.ts | proposals/index.json | index-access | adapter | 1 | La ruta del indice cacheado es propia del plugin. |
| packages/core/src/lib/cli/read-proposals-index.ts | readProposalsIndex exported | index-access | adapter | 1 | El adaptador del indice sigue residiendo fisicamente dentro del core. |
| packages/core/src/lib/cli/read-proposals-index.ts | Required<Pick<IProposalIndexFileEntry, 'id'>> | type | adapter | 1 | El narrowing del payload sigue nombrando el schema concreto del plugin. |
| packages/core/src/lib/cli/workflow-contribution-assembly.ts | IProposalSummary cast | type | intentional-compat | 1 | La proyeccion estructural usa el tipo del catalogo solo para validar la forma. |
| packages/core/src/lib/cli/workflow-contribution-assembly.ts | IProposalSummary import | import | intentional-compat | 1 | El ensamblador conserva el tipo del catalogo como compatibilidad del estado ensamblado. |
| packages/core/src/lib/cli/workflow-contribution-assembly.ts | IProposalSummary[] return | type | intentional-compat | 1 | La firma de extraccion devuelve summaries del catalogo por compatibilidad. |
| packages/core/src/lib/cli/workflow-contribution-assembly.ts | isProposalSummary guard | type | intentional-compat | 1 | El guard de compatibilidad filtra summaries por la forma del catalogo. |
| packages/core/src/lib/cli/workflow-contribution-assembly.ts | proposalSummaries array check | type | intentional-compat | 1 | La validacion del carrier conserva el campo de compatibilidad. |
| packages/core/src/lib/cli/workflow-contribution-assembly.ts | proposalSummaries carrier field | type | intentional-compat | 1 | El carrier agnostico mantiene un campo de compatibilidad para los summaries del catalogo. |
| packages/core/src/lib/cli/workflow-contribution-assembly.ts | proposalSummaries empty fallback | type | intentional-compat | 2 | El fallback sin proveedores devuelve summaries vacios por compatibilidad. |
| packages/core/src/lib/cli/workflow-contribution-assembly.ts | proposalSummaries freeze | type | intentional-compat | 1 | El filtrado de summaries usa el guard de compatibilidad. |
| packages/core/src/lib/cli/workflow-contribution-assembly.ts | proposalSummaries freeze result | type | intentional-compat | 1 | La materializacion del estado conserva el campo de compatibilidad. |
| packages/core/src/lib/cli/workflow-contribution-assembly.ts | proposalSummaries optional carrier field | type | intentional-compat | 1 | El carrier agnostico conserva el campo opcional por compatibilidad. |
| packages/core/src/lib/cli/workflow-contribution-assembly.ts | proposalSummaries returned field | type | intentional-compat | 1 | El estado ensamblado devuelve proposalSummaries por compatibilidad con la API publica. |
| packages/core/src/lib/contracts/constants/token-budgets.constant.ts | fixturePluginIds: ['proposals', 'memory'] | plugin-name | intentional-compat | 1 | Los fixtures de presupuesto siguen nombrando proposals como plugin representativo. |
| packages/core/src/lib/contracts/file-conventions.contract.ts | folderRule('proposal', 'proposals') | path | contract | 1 | La convencion de ficheros publica el plural proposals como layout nominal. |
| packages/core/src/lib/contracts/interfaces/agent-session.interface.ts | proposals: readonly IAgentSessionProposalSummary[] | type | contract | 1 | La derivacion de sesiones de agentes consume resumenes de proposals como entrada contractual. |
| packages/core/src/lib/contracts/release/index.ts | release metadata proposals must be non-empty strings | message | adapter | 1 | La validacion de metadata de release nombra el dominio proposals en su mensaje de error. |
| packages/core/src/lib/knowledge/host-onboarding.knowledge.ts | docs/delendai/proposals/ | path | adapter | 1 | La knowledge base de onboarding sigue senalando la ruta concreta del store proposals. |
| packages/core/src/lib/plugins/diagnose-workspace-layout.ts | proposals layout resolve under docsDir | message | composition | 1 | El diagnostico del workspace sigue asumiendo el layout proposals desde el core. |
| packages/core/src/lib/plugins/plugin-defaults.ts | docs/delendai/proposals/done/audits | path | adapter | 1 | La ruta por defecto de auditorias sigue anclada al arbol proposals. |
| packages/core/src/lib/plugins/plugin-defaults.ts | docs/proposals/retired/issues | path | adapter | 1 | Los defaults de issues apuntan a un layout proposals concreto. |
| packages/core/src/lib/plugins/plugin-defaults.ts | pluginDefaults.proposals | plugin-name | composition | 1 | Los defaults de plugins reservan un bloque nominal para proposals. |
| packages/core/src/lib/plugins/preset-catalog.ts | { plugin: proposals } | plugin-name | composition | 2 | El catalogo de presets describe proposals como plugin concreto de composicion. |
| packages/core/src/lib/plugins/preset-derived.ts | preset includes proposals | plugin-name | composition | 1 | El preset derivado materializa proposals en la composicion por defecto. |
| packages/core/src/lib/prompts/agent-bootstrap.prompt.ts | Actionable proposals | message | intentional-compat | 1 | El resumen textual del prompt sigue nombrando actionable proposals. |
| packages/core/src/lib/prompts/agent-bootstrap.prompt.ts | actionable proposals available right now | message | intentional-compat | 1 | La instruccion bootstrap publica proposals como unidad accionable. |
| packages/core/src/lib/prompts/agent-bootstrap.prompt.ts | catalog.proposals | type | intentional-compat | 1 | El prompt bootstrap sigue interpolando la lista nominal de proposals. |
| packages/core/src/lib/prompts/agent-bootstrap.prompt.ts | catalog.proposals.length | type | intentional-compat | 1 | La renderizacion del prompt sigue inspeccionando catalog.proposals. |
| packages/core/src/lib/prompts/agent-bootstrap.prompt.ts | tools/skills/proposals | message | intentional-compat | 1 | El prompt bootstrap menciona proposals como categoria publica visible al host. |
| packages/core/src/lib/resources/agent-catalog-resource.ts | actionable proposals resource | message | intentional-compat | 1 | El recurso de catalogo documenta proposals en su resumen publico. |
| packages/core/src/lib/scaffold/scaffold-host.ts | claim files when proposals plugin loads | message | composition | 3 | Las instrucciones scaffoldeadas siguen condicionando escritura al plugin proposals. |
| packages/core/src/lib/scaffold/scaffold-host.ts | multi-agent proposal workflow | message | intentional-compat | 3 | Las instrucciones publicadas siguen describiendo proposals como workflow estable visible al host. |
| packages/core/src/lib/setup/setup-steps.ts | delendai --plugins=proposals,issues | plugin-name | adapter | 1 | El comando sugerido fija el nombre del plugin proposals en el core. |
| packages/core/src/lib/setup/setup-steps.ts | issues hard-depends on proposals | message | adapter | 1 | La dependencia con issues sigue expresada en el texto de setup del core. |
| packages/core/src/lib/setup/setup-steps.ts | Load the host with proposals + issues | message | adapter | 1 | El checklist de setup sigue describiendo la pareja proposals + issues desde el core. |
| packages/core/src/lib/tools/agent-catalog-tool.ts | actionable proposals snapshot | message | intentional-compat | 1 | La ayuda larga mantiene proposals como termino contractual del catalogo. |
| packages/core/src/lib/tools/agent-catalog-tool.ts | actionable proposals summary | message | intentional-compat | 1 | La descripcion publica menciona proposals como parte del contrato visible. |
| packages/core/src/lib/tools/agent-catalog-tool.ts | IProposalSummary | type | contract | 2 | La tool de catalogo sigue filtrando el dominio proposals de forma nominal. |
| packages/core/src/lib/tools/agent-catalog-tool.ts | matchesProposal | type | contract | 1 | La busqueda compacta sigue modelando proposals como tipo nominal. |
| packages/core/src/lib/tools/agent-catalog-tool.ts | proposalCount snapshot field | type | intentional-compat | 1 | El snapshot conserva la propiedad proposalCount para que la UI del catalogo siga mostrando el conteo de proposals. |
| packages/core/src/lib/tools/agent-catalog-tool.ts | proposalCount UI label | message | intentional-compat | 1 | La salida legible al agente sigue exponiendo proposals como termino del contrato visible del catalogo. |
| packages/core/src/lib/tools/agent-catalog-tool.ts | section === 'proposals' projection | type | intentional-compat | 1 | La proyeccion por seccion del catalogo conserva proposals como clave publica de compatibilidad. |
| packages/core/src/lib/tools/agent-catalog-tool.ts | sectionEnum.proposals | plugin-name | intentional-compat | 1 | La seccion publica proposals se mantiene por compatibilidad del catalogo. |
| packages/core/src/lib/tools/agent-catalog-tool.ts | snapshot.proposals filter | type | intentional-compat | 1 | La consulta filtrada conserva proposals como clave publica. |
| packages/core/src/lib/tools/agent-catalog-tool.ts | snapshot.proposals.length | type | intentional-compat | 1 | El contador de coincidencias sigue calculando sobre snapshot.proposals. |
| packages/core/src/lib/tools/overview-tool.ts | tools grouped by plugin proposals | message | intentional-compat | 1 | La documentacion del overview conserva proposals como ejemplo contractual visible. |
| packages/core/src/public/index.ts | ../lib/proposals/validate-evidence.schema | path | contract | 1 | El barrel publico reexporta un schema desde un subpath proposals interno del core. |
| packages/core/src/public/index.ts | ACTIONABLE_PROPOSAL_STATUSES | type | contract | 1 | El barrel publico reexporta el vocabulario del workflow con nombre proposals. |
| packages/core/src/public/index.ts | IProposalSummary | type | contract | 1 | Los consumidores externos siguen importando el DTO nominal de proposals desde core/public. |
| packages/core/src/public/index.ts | PROPOSAL_STATUS_VALUES | type | contract | 1 | La lista publica de estados usa nomenclatura proposals. |
| packages/core/src/public/index.ts | ProposalStatus | type | contract | 1 | El estado del workflow se exporta con nombre proposals desde el barrel estable. |

## Resolved findings

Acoplamientos eliminados de packages/core/src por una slice de la propuesta.

| File | Symbol or literal | Category | Resolved by |
| --- | --- | --- | --- |
| packages/core/src/lib/adopt/adopt-project.tool.ts | buildProposalsStoreFiles | import | S2 |
| packages/core/src/lib/adopt/adopt-project.tool.ts | config.plugins.proposals | plugin-name | S2 |
| packages/core/src/lib/adopt/adopt-project.tool.ts | proposals + issues plugins | message | S2 |
| packages/core/src/lib/adopt/adopt-project.tool.ts | sync_proposals | message | S2 |
| packages/core/src/lib/adopt/adopt-project.tool.ts | bootstrap the proposals store | message | S2 |
| packages/core/src/lib/adopt/adopt-project.tool.ts | proposals-store bootstrap | message | S2 |
| packages/core/src/lib/cli/assemble-skills.ts | readProposalsIndex | import | S4 |
| packages/core/src/lib/cli/assemble-skills.ts | proposalSummaries type | type | S4 |
| packages/core/src/lib/cli/assemble-skills.ts | readProposalsIndex() | index-access | S4 |
| packages/core/src/lib/cli/assemble-skills.ts | isLoaded proposals | plugin-name | S4 |
| packages/core/src/lib/cli/assemble-skills.ts | proposals_auto_work | message | S4 |
| packages/core/src/lib/plugins/plugin-defaults.ts | docs/handoffs | path | S2 |
| packages/core/src/lib/api/stable-facade.ts | plugin: 'proposals' | plugin-name | S3 |
