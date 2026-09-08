---
id: f00535
title: "Cutover del camino de lectura: readProposalIndex sirve desde SQLite con el JSON como respaldo, tras paridad total demostrada"
kind: feat
status: ready
type: proposal
track: architecture
date: 2026-09-08
---

# f00535 — Cutover del camino de lectura: readProposalIndex sirve desde SQLite con el JSON como respaldo, tras paridad total demostrada

## Goal

Invertir la direccion de la verdad para la LECTURA del indice de propuestas: servir desde la proyeccion SQLite cuando esta disponible y coincide, con el indice JSON como respaldo automatico, sin cambiar ninguna firma publica ni ningun camino de escritura.

## why

Este es el primer escalon ejecutable de q00022 S4, y ahora hay evidencia para darlo. La medicion de f00534 S3, repetida tras x00539, da paridad TOTAL sobre el repositorio real: 895 filas en SQL y 895 ids en .cache/delendai/proposals/index.json, cero solo-en-SQL, cero solo-en-JSON y cero divergencias de estado. Los 6 ficheros que no se proyectan son exactamente los README.md sin frontmatter del arbol, que no son propuestas. Antes de x00539 la cifra era 891 contra 894 con 3 divergencias, y antes de f00534 no habia base de datos en absoluto. El motivo de acotar el corte a la LECTURA del indice, y no a q00022 S4 entero, es que S4 tal como esta escrito reescribe de golpe todos los caminos de lectura y escritura, y ademas su lista de ficheros nombra proposal-store.ts, plan-store.ts y slice-store.ts, que no existen en el arbol; por eso lleva sin empezar desde que se redacto. Aqui hay un punto de estrangulamiento real y unico: readProposalIndex en plugins/proposals/src/lib/proposals/index-reader.ts, con 9 consumidores en el plugin. Cambiar esa funcion cambia el origen de datos de todo el camino de lectura del indice sin tocar una sola firma.

## non-goals

- No tocar ningun camino de escritura: el markdown sigue siendo la verdad y el JSON se sigue escribiendo igual.
- No borrar ni dejar de generar ningun INDEX.json: eso es r00049 y despues Phase D.
- No cambiar la firma de readProposalIndex ni la de ningun consumidor.

## Slices

- global_gate: type

### S1 — lector SQL con la misma forma que el lector JSON
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/proposals/index-reader-sql.ts`, `plugins/proposals/tests/src/lib/proposals/index-reader-sql.spec.ts`
- **Gate**: type
- acceptance:
  - "Una funcion pura devuelve el mismo IProposalIndexEntry[] que readProposalIndex, leyendo de la proyeccion SQL en modo readonly."
  - "Los campos que los 9 consumidores usan se cubren uno por uno; el test enumera cuales y falla si alguno queda sin mapear."
  - "Con la base ausente o ilegible devuelve null, no un array vacio: null significa 'no puedo servir', vacio significa 'no hay propuestas', y confundirlos es como se pierde el respaldo."

### S2 — readProposalIndex elige origen sin cambiar su firma, y el respaldo es automatico
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `plugins/proposals/src/lib/proposals/index-reader.ts`, `plugins/proposals/tests/src/lib/proposals/index-reader.spec.ts`
- **Gate**: type
- acceptance:
  - "readProposalIndex conserva su firma exacta; ningun consumidor cambia."
  - "Cuando la proyeccion SQL esta disponible sirve de ahi; cuando no, cae al JSON y lo registra UNA vez, no por llamada."
  - "Un interruptor de configuracion permite forzar cualquiera de los dos origenes, y por defecto el comportamiento es el de hoy hasta que S3 lo cambie: esta slice entrega el mecanismo, no el cambio de defecto."
  - "Un test verifica que con la base ausente el resultado es byte a byte el que da el camino JSON actual."

### S3 — activar SQL por defecto con verificacion de paridad en caliente
- **Status**: pending
- **DependsOn**: [S2]
- **Files**: `plugins/proposals/src/lib/proposals/index-source-policy.ts`, `plugins/proposals/tests/src/lib/proposals/index-source-policy.spec.ts`
- **Gate**: e2e
- acceptance:
  - "El origen por defecto pasa a SQL. La politica comprueba paridad antes de servir: si la proyeccion diverge del JSON, sirve JSON y reporta la divergencia en vez de servir datos discrepantes en silencio."
  - "La comprobacion no puede costar una reproyeccion en cada lectura: se apoya en el digest o en el sourceCommit ya almacenados, y el test mide que una lectura no dispara reconciliacion."
  - "Se registra en la propuesta la cifra de paridad medida el dia del cambio de defecto, no la de hoy."
  - "Existe la vuelta atras documentada en una sola linea de configuracion."

## acceptance

- Una funcion pura devuelve el mismo IProposalIndexEntry[] que readProposalIndex, leyendo de la proyeccion SQL en modo readonly.
- Los campos que los 9 consumidores usan se cubren uno por uno; el test enumera cuales y falla si alguno queda sin mapear.
- Con la base ausente o ilegible devuelve null, no un array vacio: null significa 'no puedo servir', vacio significa 'no hay propuestas', y confundirlos es como se pierde el respaldo.
- readProposalIndex conserva su firma exacta; ningun consumidor cambia.
- Cuando la proyeccion SQL esta disponible sirve de ahi; cuando no, cae al JSON y lo registra UNA vez, no por llamada.
- Un interruptor de configuracion permite forzar cualquiera de los dos origenes, y por defecto el comportamiento es el de hoy hasta que S3 lo cambie: esta slice entrega el mecanismo, no el cambio de defecto.
- Un test verifica que con la base ausente el resultado es byte a byte el que da el camino JSON actual.
- El origen por defecto pasa a SQL. La politica comprueba paridad antes de servir: si la proyeccion diverge del JSON, sirve JSON y reporta la divergencia en vez de servir datos discrepantes en silencio.
- La comprobacion no puede costar una reproyeccion en cada lectura: se apoya en el digest o en el sourceCommit ya almacenados, y el test mide que una lectura no dispara reconciliacion.
- Se registra en la propuesta la cifra de paridad medida el dia del cambio de defecto, no la de hoy.
- Existe la vuelta atras documentada en una sola linea de configuracion.
