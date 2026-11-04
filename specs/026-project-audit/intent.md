# Tarjeta de intención: `/aether:audit`, una auditoría del proyecto que entrega una lista ordenada por urgencia

- **Dueño:** Christopher
- **Fecha:** 2026-11-04
- **Confirmada por el dueño** con «me agrada», «me parece bien» (al prototipo), «analisis automatizado sera» y el permiso de trabajar solo: «Necesito que trabajes autónomamente haciendo esto […] Y adelante. Procede.» (sesión 8a006dd2).

## 1. Las palabras del dueño

1. «quiero crear una nueva skill para aether agents. Una skill que si la ejecuto el lead haga una auditoria del proyecto. Lo que busco es que ejecutando la skill el lead me de un resultadoc on hallgasofgs. Funcionalidades que podriamos implementar, fixes que se necesitan ya, bugs que podrian aparecer, arreglos que se neciesten hacer y no se han hecho, verifiacion de documentacion y coherencia.»
2. «es una skill que ejecute autonamemtne un workflow para que me diga "Hay esto pendiente en orden de de mas urgente a menos urgente."»
3. «que automáticamente me lo diga todo y yo decida cuáles son lo que quiero tomar de esa auditoría.»
4. «la quiero como skill del plugin es decir como la que creemos con either onboard»
5. «Te estas basando mucho a lo queyo pedi, pero en este caso quiero que tu enroiquezcas mas la skill. Solo 4 agentes? y solo 4 temas? yo propuse 4 pero yo queiro que te bases en las mejores practicas y me hagas una propeusta, que tal si hay un state of art en skills a auditoria que no conozcamos.»
6. «me agrada. Solo agregaria un paso. Antes de comenzar que el lead diga algo asi. La skill dice que haga auditorias con agentes en estos cmapos, confirmas todos o quieres que quitemos alguno porque no lo necesitas?. Dicho de otra manera no todas las auditorias necesitaran todos los cmapos y a veces si»
7. Al prototipo del primer paso y del resultado: «me parece bien».
8. Sobre el nombre de la primera fase: «analisis automatizado sera.»
9. «Lo vas a probar hasta tres veces. Es decir, vas a hacer la skill, la vas a probar como audita. Una vez, si encuentras correcciones, vuelves a corregir la skill y vuelves a lanzar la auditoría. […] la idea es que esta skill esté probada. […] El resultado final es que tengas la skill probada y documentada. […] Puedes ocupar mis múltiples proyectos que tengo en la ruta de proyectos activos. Para ver cómo se comportan cada uno de manera distinta. […] Pero este es necesario que pongas que los skills las estén probadas»

## 2. Lo que el dueño confirmó

El Lead le escribió esta propuesta, basada en dos investigaciones (estado del arte de auditorías con IA, y la práctica de ingeniería sin IA), y el dueño la aprobó con «me agrada» y el prototipo con «me parece bien»:

1. **`/aether:audit [temas]`**, skill del plugin como `/aether:onboard`, que sirve en cualquier proyecto donde se use Aether.
2. **Análisis automatizado** (sin modelos, gratis y objetivo): los tests del proyecto, el linter si lo hay, la auditoría de dependencias (`npm audit`, `pip-audit` o el equivalente), secretos en el árbol y en el historial de git, TODO y FIXME, ramas, PRs e issues viejos, y los hotspots del historial de git (los archivos que más cambian y más grandes son). Decide dónde se mira primero.
3. **Una sola pregunta al empezar:** el Lead muestra el resumen del análisis automatizado y propone los temas que aplican al proyecto, cada uno con su razón, y los que deja fuera con la suya. El dueño confirma, quita o agrega. Si el dueño nombra los temas al invocarla (`/aether:audit docs bugs`), no hay pregunta.
4. **Descubrimiento:** un revisor por tema, en paralelo, que empieza por los hotspots y no recibe la conversación del dueño. Los temas, de ISO 25010, OWASP y OpenSSF: bugs; seguridad; dependencias; tests; fiabilidad; rendimiento y accesibilidad cuando aplican; arquitectura y deuda técnica; documentación contra código; versiones y releases; higiene del repositorio; oportunidades.
5. **Verificación:** cada hallazgo pasa a otro agente, en un contexto nuevo, que intenta refutarlo: reescribe la afirmación, qué la dispara y qué la prueba, y la reproduce cuando se puede, sin tocar el proyecto. Cada hallazgo queda «comprobado», «confirmado leyendo el código» o «propuesta»; lo que no se pudo verificar queda «sin verificar» y nunca se ordena como seguro.
6. **Limpieza:** se juntan los hallazgos de la misma causa, se quitan los que ya tienen un issue abierto y se compara con la auditoría anterior (nuevo, sigue, resuelto).
7. **Triaje:** gravedad separada de prioridad; cuatro niveles, P0 urge ya, P1 pronto, P2 programable, P3 cuando puedas o idea; dentro de cada nivel, primero lo que más cuesta esperar y menos cuesta hacer.
8. **La entrega** (el prototipo aprobado): la lista numerada de P0 a P3; cada punto con qué es, dónde (archivo y línea), su tipo, por qué ese nivel, qué tan verificado está, su tamaño y cómo se construiría; luego lo sin verificar, lo descartado, lo que cambió desde la última, lo que no cubrió, el RADAR y el costo. Se guarda el reporte y pregunta cuáles toma el dueño.

## 3. Criterios

- **C1.** `/aether:audit` es una skill del plugin y funciona en cualquier proyecto, no solo en este. (Cita 4.)
- **C2.** Antes de revisar, el Lead corre el análisis automatizado y propone los temas que aplican y los que deja fuera, cada uno con su razón, en una sola pregunta; con temas en la invocación no pregunta. (Citas 6 y 8.)
- **C3.** Los temas cubren la práctica establecida, no solo los cuatro que dijo el dueño. (Cita 5.)
- **C4.** Cada hallazgo de la lista trae su prueba y su estado de verificación, y uno que no se pudo verificar nunca se presenta como seguro: el dueño decide sobre hallazgos en los que puede confiar. (Citas 1 y 3.)
- **C5.** El resultado es una lista ordenada de lo más urgente a lo menos, con la forma del prototipo aprobado, y termina preguntando qué toma el dueño. (Citas 2, 3 y 7.)
- **C6.** La auditoría no cambia nada del proyecto auditado y no arregla nada: el dueño decide qué tomar. (Cita 3.)
- **C7.** La lista no repite lo que ya es un issue abierto, y dice qué cambió desde la auditoría anterior. (Cita 3: «me lo diga todo» sin trabajo repetido.)
- **C8.** La skill se prueba en proyectos reales del dueño, este repositorio incluido, hasta tres rondas, corrigiéndola entre una y otra; cada ronda queda con su evidencia. (Cita 9.)
- **C9.** La skill queda documentada y los tests del repositorio pasan. (Cita 9: «probada y documentada».)

## 4. Fuera de alcance

- Arreglar los hallazgos: la auditoría solo entrega la lista.
- Auditorías programadas, en CI o como GitHub Action.
- Cambiar el modelo de los delegados o la escalera: los revisores y verificadores son delegados normales y siguen sus reglas.
- El merge a `main`, el push y el release: quedan en «Espera tu sí».

## 5. Respuestas a las preguntas

- **¿Skill del plugin o de este repositorio?** Del plugin, para cualquier proyecto (cita 4).
- **¿Nombre?** `/aether:audit`; el dueño aprobó la propuesta y el prototipo con ese nombre.
- **¿Cómo se llama la primera fase?** «Análisis automatizado» (cita 8).
- **¿Qué pasa con lo que el dueño elige?** *Supuesto del Lead, que el dueño no objetó:* cada punto elegido se vuelve un issue de GitHub cuando el proyecto usa GitHub, y luego el dueño dice por cuál empezar. Durante las pruebas no se crea ningún issue en los repositorios del dueño: él no está y crear issues es una acción hacia afuera.
- **¿En qué proyectos se prueba?** El Lead elige entre los de `~/Desktop/03_PROYECTOS/01_ACTIVOS`, distintos entre sí, y este repositorio es obligatorio (cita 9).
