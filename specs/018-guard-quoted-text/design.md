# Diseño corto: `aether-guard` entiende `$( … )` dentro de comillas (issue #95)

Toca `plugins/aether/lib/guard.js`, el que decide qué comando es irreversible. Un error aquí deja pasar un `git push` o frena un `gh issue create` sin motivo, por eso pasa por el Juez.

## Lo que pidió el dueño

- «Neceisot que trbajaes d emanera autonoma los bugs en un worktree apartoe porque otra seison esta trbajando sobre el repo» (2026-10-26). El #95 es uno de esos bugs.
- El issue pide: el texto de un heredoc o de un argumento entre comillas de un comando que no evalúa (`gh`, `git commit -m`, `echo`, `cat >`, `printf`) no se escanea como comando; lo que corre dentro de `$(…)` y de backticks sí; y `bash -c "<comando destructivo>"` se sigue rechazando.

## Lo medido (código del 2026-10-26, `irreversibleClass`)

El `gh issue create --title "t" --body "$(cat <<'EOF' … EOF)"` del issue sí se reproduce, pero solo cuando el cuerpo trae comillas dobles:

- cuerpo con `He said "ok` y en otra línea `git reset --hard abc123`: clase `delete` (falso positivo);
- cuerpo con `He said "run \`git reset --hard abc123\` now" and left.`: clase `delete` (falso positivo);
- cuerpo sin comillas dobles, o con ellas bien repartidas: sin clase (correcto).

Y el mismo defecto, al revés, deja pasar lo que sí corre:

- `echo "$(git push origin main)"`: sin clase (falso negativo);
- ``echo "`git push origin main`"``: sin clase (falso negativo).

## Causa

`segmentsOf` lee un comando como palabras. Dentro de comillas dobles trata todo como texto, también `$(…)` y los backticks. En el shell, un `$(…)` dentro de comillas dobles abre un contexto nuevo: sus comillas son suyas y su contenido es código. Como el guard no lo sabe:

1. Un `"` dentro del cuerpo de un heredoc que vive en `"$(cat <<'EOF' … EOF)"` cierra las comillas de fuera. El resto del cuerpo se lee como código, y una línea o un backtick que empieza por `git reset --hard` pasa a ser un comando (falso positivo).
2. Lo que está dentro de `"$(…)"` nunca se clasifica, aunque corra (falso negativo).

## Decisión

En `segmentsOf`, al encontrar `$(` (dentro de comillas dobles; fuera de ellas ya funciona porque `(` separa segmentos):

1. Buscar su `)` de cierre con un lector que respeta comillas simples y dobles, `$(` anidados, backslashes y heredocs, y que lleva una cuenta de profundidad de paréntesis: cada `(` suelto de dentro (un subshell `( … )`) suma y su `)` resta, de modo que el `)` de cierre es el que deja la cuenta en cero. `$((` es aritmética solo si tiene su `))` emparejado, contando los paréntesis internos (en `$(((1+2)))` el cierre es el último `))`, no el primero); su contenido no es código (salvo un `$(` anidado dentro, que se trata como cualquier otro). Sin ese `))` emparejado, `$((` es un `$(` con un subshell dentro (`$((echo ok); git push origin main)`) y se lee como tal; si tampoco cierra así, es el caso sin cierre y se segmenta como código. Un `\$(` dentro de comillas dobles es literal: no abre nada.
   - En un heredoc, el lector registra si el delimitador iba entrecomillado (`<<'EOF'`, `<<"EOF"`, `<<\EOF`). Si iba entrecomillado, el cuerpo es texto, y un `)` o un `"` dentro de él no cuentan. Si no (`<<EOF`), el shell expande el cuerpo: sus `$(…)` y backticks son código y se segmentan como en el resto, y el demás texto del cuerpo es texto.
2. Segmentar el texto de dentro con la misma función (recursión) y sumar esos segmentos a los del comando, de modo que `git push`, `bash -c "…"` o `eval` dentro se clasifican como siempre. Los segmentos de dentro se insertan en el punto donde aparece el `$(…)`, entre el segmento anterior y el siguiente del comando, no al final: el primer segmento que coincide decide, y así el orden de lectura es el del comando.
3. Seguir fuera de `$(…)` en las comillas dobles, con un marcador en la palabra.

La recursión tiene tope: a `MAX_NESTING` niveles de `$(`/backtick anidados (el mismo tope de los envoltorios), el resto se segmenta como código sin seguir entrando, igual que en el caso sin cierre. El guard permite el comando ante cualquier error (`bin/aether-guard`), así que un desbordamiento de pila no puede ser el modo de fallar.

Lo mismo para un par de backticks dentro de comillas dobles: el texto entre ellos se segmenta como código; un backslash antes del backtick lo hace literal.

Si el `$(` o el backtick no tiene cierre (comando cortado), el resto se segmenta como código: es la lectura conservadora, la que no deja pasar un comando.

## Lo que no cambia

- Comillas simples: todo es texto, también `$(` y backticks (en el shell no corren).
- Texto entre comillas dobles que no es `$(` ni backtick: palabra, como hoy.
- `bash -c`, `sh -c`, `eval` y los envoltorios (`sudo`, `env`, `timeout`…): se escanean como hoy, hasta `MAX_NESTING` niveles.
- Las clases y sus listas de subcomandos.

## Pruebas (en `tests/guard.test.js`)

1. Los dos falsos positivos de arriba: sin clase.
2. Un cuerpo de heredoc que trae `)` y `"` sueltos dentro de `"$(cat <<'EOF' … EOF)"`: sin clase.
3. `echo "$(git push origin main)"` y ``echo "`git push origin main`"``: `push`.
4. `gh issue create --body "$(cat <<'EOF' … EOF)" && git push origin main`: `push` (el comando que sigue al cuerpo se clasifica).
5. `bash -c "git push origin main"` y `bash -c "echo \"$(git push)\""`: `push`.
6. `$(` sin cierre y backtick sin cierre: no lanzan, y clasifican lo que sigue como código.
7. Comillas simples: ``echo '$(git push origin main)'`` sin clase.
8. `$(` anidado: `echo "$(echo "$(git push origin main)")"`: `push`.
9. Subshell dentro de `$(…)` seguido de un irreversible: `echo "$((echo ok); git push origin main)"`: `push`.
10. Aritmética: `echo "$((1 + 2))"` sin clase, y `echo "$(echo $((1 + 2)); git push origin main)"`: `push`. Con paréntesis dentro de la aritmética: `echo "$(echo $(((1+2))); git push origin main)"`: `push`.
11. Heredoc sin entrecomillar: `echo "$(cat <<EOF` con `$(git push origin main)` en el cuerpo `EOF)"`: `push`; con `<<'EOF'` el mismo cuerpo: sin clase.
12. Orden: `echo "$(npm publish)" && git push origin main` clasifica `publish`, y `git push origin main && echo "$(npm publish)"` clasifica `push` (decide el primero en el orden del comando).
13. Anidado profundo (más de `MAX_NESTING` niveles de `"$(` abiertos, con un `git push origin main` en el centro): no lanza, y clasifica `push`.
14. Escapados: `echo "\$(git push origin main)"` y ``echo "\`git push origin main\`"``: sin clase.
15. Todas las pruebas de `irreversibleClass` y de `decide` que hay hoy siguen pasando.

## Riesgos

- Es más estricto que hoy en `"$(…)"` y en backticks entre comillas: lo que antes pasaba sin clase y corría, ahora se clasifica. Es un arreglo, y el dueño lo vería como una línea más en su lista solo cuando de verdad corrió algo irreversible.
- Un lector de cierre mal hecho puede dejar `)` sin emparejar. Por eso el caso sin cierre es conservador y hay pruebas de anidado y de heredoc.

## Fuera

- `<(…)` (process substitution), `$'…'` y las expansiones `${…}`: no cambian.
- `case` dentro de `$(…)`: el `)` de un patrón de `case` no se distingue de un cierre. Hoy tampoco se detecta, así que no hay regresión; no se trata en este arreglo.
- Reescribir `segmentsOf` con un parser completo de shell.
