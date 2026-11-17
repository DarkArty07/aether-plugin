---
description: Un plan escrito desde una spec aprobada dice el diseño, los archivos y cómo se verifica.
tags: [skills]
max_turns: 25
allowed_tools: [Read, Glob, Grep, Skill, Write]
---

La spec aprobada es esta: «R1. Un endpoint GET /health responde 200 con {"status":"ok"}. R2. Responde en menos de 50 ms sin tocar la base de datos. Criterio: una prueba llama al endpoint y comprueba el código, el cuerpo y el tiempo». El proyecto es un servidor Node.js con Express en src/server.js. Escribe el plan en specs/002-health/plan.md.
