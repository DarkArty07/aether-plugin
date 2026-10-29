# Brief: auto-20261028-155518-67ab
**Resultado:** cumplida
Informe con capturas: https://claude.ai/artifact/1WXxhLetWczyu4w6vp45Ek

## Espera tu sí
- Borrar los repos del experimento `~/.cache/aether-exp-frontend` (588 MB) cuando termines de jugar · delete · ya están archivados sin `node_modules` en `.aether/experiments-2026-10-28-frontend.tar.gz` (152 MB), y el historial de cada build está en `research/2026-10-28-frontend/bundles/` · si dices que no: siguen ocupando disco y los snakes se pueden seguir jugando · se revierte: descomprimiendo el archivo y corriendo `npm ci` en cada repo · se ejecutará: `rm -rf ~/.cache/aether-exp-frontend`
- Subir la rama `exp/frontend-guided` a GitHub para que la investigación no dependa de esta máquina · push · la rama guarda el registro completo en `research/2026-10-28-frontend/` (informe, kit, resultados, historial de cada build); el repositorio es público, así que quedaría público (sin transcripciones: esas solo están en `.aether/`) · si dices que no: queda solo local, en git · se revierte: `git push origin --delete exp/frontend-guided` · se ejecutará: `git push origin exp/frontend-guided`

## Supuestos
- «Haiku solo» cuenta como Haiku aunque pidió por su cuenta una revisión a un ayudante en Sonnet (US$ 1.02 de sus 2.51) · lo hizo solo, sin que se lo pidiera · reversible: se repite prohibiendo subagentes
- El juez a ciegas (Opus nuevo por ronda, Chromium por software) sirve de nota principal y tu ojo de verdad final · el juez reprodujo el orden de octubre; pero no vio el negro de Sonnet solo · reversible
- El tope de US$ 50 cubre solo los swarms (US$ 36.96 registrados); las sesiones de diseño, las de Claude normal y el juez no entran · tu «cuenta abierta ilimitada para pruebas» · el total real está en Tiempo y costo
- Precios de lista de OpenRouter (endpoint de Anthropic), los de `aether-report` · reversible

## Criterios
- C1 Sonnet xhigh solo construye el snake: cumplido — US$ 4.34, 29 min, 13/13 y 25/25, juez 28.75; en tu GPU sale negro
- C2 Aether normal, Haiku primero, sin superdelegación: cumplido — 12/12 a la primera, US$ 15.95 con diseño, juez 26.0
- C3 Aether normal + skills de ECC y Ponytail: cumplido — 298 skills, ninguna invocada, juez 24.75
- C4 Aether guiado (ojos, recetas, chequeos): cumplido — juez 25.75; y además s5 (plan rico, 27.0), s6 (Haiku solo, 23.0) y s7 (plan rico con Sonnet, 27.0)
- C5 Calificación a ciegas con anclas y capturas para ti: cumplido — 30 calificaciones en 9 builds, capturas enviadas, los 9 servidos para jugar en http://localhost:8300/
- C6 Respuesta escrita con evidencia: cumplido — el informe y el issue #125
- C7 Solo modelos de Claude Code, sin superdelegación ni Fable: cumplido — `superdelegation=false` por sesión en todas

## RADAR
- Rápido: 6.4 h de 8, de ellas 72 min con la sesión congelada por el freno de cuota (#124). Swarms: s2 22 min, s3 26, s4 28 (4 lanzamientos por #123), s5 60, s7 45. Subidas: s5 1 (task-9, Haiku high → xhigh); s7 task-12 subió a Sonnet xhigh y escaló a Opus, y el Lead la adoptó a mano por una contradicción del plan.
- Autónomo: no te pregunté nada; volviste tú y conversamos. El freno congeló la sesión hasta que pulsaste Esc.
- Delegación: 0 llamadas a otros harness (sin superdelegación). 1 tarea delegada en Haiku high (leer las 298 skills), aprobada.
- Asequible: US$ 71.43 en las sesiones del experimento (US$ 64.56) y el juez (US$ 6.87). Programar costó US$ 0.20 a 1.48 en Haiku y US$ 5.55 en Sonnet; lo caro es Opus (revisión final y Examiner).
- Robusto: los 7 builds de este experimento pasan 13/13 en el navegador y 25/25 en el examen oculto (los de octubre: Aether 12/13 y 25/25, normal 13/13 y 24/25). Revisiones finales: s5 4 importantes (3 arreglados, 1 resuelto en su efecto), s7 2 importantes arreglados. Judge: diseño normal revise → approve; diseño rico revise → approve.

## Hice
- Registro completo de la investigación en `research/2026-10-28-frontend/` de la rama `exp/frontend-guided` (README en inglés con todo el detalle, kit para repetirla, resultados, diseños, capturas, historial git de cada build). Transcripciones de todas las sesiones en `.aether/experiments-2026-10-28-transcripts.tar.gz` (366 MB; Claude Code las borra a los 30 días).
- Rama `exp/frontend-guided` (dab9962, 5a6b834): Haiku precarga la skill `threejs-game` y mira sus capturas; supervisor y revisor final miran el juego. Rama `exp/frontend-skills` (01647c5): la herramienta Skill para los agentes del swarm. Locales, sin merge ni push.
- Nueve builds en `~/.cache/aether-exp-frontend/`, con el banco de octubre, el juez a ciegas (`harness/judge.mjs`) y el servidor para jugarlos (`harness/play-all.mjs`).
- Issues: #122 (revisión final tras relanzar), #123 (ops en Haiku con -1), #124 (el freno congela la sesión), #125 (dirección de arte antes del plan).
- Informe: https://claude.ai/artifact/1WXxhLetWczyu4w6vp45Ek

## Decidí
- D1 el banco de octubre (spec, examen oculto, 13 chequeos, rúbrica de 40), para comparar también con octubre.
- D6 un solo diseño para s2, s3 y s4, así solo cambian las skills o la guía.
- D7 descarté mi «Lantern Night»: s4 usa el tema del plan para no cambiar dos cosas a la vez.
- D13 una quinta corrida con plan rico, porque sin ella «qué condiciones» era solo hipótesis.
- D14 dos más (Haiku solo, plan rico con Sonnet) para el punto de partida y para aislar al modelo que programa.

## Descubrí
- Con el mismo plan rico, Haiku = Sonnet: 27 y 27, con la misma nota en cada criterio, y tú no ves diferencia. Programar: US$ 1.48 contra 5.55.
- Lo único que subió la nota fue la dirección de arte con números, antes del Writer. Ni las skills, ni los ojos, ni el modelo que programa la movieron.
- Las skills instaladas no llegan: los agentes ven solo nombres. Ninguna de las 298 trata de juegos o three.js; la de dirección de arte hay que escribirla (tu hipótesis, #125).
- El juez y los ojos miran sin GPU: Sonnet solo sacó la nota más alta y en tu equipo sale negro.
- El costo honesto de llegar al plan rico desde cero es US$ 31-40: mi dirección de arte se escribió viendo seis builds y las críticas del juez.
- El freno de cuota congela la sesión (#124); el fallo #122 abarató la revisión de s4 y s7.

## Qué no verifiqué
- Que una sesión limpia, con una skill de dirección de arte, llegue a 27 sin lo que yo había visto.
- La causa del negro de Sonnet solo en tu GPU: falta la consola.
- El «input lag» del build con skills.
- Repeticiones por brazo: una corrida cada uno, y el juez varía ±1-2.
- Una revisión final en Sonnet en vez de Opus.

## No terminé
- Nada del intento. Las pruebas de arriba son la siguiente fase.

## Propuestas
- Escribir la skill de dirección de arte para trabajo visual y probarla limpia: el Writer la precarga, plan desde el spec solo, Haiku con ojos (~US$ 20-25, ~2 h).
- Arreglar #124 (dos líneas en `hooks/register.js`), #122 y #123.
- No correr el Examiner cuando el examen ya existe; medir la revisión final en Sonnet.
- Que los ojos miren también en una GPU real.

## Tiempo y costo
- Trabajó solo 6.4 h de 8 h, y te consultó 0 veces.
- US$ 36.96 de US$ 50. La cifra cubre el swarm, las lanes y los asientos externos; no cubre los turnos del Lead, ni los de los asientos nativos, ni los de las tareas delegadas. Fuera de ella: las sesiones de diseño, las de Claude normal y el juez, US$ 34.47; el experimento entero, US$ 71.43.
- Sesión 4b87a2cf-f4b9-40b3-aa12-ba16e200e938: US$ 30.31 a precio de lista (Lead US$ 30.16, agentes US$ 0.15). El total incluye las llamadas a otros harness (0 llamadas, US$ 0) y no es la cifra del tope.
