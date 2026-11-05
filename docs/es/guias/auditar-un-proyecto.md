---
title: Auditar un proyecto
description: Pide al Lead una auditoría de solo lectura del proyecto y recibe una sola lista ordenada de lo más a lo menos urgente, para tomar lo que quieras
order: 210
---

# Auditar un proyecto

`/aether:audit` le pide al Lead que mire todo el proyecto y te entregue una sola lista de lo que está pendiente, ordenada de lo más a lo menos urgente, para que elijas. Solo lee: no cambia nada del proyecto y no arregla nada. El Lead corre un análisis automatizado, te hace una sola pregunta sobre qué temas cubrir, revisa cada tema con delegados de solo lectura, verifica lo que encontraron y entrega la lista de P0 a P3. This guide is also available in English: [Audit a project](../../guide/audit.md).

Escribe `/aether:audit` sin argumentos para que te pregunte, o nombra los temas y no hay pregunta, como en `/aether:audit docs bugs`. Agrega `--no-tests` para saltarte los tests del proyecto. Contesta en tu idioma: el Lead entrega en él.

## Qué audita

La auditoría cubre doce temas, del catálogo en `plugins/aether/skills/audit/topics.md`. Cada revisor empieza por los hotspots que encontró el análisis, porque los defectos se concentran donde los archivos cambian mucho y son grandes.

- Bugs: lógica que da un resultado erróneo, casos borde sin manejar, errores tragados en silencio, una promesa o un recurso nunca esperado o cerrado. Fuentes: la [Code Review Guide](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/code-review/commands/code-review.md) y la [guía de hotspots](https://docs.enterprise.codescene.io/versions/6.6.7/guides/technical/hotspots.html).
- Seguridad: entrada que llega sin revisar a una consulta, un shell, una ruta o HTML, autenticación o autorización que falta en un punto de entrada, secretos en el árbol o en el historial, valores inseguros por defecto, datos que se mandan o se registran y no deberían. Fuentes: [OWASP ASVS](https://asvs.owasp.org/) y la [OWASP Code Review Guide](https://owasp.org/www-project-code-review-guide/).
- Dependencias: vulnerabilidades conocidas que reportó el análisis y si el código vulnerable se alcanza, versiones sin fijar o un lockfile que falta, licencias que chocan con las del proyecto, workflows de CI con permisos amplios o acciones sin fijar. Fuente: los [checks de Scorecard](https://github.com/ossf/scorecard/blob/main/docs/checks.md).
- Tests: tests que fallan y por qué, rutas críticas sin test, tests que no afirman nada, tests que dependen del tiempo, del orden o de la red, un comando de tests que no corre todos los tests. Fuentes: [PIT](https://pitest.org/quickstart/basic_concepts/) y la [guía de tests inestables de Google](https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html).
- Fiabilidad: llamadas a un servicio o proceso externo sin tope de tiempo, sin límite de reintentos o sin manejo de su falla, lo que deja a medias una caída a mitad de camino, errores que no se registran en ningún lado, recursos que crecen sin cota. Fuente: el [checklist de lanzamiento de SRE](https://sre.google/sre-book/launch-checklist/).
- Rendimiento: trabajo repetido en un bucle, una consulta por elemento, un archivo o tabla entera leída para usar una parte, llamadas que bloquean en una ruta de petición. Fuente: [ISO 25010](https://www.iso.org/standard/78176.html).
- Accesibilidad: imágenes sin texto alternativo, controles sin etiqueta, color como única señal, trampas de teclado, contraste. Fuente: [ISO 25010](https://www.iso.org/standard/78176.html).
- Arquitectura y deuda: los hotspots con mala salud, módulos acoplados de modo que un cambio pide muchos archivos, código muerto, lógica duplicada en dos lugares que deben seguir en paso. Fuentes: la [guía de hotspots](https://docs.enterprise.codescene.io/versions/6.6.7/guides/technical/hotspots.html) y el [Technical Debt Quadrant](https://martinfowler.com/bliki/TechnicalDebtQuadrant.html).
- Documentación contra código: comandos, opciones, flags, rutas de archivos, ejemplos y versiones que el README y los docs dicen y el código ya no tiene o tiene distinto, pasos de instalación que fallarían, una feature prometida que no está. Fuentes: la [guía de testing de Write the Docs](https://www.writethedocs.org/guide/tools/testing/) y [Diátaxis](https://www.diataxis.fr/start-here/).
- Versiones y releases: la versión dicha en más de un lugar y no igual en todas, un changelog al que le falta el último release o sin fechas, tags que no coinciden con las versiones, un cambio que rompe en un minor o un patch. Fuentes: [SemVer](https://semver.org/) y [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
- Higiene del repositorio: ramas que el análisis lista como viejas y guardan trabajo que no está en la rama por defecto, pull requests e issues abiertos hace mucho que ya están hechos o ya no aplican, TODO y FIXME sin contexto, CI en rojo o apagado. Fuente: la [métrica de edad de issues](https://www.chaoss.community/kb/metric-issue-age/).
- Oportunidades: lo que el proyecto promete o lo que piden issues abiertos y nada implementa todavía, un cambio pequeño que quitaría una tarea manual repetida. Fuente: las [tareas sugeridas](https://jules.google/docs/suggested-tasks/).

Rendimiento y accesibilidad solo se proponen cuando el análisis muestra que aplican: rendimiento cuando el proyecto tiene un camino caliente, una meta de rendimiento o una queja medida, y accesibilidad cuando tiene una interfaz de usuario.

## Cómo corre

La auditoría corre en siete fases. El Lead hace él mismo las dos primeras y las tres últimas, y entrega el descubrimiento y la verificación a delegados, una llamada a `Agent` cada uno, lanzados en paralelo en segundo plano. La auditoría no necesita la herramienta Workflow: funciona igual en una sesión con ella o sin ella.

1. Análisis automatizado. El Lead corre `aether-audit analyze --out <archivo>` en la raíz del proyecto, con `--no-tests` cuando lo pediste, o con `--tests-command '<ese comando>'` cuando ningún manifiesto declara tests y el README nombra uno. El comando lee el comando de tests, el linter y la auditoría de dependencias que el proyecto declara, lee git para secretos, TODO y FIXME, ramas, hotspots y los issues y pull requests abiertos, y corre los tests del proyecto con un tope de tiempo. No instala nada y no arregla nada, y nunca imprime el valor de un secreto. Los archivos de trabajo van en un directorio hecho con `mktemp -d` fuera del proyecto.
2. Una sola pregunta de temas. Salvo que nombraste los temas, el Lead hace una sola pregunta, en un solo mensaje, y ahí se detiene: qué es el proyecto, los temas que propone con su razón cada uno, los que deja fuera con la suya, el estimado de auditorías anteriores o que aún no hay historial, y la invitación a confirmar, quitar o agregar. Con `/aether:audit docs bugs` no hay pregunta. Un nombre que no está en el catálogo se dice al empezar y se ignora; `--no-tests` no es un tema.
3. Descubrimiento. Un revisor por tema confirmado, cada uno un delegado de solo lectura con un alcance acotado: los hotspots y los datos del análisis que tocan su tema. Cada uno devuelve candidatos que puede señalar, con archivo y línea o con commit, y lo que no alcanzó a mirar.
4. Verificación. El Lead aplica la compuerta de entrada con `aether-audit candidates <archivo>`, y cada candidato aceptado va a un verificador en un contexto nuevo, que recibe la afirmación y la ubicación, no el razonamiento del revisor, y trata de refutarla. Un verificador puede tomar hasta cuatro afirmaciones de la misma zona. Solo reproduce en Claude, en un directorio hecho con `mktemp -d` fuera del proyecto; en otro harness no reproduce. Después `aether-audit verdicts <archivo> <archivo-de-veredictos>`. Un hallazgo cuya verificación falla de cualquier modo queda sin verificar, nunca verificado.
5. Limpieza. El Lead agrega a cada hallazgo una clave de causa y anota qué issue abierto lo cubre, y corre `aether-audit clean <archivo> --analysis <archivo> --topics <a,b,c>`, que junta los hallazgos de una causa, quita lo que cubre un issue abierto y marca cada uno como nuevo o como que sigue contra la auditoría anterior.
6. Triaje. El Lead escribe un juicio por hallazgo verificado, con gravedad y prioridad por separado, la razón en una frase, el tamaño grueso, si es regresión, el costo de esperar y cómo se haría, y corre `aether-audit triage <archivo> <archivo-de-juicios>`, que ordena cada banda y numera la lista.
7. Entrega. El Lead escribe lo que la entrega necesita (fecha, temas, temas dejados fuera con sus razones, duración, el costo de `aether-report --spend`, lo que espera tu sí, los supuestos, lo que cada revisor no miró, la línea RADAR), corre `aether-audit report --meta <archivo> --analysis <archivo> --triage <archivo> --lang <es|en> --save`, y te entrega su markdown tal cual, terminando con cuáles tomas.

En una sesión el Lead corre estos comandos él mismo; desde una shell fuera de una sesión el mismo bin es `node plugins/aether/bin/aether-audit`, corrido desde un clon de este repositorio.

## Qué no hace

La auditoría no cambia nada del proyecto: ni edita, ni commits, ni ramas, ni stash, ni worktrees propios, ni `git fetch` ni `git pull`. No arregla nada y no instala nada: ni `--fix`, ni `npm audit fix`, ni migraciones. No crea issues por su cuenta: solo después de que eliges puntos, un issue por punto elegido con `gh issue create`, y solo cuando el proyecto tiene un remoto de GitHub y `gh` responde; si no, te entrega los puntos elegidos como texto. Responde en tu idioma.

Corre los tests y las herramientas del propio proyecto, que es correr el código del proyecto, así que lee cada comando antes de correrlo. Un comando que despliega, migra, siembra datos, publica, corre de punta a punta contra un servicio en vivo o necesita credenciales no se corre: la revisión queda como no corrida, con el motivo, y el reporte lo dice. Cada corrida tiene un tope de tiempo, puedes saltarte los tests con `--no-tests`, y la comparación del estado del proyecto antes y después del análisis reporta lo que los comandos hayan cambiado. El valor de un secreto nunca se imprime, se cita ni se repite, en un mensaje, un archivo o un brief: solo su tipo, su archivo y su línea o su commit.

## Sin red, sin tests o sin GitHub

Cada revisión automatizada termina en uno de tres estados: resultado, no aplica con su porqué, o no se pudo con su porqué. Una revisión que no se pudo correr nunca cuenta como limpia. El reporte lo dice en su sección de no cubierto: qué revisiones se saltaron y por qué, qué temas quedaron fuera y por qué, qué no miró cada revisor y qué revisores se agotaron. Un proyecto sin tests, sin linter, sin manifiesto y sin remoto se audita igual: cada revisión dice no aplica, y la auditoría sigue con los temas que sí aplican.

Los revisores y verificadores no tienen `gh` ni red: lo que necesitan de GitHub está en su brief, y la comparación con los issues abiertos pasa en la limpieza, donde un `gh` que falta o falla deja la comparación sin hacer, con el motivo.

## Dónde se guarda el reporte

Fuera del proyecto, en el directorio de datos del plugin, bajo `<directorio de datos>/audits/<proyecto>/<fecha>`, con `report.json` y `report.md`. La fecha es el día en que corrió la auditoría; una segunda auditoría el mismo día toma el siguiente sufijo. Nada se escribe dentro del proyecto que auditaste.

La auditoría siguiente lee la guardada por sí misma: reusa la clave de causa cuando se topa con el mismo problema, marca cada hallazgo como nuevo o como que sigue, y lista los resueltos en su sección desde la última auditoría. Cuando no hay auditoría anterior, esa sección lo dice.

## Qué tomas

La lista va de P0 a P3, cada banda con sus puntos numerados desde arriba: P0 es roto ahora o haciendo daño ahora, P1 pronto, P2 trabajo que vale agendar, P3 cuando haya tiempo, y toda propuesta. Cada punto dice su tema y cómo se verificó, qué es y dónde, por qué ese nivel, su tamaño y cómo se haría. Los hallazgos sin verificar vienen después, sin nivel y sin número: son pistas, no van ordenados.

La entrega termina preguntando cuáles tomas, por ejemplo «1, 2 y 3». Busca cada número en el `report.json` guardado. Cada punto que elijas se vuelve un issue de GitHub solo en un proyecto con remoto de GitHub donde `gh` responde, con su afirmación, ubicaciones, evidencia, verificación, prioridad y porqué. Si no, recibes los puntos elegidos como texto, y construirlos es un pedido nuevo.

## Las rondas de prueba

La skill se probó en proyectos reales antes de documentarse, y se corrigió entre rondas: la evidencia está en `specs/026-project-audit/rounds/`, empezando por la [ronda 1](../../../specs/026-project-audit/rounds/round-1.md). Tres proyectos de pilas distintas: este repositorio en un clon quieto, un proyecto Python y un proyecto PHP sin remoto de GitHub. Cada uno tomó de 8 a 21 minutos y costó de US$ 7 a 21 a precio de lista; cada revisor y verificador corrió en Muse, así que nada se reprodujo y cada hallazgo listado está confirmado leyendo. Ningún valor de secreto se imprimió, ningún issue se creó y los proyectos quedaron idénticos. La ronda encontró nueve defectos de la skill, desde ubicaciones inventadas hasta verificadores con red, y cada uno se corrigió.
