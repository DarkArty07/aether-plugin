---
title: Trabajar por horas
description: Dale al Lead permiso para trabajar por su cuenta, conoce sus topes y el freno de cuota, y lee el brief que deja al terminar
order: 205
---

# Trabajar por horas

Al final de esta guía el Lead habrá trabajado en una tarea por su cuenta, y tendrás un brief para leer cuando se detenga. Prepararlo toma unos cinco minutos. La corrida dura lo que dure el trabajo, hasta sus topes.

## Antes de empezar

- Aether está instalado y `aeth` lo abre. Si no, empieza por [Instalar y arrancar](instalar-y-arrancar.md).
- Tienes un trabajo que el Lead puede terminar sin ti, como una feature con sus pruebas.
- `aeth` arranca por defecto en el modo de permisos autónomo, sin pedir permisos. Elegiste el modo en `/aether:setup`, y puedes correrlo otra vez para cambiarlo. Importa porque un aviso de permiso de Claude Code detiene una corrida como si fuera una pregunta, y la sesión espera ahí.

## Pasos

### 1. Abre el modo Aether

En una terminal, en la carpeta de tu proyecto:

```
aeth
```

Ves la línea de bienvenida del Lead, que nombra `/aether:help`.

### 2. Pide el trabajo y da el permiso con tus palabras

Di lo que quieres y luego di que lo haga sin ti. Por ejemplo:

```
Agrega un endpoint /health con su prueba. Trabaja autónomamente: no cuentes conmigo hasta acabar.
```

Otras palabras sirven también, como «trabaja por horas». Sin este permiso el Lead se detiene en el plan y espera tu sí. Con él, tu frase también confirma tu intención, así que el Lead no vuelve a preguntar.

Lo que ves: el Lead carga el skill `autonomous-runs` y abre una corrida con `aether-autonomy start`. El comando compara tus palabras con tus propios mensajes de la sesión y exige al menos 12 caracteres tuyos, así que da una frase completa, no un «sí» suelto.

### 3. Pon los topes o deja los de siempre

Una corrida tiene dos topes: 8 horas y US$ 50. Di un número y el Lead lo usa en su lugar:

```
Trabaja por tu cuenta como máximo 3 horas y US$ 20.
```

La cifra en dólares cubre el swarm, las llamadas a otros harnesses y los asientos externos del diseño. No suma los turnos del propio Lead, así que el tope de tiempo es la guarda real. Cuando amplíes los topes en plena corrida con tus palabras, el Lead ejecuta `aether-autonomy extend --hours N --usd N|unlimited --quote "<tus palabras>"` en vez de terminar y reabrir la corrida.

### 4. Déjalo trabajar

El Lead lleva un diario en `.aether/autonomy/<id de la corrida>/diary.md` y lo actualiza tras cada decisión. Puedes leerlo cuando quieras. El Lead sigue trabajando mientras quede trabajo. Se detiene cuando termina, cuando llega a un tope, o con honestidad, cuando todo lo que queda espera tu sí o se repitió sin avanzar. Un fallo que tiene respaldo, como una lane sin cuota, nunca te llega: el Lead lo resuelve y lo anota.

### 5. Conoce el freno de cuota

La ventana de cinco horas de tu cuenta de Claude es la única cuota que una corrida no puede reemplazar. Al 95 % de ella (`quotabrake`, `95` por defecto) el plugin te avisa. En una corrida, el Lead además se detiene en orden: no empieza nada nuevo, detiene lo que corre y guarda el trabajo de cada unidad del swarm en su propia rama. La corrida queda en pausa; no termina.

Cuando la ventana se reinicia, el plugin despierta al Lead. Este lee el diario y relanza la misma corrida desde las ramas guardadas, sin repetir las unidades ya integradas. Si cerraste la sesión, la corrida en pausa se encuentra en el siguiente `aeth`. La ventana de siete días al mismo porcentaje solo avisa. Para cambiar el porcentaje, usa `/plugin` → Installed → aether → Configure options. Las ramas guardadas se quedan locales, salvo que `brakepush` esté encendida y un permiso de push que registraste cubra el push.

### 6. Lee el brief

Cuando la corrida termina, el Lead escribe el brief en `.aether/autonomy/<id de la corrida>/brief.md` y lo muestra en el chat. Su primera línea es `**Resultado:**` con `cumplida`, `parcial` o `no terminada`, y el tope alcanzado, si lo hubo. Lee primero «Espera tu sí» y luego «Supuestos». [Leer el brief](leer-el-brief.md) lo recorre completo.

### 7. Contesta lo que aún espera tu sí

El permiso de trabajar por horas no cubre las acciones irreversibles: un push, un merge a `main`, una publicación, un deploy, un borrado, un comando de credenciales o una llamada de pago. Salvo que hayas autorizado esa clase en palabras generales, esperan en «Espera tu sí», cada una con cómo se revierte y el comando exacto. Por defecto `aeth` además rechaza un comando así cuando ningún permiso lo cubre, en vez de solo anotarlo. Todo lo local y reversible sigue sin preguntar.

## Comprueba que funcionó

- Existe una carpeta `.aether/autonomy/<id de la corrida>/` en tu proyecto, con `diary.md`.
- Cuando la corrida termina, `brief.md` está ahí y empieza con `**Resultado:**`.
- La sección «Tiempo y costo» del brief dice cuánto trabajó el Lead, frente al tope, y cuántas veces te consultó.
- Si el freno de cuota actuó, el diario lo dice: la pausa, la hora del reinicio y las unidades guardadas.

## Siguiente

- [Leer el brief](leer-el-brief.md): «Espera tu sí», «Supuestos» y las líneas RADAR.
- [Ver el gasto](ver-el-gasto.md): el costo a precio de lista de la sesión, aparte del tope.
- [Otros harnesses](otros-harnesses.md): manda trabajo a los planes que ya pagas.
- [Autonomía](../../guide/autonomy.md#autonomy-1) (en inglés): el contrato completo, los permisos y la guarda.
- [Opciones](../../guide/options.md#options) (en inglés): `quotabrake`, `brakepush` y las demás.
