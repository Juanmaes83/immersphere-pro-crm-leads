# Master Guide: Visual Banner Replication

## Objetivo

Replicar una banderola visual validada para un nuevo lead usando una base ya aprobada, sin regenerar desde cero y sin convertir la herramienta/editor en la URL final. El resultado debe ser una experiencia visual publica, limpia, con logo real, datos reales, QR correcto y canvas no vacio.

## Regla principal

La banderola no se considera terminada hasta que pasa estos cuatro gates:

1. Base correcta clonada.
2. Datos y assets reales insertados.
3. Validacion local visual superada.
4. Validacion publica en Vercel superada.

Si un gate falla, no se avanza. Se vuelve al ultimo gate valido.

## Inputs obligatorios

- Lead destino: nombre comercial, slug, telefono WhatsApp, email, web y direccion.
- URL o archivo de la banderola base validada.
- Logo real del cliente, no placeholder.
- Imagen principal real o fallback aprobado.
- URL destino para QR.
- Repositorio destino.
- Ruta publica final esperada.

## Paso 1: elegir la base correcta

Usar una banderola ya validada visualmente, no una prueba generica.

Ejemplo de base valida:

- Casas y Mar: `dynamic-motion-banner/casas-y-mar-visita-propiedad/`

Antes de copiar, comprobar:

- Renderiza el resultado final, no una herramienta.
- Tiene composicion aprobada.
- El canvas no esta vacio.
- El QR existe.
- El layout no se rompe en desktop.

No usar:

- Rutas de editor.
- Rutas de test.
- Rutas que muestran controles internos.
- Salidas genericas de IA sin revisar.

## Paso 2: crear la nueva ruta

Crear una ruta nueva para el lead destino con slug estable.

Formato recomendado:

```text
dynamic-motion-banner/{lead-slug}/
```

Para Torrevieja Sur:

```text
dynamic-motion-banner/torrevieja-sur/
```

La ruta final debe apuntar al resultado visual limpio. Si existe un modo `clean=1` o `embed=1`, debe ocultar controles y cualquier capa de herramienta.

## Paso 3: sustituir solo campos controlados

Cambiar unicamente:

- Nombre del cliente.
- Logo.
- Telefono.
- WhatsApp.
- Web.
- Direccion.
- CTA.
- QR.
- Imagen principal si existe una valida.

No cambiar:

- Motor de canvas/WebGL.
- Estructura base aprobada.
- Animacion principal.
- Sistema de escalado.
- Reglas de render.
- Layout validado salvo correcciones puntuales.

## Paso 4: insertar logo real

El logo debe cumplir:

- Archivo real del cliente.
- Ruta publica valida.
- Carga HTTP 200.
- Tamano visual suficiente.
- No deformado.
- No sustituido por logo de otro cliente.

Si el logo aparece demasiado pequeno, ajustar su contenedor visual, no cambiar la imagen por otra.

## Paso 5: generar o revisar QR

El QR debe apuntar a la URL que se quiere enviar al cliente.

Validar:

- Visible.
- No pixelado.
- No tapado por otros elementos.
- No cortado por el footer.
- Coherente con la CTA.

## Paso 6: corregir composicion critica

Revisar manualmente:

- Footer sin solapes.
- Telefono y ciudad no se pisan.
- Nombre del cliente no se repite innecesariamente.
- Barra superior con naming correcto.
- Logo proporcionado y legible.
- CTA visible.
- QR integrado, no pegado sin criterio.

## Paso 7: validar local

Abrir la URL local directa.

Validaciones minimas:

- Pagina carga.
- Canvas/render visible.
- Logo real visible.
- QR visible.
- Footer correcto.
- Sin consola con errores criticos.
- Sin rutas rotas de assets.

Si se usa servidor local, anotar puerto y URL exacta.

## Paso 8: validacion visual en navegador

Comprobar con captura o inspeccion:

- El resultado es la banderola, no una herramienta.
- No hay pantalla blanca.
- No hay canvas vacio.
- El logo corresponde al cliente destino.
- La composicion coincide con la base elegida.

## Paso 9: publicar

Publicar solo cuando local este validado.

Anotar:

- Repo.
- Rama.
- Commit SHA.
- URL publica.
- Fecha/hora.

## Paso 10: validar Vercel/publico

Abrir la URL publica final y repetir las validaciones.

La banderola queda aprobada solo si:

- URL publica carga.
- Canvas/render no esta vacio.
- Logo real visible.
- QR visible.
- No aparece herramienta/editor.
- No hay assets rotos.
- No hay diferencias graves frente a local.

## Recovery Playbook

### Canvas vacio

1. Confirmar que se esta abriendo la ruta correcta.
2. Abrir la ruta directa del HTML o componente, no una ruta inventada.
3. Revisar consola.
4. Revisar si falta script, asset o dependencia.
5. Confirmar dimensiones del canvas.
6. Volver a validar local antes de publicar.

No publicar una banderola con canvas vacio.

### Logo roto

1. Abrir la URL del logo directamente.
2. Confirmar HTTP 200.
3. Confirmar nombre exacto del archivo.
4. Revisar mayusculas/minusculas.
5. Confirmar que el componente usa el logo nuevo.
6. Limpiar cache o anadir query param solo para validar.

No aceptar placeholder si existe logo real.

### Aparece la herramienta en vez del resultado

1. La ruta esta mal o falta modo limpio.
2. Buscar la ruta que renderiza el resultado final.
3. Crear ruta publica especifica si no existe.
4. Validar con `?clean=1` o equivalente.
5. No usar esa URL como final hasta que el cliente vea solo la experiencia.

### Local funciona, Vercel falla

1. Revisar build.
2. Revisar logs de Vercel.
3. Confirmar que el archivo esta incluido en el commit.
4. Confirmar rewrites/rutas.
5. Confirmar deploy activo.
6. Abrir la URL publica con cache-buster.

### QR mal insertado

1. Confirmar URL destino.
2. Regenerar QR.
3. Revisar tamano y contraste.
4. Revisar que no se solape con footer o CTA.
5. Validar visualmente en pantalla completa.

### Footer solapado

1. Separar telefono, ciudad y web en bloques.
2. Reducir texto redundante.
3. Aumentar espacio vertical.
4. Validar desktop y anchura media.

## Criterio de aprobado

Una banderola esta aprobada cuando se puede enviar al cliente sin explicar nada:

- Se entiende de quien es.
- Se ve el logo real.
- Se ve la propuesta visual.
- Se puede escanear el QR.
- Se puede contactar.
- No parece una plantilla generica.
- No muestra herramienta interna.

## Salida obligatoria

Al terminar, registrar:

```text
leadSlug:
baseUsed:
publicUrl:
embedUrl:
repo:
branch:
commitSha:
validationStatus:
knownWarnings:
validatedAt:
```

