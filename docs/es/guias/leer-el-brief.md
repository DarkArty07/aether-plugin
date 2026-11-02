---
title: Leer el brief
description: Lee en el orden correcto el brief que termina un trabajo y contesta lo que espera tu sí
order: 204
---

# Leer el brief

Al final de esta guía puedes leer cualquier brief en unos cinco minutos, sabes qué dos secciones leer primero y puedes contestar lo que te espera.

## Antes de empezar

- Tienes un brief para leer. Llega al final de cada trabajo: [Tu primera petición](primera-peticion.md) y [Una feature completa](feature-completa.md) terminan con uno.
- Los nombres de las secciones del brief están en español, y esta guía los usa tal cual.

## Pasos

### 1. Lee el resultado

El brief de una corrida abre con el resultado bajo su título: `**Resultado:**` con `cumplida`, `parcial` o `no terminada`, y el tope que la detuvo, si hubo alguno. Fuera de una corrida el brief es corto y abre con la sección siguiente.

### 2. Lee primero «Espera tu sí»

Es tu lista: lo que solo tú puedes decidir y las acciones irreversibles que nadie autorizó. Cada ítem tiene las mismas seis partes:

```
acción · clase · por qué · si dices que no · cómo se revierte · el comando exacto
```

En palabras: qué quiere hacer el Lead, de qué clase de acción se trata (`push`, `merge-main`, `publish`, `deploy`, `delete` o `credentials`), por qué hace falta, qué pasa si dices que no, cómo se deshace y el comando exacto que se ejecutará. Por ejemplo:

```
Subir la rama feature/descuentos · push · para abrir el PR · si dices que no: la rama queda solo en tu máquina · se revierte: borrando la rama remota · se ejecutará: git push origin feature/descuentos
```

Cuando el Lead se detuvo en el plan, porque no diste permiso para trabajar por horas, la lista también tiene cómo construir: el método que el Lead recomienda, y tu sí inicia la construcción. Una falla que tiene respaldo, como un harness sin cuota, nunca llega a esta lista. El Lead la maneja y la anota.

### 3. Lee «Supuestos»

Son las cosas que tu petición no cubría y que el Lead decidió asumir. Cada una trae su base y dice si se puede revertir. Están ordenadas por qué tan probable es que las vetes, la más probable primero. Lee desde arriba y detente cuando estés de acuerdo con el resto.

### 4. Repasa «Criterios» y las líneas RADAR

«Criterios» son los criterios con su evidencia. Después vienen cinco líneas RADAR, una por cada meta de Aether:
- **Rápido:** el tiempo, los reintentos y las subidas a un modelo más fuerte.
- **Autónomo:** cuántas veces el Lead te interrumpió, y por qué.
- **Delegación:** las llamadas y los tokens que corrieron en otros harnesses, y la cuota que queda.
- **Asequible:** los dólares, la cuota usada, y el modelo y el esfuerzo de cada tarea delegada.
- **Robusto:** los tests, el examen, los hallazgos y los veredictos del Judge.

### 5. Lee «Qué no verifiqué»

Es lo que el Lead no pudo comprobar, así que es donde conviene ser escéptico. Alrededor están lo que hizo («Hice») y decidió («Decidí»), lo que encontró («Descubrí»), lo que no terminó («No terminé»), las propuestas más allá de tu intención («Propuestas», en las que el Lead no trabaja) y el tiempo y el costo («Tiempo y costo»). La cifra de costo de una corrida cubre el swarm y las llamadas a otros harnesses, no los turnos del propio Lead.

### 6. Contesta la lista

Contesta cada ítem con palabras simples:
- **«Sí»** y el Lead ejecuta esa acción, una vez.
- **Un sí general,** como «sí, todos los merges a main» o «siempre», también registra un permiso permanente para esa clase de acción, y el Lead no vuelve a preguntar. Añade «en esta sesión» y el permiso dura solo la sesión. El permiso necesita al menos 12 caracteres de tus palabras, que el Lead comprueba contra tus propios mensajes.
- **«No»** y pasa lo que dice «si dices que no» del ítem. El Lead sigue con lo que no depende de eso.

Con `AETHER_IRREVERSIBLE=enforce`, que `aeth` pone salvo que tu shell ya lo hiciera, el guardia rechaza la acción incluso después de tu sí hasta que un permiso cubra su clase. El Lead registra tu respuesta como un permiso de la sesión, ejecuta la acción y lo revoca. Si tu respuesta tiene menos de 12 caracteres, el brief trae el comando exacto para que lo ejecutes tú.

## Comprueba que funcionó

- De cada ítem de «Espera tu sí» puedes decir qué pasa con tu sí y con tu no.
- Después de un sí general, `aether-autonomy list` muestra el permiso.
- El brief de una corrida también queda guardado en `.aether/autonomy/<run id>/brief.md`.

## Siguiente

- [Trabajar por horas](trabajar-horas.md): cómo una corrida llega a su brief, y los topes que respeta.
- [Ver el gasto](ver-el-gasto.md): qué significan las líneas de costo.
- [Autonomy](../../guide/autonomy.md#autonomy) (en inglés): los permisos y el guardia completos, y [Troubleshooting](../../guide/troubleshooting.md#a-command-was-refused-or-recorded) (en inglés) cuando se rechaza un comando.
