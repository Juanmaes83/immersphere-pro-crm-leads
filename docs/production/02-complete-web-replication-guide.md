# Complete Web Replication Guide

## Objetivo

Replicar una web completa validada para un nuevo lead usando una base premium existente, conectando datos reales, assets reales y la banderola final aprobada. La web no esta lista hasta que la banderola queda embebida y validada en local y en publico.

## Regla principal

No construir una web desde cero si existe una base validada. El trabajo correcto es clonar, adaptar campos controlados, integrar la banderola, validar y publicar.

## Inputs obligatorios

- Lead destino.
- Web base validada.
- Datos auditados del lead.
- Logo real.
- Imagenes reales o fallbacks aprobados.
- URL publica final de la banderola.
- URL embed limpia de la banderola.
- Repositorio y ruta de publicacion.

## Paso 1: elegir base validada

La base debe:

- Haber compilado antes.
- Tener ruta publica funcional.
- Tener estructura premium aprobada.
- Tener componentes separados y mantenibles.
- No depender de datos hardcodeados imposibles de sustituir.

No elegir una base solo porque "se parece". Debe poder compilar y adaptarse.

## Paso 2: localizar ruta real

Antes de tocar codigo, confirmar:

- Ruta publica esperada.
- Componente que renderiza esa ruta.
- Archivo de datos del cliente.
- Assets usados por esa ruta.

Ejemplo:

```text
route: /torrevieja-sur-web-completa
component: TorreviejaSurPremiumDemo
data: torreviejaSurPremium.ts
```

## Paso 3: duplicar/adaptar datos

Actualizar solo campos del cliente:

- Nombre.
- Sector.
- Slug.
- Telefono.
- WhatsApp.
- Email.
- Web.
- Direccion.
- Claim.
- Servicios.
- Propuesta comercial.
- Imagenes.
- Logo.
- Rutas publicas.

Mantener la estructura de datos original si ya esta validada.

## Paso 4: validar assets

Cada asset debe abrir directamente:

- Logo.
- Hero.
- Imagenes de coleccion.
- Video si existe.
- QR si se usa.

Si falta un asset:

1. Usar asset real detectado por auditoria.
2. Si no existe, usar fallback aprobado.
3. Registrar warning.
4. No inventar asset como si fuese real.

## Paso 5: integrar la banderola

Este es el punto de union con la guia de banderola.

La web completa debe recibir:

```text
visualExperience.publicUrl
visualExperience.embedUrl
visualExperience.status
visualExperience.validatedAt
```

La `embedUrl` debe ser una URL limpia, sin herramienta ni controles.

Ejemplo:

```text
https://rubik-sota-director-de-orquesta.vercel.app/dynamic-motion-banner/torrevieja-sur/?embed=1
```

No usar:

- URL local.
- URL de editor.
- URL de preview rota.
- URL que muestra herramienta.
- URL de otro cliente.

## Paso 6: colocar iframe o modulo visual

El iframe debe:

- Tener altura suficiente.
- Ser visible.
- No romper mobile/desktop.
- No bloquear scroll.
- No quedar en blanco.
- Cargar la banderola aprobada.

Validar que la web no solo contiene la URL en datos: debe verse en pantalla.

## Paso 7: validar local

Ejecutar build o servidor local segun el repo.

Validaciones minimas:

- Build pasa.
- Ruta local responde 200.
- Logo real visible.
- Telefono y CTA correctos.
- Banderola embebida visible.
- No hay imagenes rotas.
- No hay errores criticos en consola.

## Paso 8: validar contenido

La web debe parecer creada para el cliente:

- Nombre correcto.
- Logo correcto.
- Textos conectados al diagnostico del lead.
- CTA coherente.
- WhatsApp correcto.
- Email correcto.
- Direccion correcta.
- Banderola del mismo cliente.
- Sin texto heredado de la base.

## Paso 9: publicar

Publicar solo si local esta validado.

Registrar:

```text
repo:
branch:
commitSha:
publicUrl:
deployUrl:
validatedAt:
```

## Paso 10: validar publico

Abrir la URL publica final.

La web queda aprobada solo si:

- Carga en Vercel.
- No hay pagina blanca.
- Logo real visible.
- Imagenes principales cargan.
- Banderola aparece embebida.
- CTA funciona.
- No hay rutas rotas.
- No hay errores de build.

## Recovery Playbook

### Web blanca

1. Revisar consola.
2. Revisar build.
3. Confirmar ruta en router/App.
4. Confirmar export/import del componente.
5. Confirmar que no se publico una rama con error.

### Ruta no encontrada

1. Revisar `App.tsx` o router.
2. Revisar rewrites de Vercel.
3. Confirmar slug exacto.
4. Probar ruta base.

### Banderola no aparece

1. Abrir `embedUrl` directamente.
2. Confirmar que la URL no es local.
3. Confirmar que no devuelve herramienta.
4. Revisar altura del iframe.
5. Revisar bloqueos de CSP/frame.
6. Validar que la data llega al componente.

### Logo incorrecto

1. Buscar referencias al logo antiguo.
2. Confirmar ruta publica del logo nuevo.
3. Revisar cache.
4. Confirmar que todos los componentes usan la misma fuente de datos.

### Build falla

1. Leer primer error real.
2. Corregir imports.
3. Corregir tipos implicitos.
4. Eliminar imports no usados si el build lo exige.
5. Repetir build antes de publicar.

## Criterio de aprobado

La web completa esta aprobada cuando:

- La URL publica carga.
- El cliente reconoce su marca.
- La banderola integrada corresponde al mismo cliente.
- Las llamadas a accion funcionan.
- No quedan rastros visibles de la base.
- Vercel esta en verde.
- El CRM puede marcarla como lista para envio.

## Salida obligatoria

```text
leadSlug:
baseUsed:
publicUrl:
bannerPublicUrl:
bannerEmbedUrl:
repo:
branch:
commitSha:
deployStatus:
validationStatus:
knownWarnings:
validatedAt:
```

