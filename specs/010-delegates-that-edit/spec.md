# Los delegados que editan salen primero a otros harness

- **Date:** 2026-10-21
- **Status:** Draft
- **Intent:** [intent.md](intent.md), confirmada por el dueño el 2026-10-21 (suposiciones A, B y C; «lo que supones es lo que quiero») y ampliada con su política de la sección 6 y las mediciones de la sección 7. La regla de elección es la de A65 y A66 ([spec 009](../009-superdelegation/spec.md)) y no cambia.

## Criteria

Cada criterio cita las palabras del dueño tal como están en la tarjeta y nombra la evidencia que lo prueba.

- C1. **Con la superdelegación encendida, el delegado que edita sale primero a otro harness.** Un delegado del Lead que edita archivos, de cualquier tamaño, corre primero en agy, grok o muse, elegido por la regla única (puntos del par de referencia, cuota que se renueva antes, más barato por tarea), y Claude nativo toma la tarea solo cuando ningún par externo llega a los puntos que pide, todos están sin cuota o todos rechazan. Velocidad, tamaño de la tarea o comodidad no son razón para usar Claude. «SI EL MODO SUPERDLEGACION ESTA ACTIVADO ES PRIORDIAD A TODA COSTA DE MANDAR EL TRBAAJO A OTROS HARNESS. QUE PARTE NO SE ME ENTIENDE». «lo que quiero es poder gastar las cuotas de los otros planes incluso con delegate y el swarm y el swarm de diseño». «delegacion por niveles de intelgiencias en modelos y effort no?». Evidencia: pruebas con la tabla de pares fija y cuotas sanas: una tarea que edita, grande o pequeña, sale a un par externo que llega; una cuyos puntos ningún par externo alcanza corre nativa; con la superdelegación apagada, nada sale.
- C2. **El trabajo vuelve como una rama que el Lead revisa y fusiona, y el CLI externo nunca toca el checkout del dueño.** El delegado externo trabaja en un worktree de unidad creado por `aether-wt`, como una unidad del enjambre, y no en la copia desechable de hoy. Al terminar, el Lead recibe un resumen, la rama y el resultado de las pruebas, y es él quien fusiona. «lo que supones es lo que quiero» (suposiciones A y B). Evidencia: una prueba con un CLI externo simulado que edita: el checkout del dueño queda intacto, el trabajo está en una rama de un worktree de unidad y el resultado trae resumen, rama y resultado de las pruebas; la fusión la hace el Lead con `aether-wt merge`.
- C3. **Una tarea larga no se corta por el límite de diez minutos del motor.** El mod no puede dejar una llamada externa corriendo y devolver su resultado después, así que el Lead lanza la tarea en segundo plano, sigue con otra cosa y recibe el aviso al terminar; no espera. «lo que supones es lo que quiero» (suposición C: una tarea de más de unos 9 minutos queda en segundo plano en el externo). Medido en la sección 7 de la tarjeta: `$.process.run` rechaza más de diez minutos y nada en los hooks devuelve un resultado después. Evidencia: una prueba con un CLI simulado que dura más de 570 s (con el reloj acelerado) termina con su resultado y no con un corte; el comando que lanza vuelve de inmediato con un identificador y su estado se consulta después.
- C4. **Si un par se rechaza o falla, se prueba el siguiente y nunca el mismo, Claude queda de último y nunca se le pregunta al dueño.** Cuota, modelo o error de un par externo pasan la tarea al siguiente candidato de la regla; cuando no queda ninguno, la tarea se repite en Claude. «siempre esta el fallback de continuar y nunca detener el trabajo». «lo que supones es lo que quiero» (suposición B: «nunca en el mismo par»). Evidencia: pruebas con un par que falla por cuota, por modelo y por error: el intento siguiente va a otro par, nunca al que falló; sin más candidatos el comando lo dice (sin candidato) para que el Lead use Claude, y ningún paso pide respuesta al dueño.
- C5. **El Lead gasta poco de Claude en esto.** Su parte es lanzar, esperar el aviso y decidir. La lectura del diff la hace un revisor externo de solo lectura cuando se puede, y el Lead solo corre las pruebas y decide la fusión. «primero quiero que se acaben las de otros harness porque ... si la de claude code se acabo el lead no puede seguir trabajando porque depende de su cuota». Evidencia: una prueba del comando con un revisor externo simulado: el diff lo lee el revisor, que sale por la regla única; el resultado trae el veredicto del revisor sin que el Lead lea el diff; si ningún par externo sirve para revisar, lo dice y el Lead decide qué hace.
- C6. **Las reglas del Lead lo dicen.** Con la superdelegación encendida, la ruta «delegate task», la tabla de modelos de un delegado y el método de ejecución mandan el trabajo que edita a otro harness por el comando nuevo, y el Lead no lo manda a Claude por costumbre; apagada, todo sigue como hoy. «SI EL MODO SUPERDLEGACION ESTA ACTIVADO ES PRIORDIAD A TODA COSTA ...» «contruyes esa, quiero que en las sigueintes sesiones tambien el trafico de los agetnes delegados se vyaa a otros harness». Evidencia: las pruebas de las reglas del Lead (`tests/bootstrap-names.test.js`, `tests/bootstrap-design.test.js`, `tests/launcher.test.js`) y una prueba de docs ven el texto, que no pasa del tope de bytes del bootstrap; los documentos de usuario (`docs/`) dicen lo mismo y `tests/docs-facts.test.js` pasa.
- C7. **Se prueba de verdad.** Antes de cerrar hay pruebas sin gasto de cuota con el CLI simulado y una corrida real corta hecha por el Lead que muestra un delegado que edita saliendo a otro harness y volviendo como rama. «necesito que trabjes en lo que conversmaos, continua implementandolo». «contruyes esa, quiero que en las sigueintes sesiones tambien el trafico de los agetnes delegados se vyaa a otros harness». Evidencia: las pruebas pasan en `npm test`; el informe de la corrida real muestra la tarea, el par que la tomó, el motivo y la rama.

## User scenarios

- **E1. Una tarea que edita sale a otro harness.** Dado `superdelegation` encendido, cuotas sanas y una tarea que edita archivos, cuando el Lead la delega, entonces el comando elige un par externo por la regla única, trabaja en un worktree de unidad y devuelve resumen, rama y resultado de las pruebas; el Lead revisa y fusiona.
- **E2. Tarea larga.** Dado un delegado externo que tarda 25 minutos, cuando el Lead lo lanza, entonces el comando vuelve de inmediato, el Lead sigue con otra cosa, y al terminar el aviso en segundo plano trae el resultado; el límite de diez minutos del motor no interviene.
- **E3. El par falla.** Dado un par externo que se queda sin cuota a mitad de la tarea, cuando el comando lo detecta, entonces descarta ese worktree o intento, prueba el siguiente par de la regla sin repetir el que falló, y si no queda ninguno devuelve «sin candidato» para que el Lead use Claude.
- **E4. Nada que lo alcance.** Dado una tarea cuyos puntos ningún par externo alcanza, cuando el Lead la delega, entonces el comando lo dice y la tarea corre en Claude nativo, sin preguntar al dueño.
- **E5. Tarea sin pruebas propias.** Dado una tarea de documentación sin comando de pruebas, cuando el delegado termina, entonces se acepta con la revisión externa del diff y sin pruebas.
- **E6. Superdelegación apagada.** Dado `superdelegation` apagado, cuando el Lead delega una tarea que edita, entonces corre en Claude nativo como hoy y no se llama a ningún harness externo.
- **E7. Cupo.** Dado el cupo de llamadas a la vez de un harness lleno por otros delegados, cuando llega una tarea que ese harness podría tomar, entonces espera a que se libere, con el límite de la regla vigente, y si se agota corre en Claude.
- **E8. Credenciales y directorio.** Dado un CLI externo lanzado para editar, cuando corre, entonces su entorno no trae las credenciales del dueño ni de Claude, y su directorio de trabajo es un worktree de unidad.

## Requirements

- R1. Con `superdelegation` encendido, existe un comando que toma un encargo suelto (objetivo, archivos, comando de pruebas, rutas que posee, qué es terminar) y lo ejecuta de punta a punta en un harness externo sin necesitar un plan compilado: crea el contexto de una sola unidad, pide el par con la misma función de elección que usan el enjambre y el diseño, lo lanza, espera y devuelve la rama. Sirve a: C1, C2.
- R2. El par se elige con los puntos del par de Claude (modelo y effort) que le tocaría a la tarea, con el orden de la regla (cuota que se renueva antes, luego más barato por tarea), solo entre agy, grok y muse, sin tocar la regla ni sus tablas. Sirve a: C1.
- R3. Ningún par se descarta por velocidad, por el tamaño de la tarea ni por comodidad: el comando solo declara «sin candidato» cuando ningún par externo llega a los puntos, todos están sin cuota o todos rechazan, y entonces lo dice con ese motivo. Sirve a: C1, C4.
- R4. El CLI externo corre en un worktree de unidad creado por `aether-wt`, y el checkout del dueño no cambia durante ni después de su ejecución; el entorno del CLI no incluye las credenciales del dueño, como en las lanes. Sirve a: C2.
- R5. Al terminar, el resultado trae un resumen, el nombre de la rama, el resultado del comando de pruebas y el par que tomó la tarea con su motivo. El comando no fusiona: la fusión es del Lead, con el mecanismo de fusión de a una que ya existe. Sirve a: C2.
- R6. El comando se lanza en segundo plano y vuelve de inmediato con un identificador; su estado y su resultado se consultan por separado y no dependen de que el mod pueda devolver un resultado después. Ninguna llamada de ese camino pasa por el límite de diez minutos del motor. Sirve a: C3.
- R7. La tarea larga no se corta por tiempo en el externo: el límite que se aplica al CLI es el de la regla vigente de lanes, no el de 570 s, y su cumplimiento se prueba con el reloj acelerado. Sirve a: C3.
- R8. Cuando un par es rechazado o falla (cuota, modelo, error del CLI, tiempo), el comando deshace el worktree de ese intento, lo registra y prueba el siguiente candidato de la regla, excluyendo todos los pares que ya probó; el registro dice cada par probado y su causa. Sirve a: C4.
- R9. Cuando no queda candidato, el comando termina con un estado claro de «sin candidato» y la causa, sin pedir nada al dueño, para que el Lead repita la tarea en Claude. Sirve a: C4.
- R10. Con el resultado externo en mano, el comando puede lanzar la revisión del diff como una llamada de solo lectura a otro par externo, elegido por la misma regla y que no es el que escribió; el resultado trae su veredicto. Si ningún par externo sirve para revisar, el resultado lo dice y la revisión queda al Lead. Sirve a: C5.
- R11. Una tarea sin comando de pruebas se acepta con el veredicto de la revisión del diff, y el resultado dice que no hubo pruebas. Sirve a: C5.
- R12. El Lead no espera dentro de su turno: la regla le dice que lance el comando en segundo plano, siga con otra cosa y actúe con el aviso, y que con el resultado corra las pruebas y decida la fusión. Sirve a: C3, C5, C6.
- R13. Los delegados externos que editan cuentan contra el cupo de llamadas a la vez (`maxParallel`) de su harness, aunque corran fuera de una corrida; un cupo lleno espera, y con el límite agotado la tarea cae a Claude. Sirve a: C1, C4.
- R14. En `skills/using-aether/SKILL.md`, con la superdelegación encendida, la ruta «delegate task», la tabla de modelos de un delegado y el método de ejecución dicen que el trabajo que edita sale primero a otro harness por el comando, que Claude nativo queda de respaldo solo en los casos de R3, y que el Lead mismo sigue en Claude. Con la superdelegación apagada, las reglas actuales no cambian. Sirve a: C6.
- R15. Las páginas de usuario que hablan de los delegados y de la superdelegación (guía, referencia, README si corresponde) dicen lo mismo que la regla y que el comando, y las pruebas de documentos pasan. Sirve a: C6.
- R16. Hay pruebas sin cuota con un CLI externo simulado que cubren los escenarios E1 a E8, entre ellas: cada causa de fallo de R8, «sin candidato» de R9, la tarea sin pruebas de R11, el worktree intacto de R4, y el cupo de R13. Sirve a: C7.
- R17. Se hace una corrida real corta, por el Lead, con el permiso `paid-call` del dueño, de un delegado que edita en un harness externo; el informe de la corrida dice la tarea, el par, el motivo y la rama. Sirve a: C7.

## Proposals

None.

## Assumptions

- **Revisión externa del diff.** La revisión del diff la hace un delegado externo de solo lectura y el Lead solo corre las pruebas y decide. Base: la recomendación de la tarjeta (sección 10, supuesto 1), por C5. El dueño puede revertirlo: bastaría quitar R10 y que el Lead lea el diff.
- **Tarea sin pruebas.** Se acepta con la revisión externa del diff (sección 10, supuesto 2). Reversible: el dueño puede exigir pruebas o la lectura del Lead.
- **El Lead no espera.** Sigue con otra cosa y el aviso en segundo plano le trae el resultado (sección 10, supuesto 3), porque el mod no devuelve resultados tardíos. Reversible.
- **El comando es nuevo y es de la familia `aether-lane`.** La tarjeta no nombra el comando; se asume que cuelga de `aether-lane` por usar su elección, su cuota y su registro. El plan fija el nombre. Reversible: es solo un nombre.
- **El tiempo en el externo.** Se usa el límite de CLI de lanes ya vigente, no uno nuevo, porque el de 360 s de los delegados nace del tope del motor que aquí no aplica. Si hace falta otro número, es una opción de configuración. Reversible.
- **Fusión.** La rama del delegado se fusiona en la rama actual del dueño, nunca en `main` por el comando. Reversible.
- **Revisión final del enjambre.** Fuera de esta spec, como dice la tarjeta; sigue como está.
- **Pares que sirven.** agy, grok y muse; codex y cursor no se adoptan por ahora («codex y cursor por el momento no los adoptamos»). Reversible: la lista es la de los harness habilitados.

## Irreversible actions

- Una llamada de pago a un harness externo para la corrida real (R17), `paid-call`: el comando nuevo de `aether-lane` con un encargo real corto; su nombre exacto lo fija el plan, y el Lead lo corre en una llamada propia después de registrar el permiso del dueño («autorizo gasto no hay problema»). El permiso de gasto del dueño debe quedar registrado con `aether-autonomy grant` con sus palabras, sin rodear la guarda.
- La fusión de la rama del delegado en la rama del dueño (R5, R12): la hace el Lead con `aether-wt merge`, y no es un `merge-main` mientras la rama actual no sea `main`; en ese caso es `merge-main` y requiere el permiso.

## Out of scope

- Codex y Cursor.
- Mover al Lead fuera de Claude.
- La revisión final del enjambre en rebanadas por lane.
- Cambiar la regla de elección (A65, A66) y sus tablas.
- El enjambre y el diseño, que ya usan la regla.
- Hacer que el mod devuelva un resultado después de una llamada larga.
