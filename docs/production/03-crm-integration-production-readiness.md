# CRM Integration And Production Readiness Guide

## Objetivo

Crear la capa que une banderola, web completa, CRM y envio comercial. Esta guia define cuando un lead esta realmente listo para enviar, evitando que una pieza aislada parezca terminada cuando la integracion completa aun no esta validada.

## Problema que resuelve

Las guias de banderola y web pueden estar bien por separado, pero el sistema falla si no existe un estado compartido que confirme:

- Banderola final validada.
- Web completa validada.
- Banderola embebida dentro de la web.
- URLs publicas correctas.
- CRM actualizado.
- Envio preparado.

Sin esta capa, aparecen errores como:

- URL final apunta a herramienta.
- Web carga pero iframe esta vacio.
- Banderola usa logo incorrecto.
- CRM muestra "generado" aunque Vercel falla.
- Se intenta enviar una pieza no validada.

## Estados operativos

### 1. `draft`

Lead detectado, sin produccion iniciada.

### 2. `audit_ready`

Auditoria disponible y datos principales confirmados.

Requisitos:

- Nombre.
- Web.
- Telefono o WhatsApp.
- Email si existe.
- Direccion/zona.
- Senales web.

### 3. `banner_base_selected`

Base de banderola elegida.

Requisitos:

- URL base validada.
- Justificacion de uso.
- Slug destino definido.

### 4. `banner_local_validated`

Banderola adaptada y validada localmente.

Requisitos:

- Canvas/render visible.
- Logo real.
- QR visible.
- Footer correcto.
- Sin herramienta.

### 5. `banner_public_validated`

Banderola publicada y validada en URL publica.

Requisitos:

- Public URL 200.
- Embed URL 200.
- Resultado limpio.
- Commit SHA registrado.

### 6. `web_base_selected`

Base de web completa elegida.

Requisitos:

- Ruta base validada.
- Componentes localizados.
- Data file localizado.

### 7. `web_local_validated`

Web adaptada y validada localmente.

Requisitos:

- Build OK.
- Ruta local OK.
- Logo real.
- Assets OK.
- CTA correcto.

### 8. `banner_embedded_in_web`

Banderola integrada dentro de la web.

Requisitos:

- `bannerEmbedUrl` insertada en datos de web.
- Iframe visible.
- Iframe carga resultado final.
- No muestra herramienta.

### 9. `web_public_validated`

Web publicada y validada en URL publica.

Requisitos:

- Vercel OK.
- URL publica carga.
- Banderola embebida visible.
- No hay imagenes rotas.
- No hay restos de otro cliente.

### 10. `crm_ready_for_send`

CRM contiene las URLs finales y mensajes preparados.

Requisitos:

- Banderola URL final.
- Web completa URL final.
- WhatsApp/email con links correctos.
- Estado de lead actualizado.
- Warnings revisados.

### 11. `sent_or_ready_for_manual_send`

Listo para accion comercial manual.

Requisitos:

- Operador humano revisa.
- Envio automatico bloqueado salvo autorizacion explicita.
- Se registra historial de accion.

## Gates obligatorios

### Gate A: Banderola

No pasa si:

- Canvas vacio.
- Logo roto.
- QR roto.
- Footer solapado.
- Ruta muestra herramienta.
- URL publica falla.

### Gate B: Web

No pasa si:

- Build falla.
- Ruta publica falla.
- Logo incorrecto.
- Assets rotos.
- CTA incorrecto.
- Textos genericos.

### Gate C: Integracion

No pasa si:

- La web no embebe la banderola.
- La banderola embebida es de otro cliente.
- El iframe esta en blanco.
- La URL de iframe es local.
- La URL de iframe apunta a herramienta.

### Gate D: CRM/envio

No pasa si:

- CRM no tiene URLs finales.
- Mensajes copian URLs antiguas.
- Estado dice generado pero Vercel fallo.
- No existe validacion publica.

## Registro minimo por lead

```json
{
  "leadSlug": "",
  "audit": {
    "status": "",
    "validatedAt": ""
  },
  "banner": {
    "baseUsed": "",
    "publicUrl": "",
    "embedUrl": "",
    "repo": "",
    "branch": "",
    "commitSha": "",
    "status": "",
    "validatedAt": "",
    "warnings": []
  },
  "web": {
    "baseUsed": "",
    "publicUrl": "",
    "repo": "",
    "branch": "",
    "commitSha": "",
    "status": "",
    "validatedAt": "",
    "warnings": []
  },
  "integration": {
    "bannerEmbedded": false,
    "iframeVisible": false,
    "publicValidation": "",
    "status": ""
  },
  "send": {
    "status": "",
    "whatsappReady": false,
    "emailReady": false,
    "reviewedByHuman": false
  }
}
```

## Flujo completo

1. Auditar lead.
2. Confirmar datos reales.
3. Seleccionar base de banderola.
4. Adaptar banderola.
5. Validar banderola local.
6. Publicar banderola.
7. Validar banderola publica.
8. Seleccionar base de web completa.
9. Adaptar web completa.
10. Insertar `bannerEmbedUrl`.
11. Validar web local.
12. Publicar web.
13. Validar web publica.
14. Actualizar CRM con URLs finales.
15. Generar mensajes.
16. Revision humana.
17. Marcar listo para envio.

## Bucles de recuperacion

### Si falla banderola

Volver a la guia 01 y reparar el gate concreto. No tocar la web hasta que la banderola este aprobada.

### Si falla web

Volver a la guia 02. No actualizar CRM como listo.

### Si falla iframe

1. Probar `bannerEmbedUrl` directa.
2. Confirmar que es publica.
3. Confirmar que es limpia.
4. Revisar componente de iframe.
5. Validar local.
6. Validar publico.

### Si falla Vercel

1. Leer logs.
2. Corregir build.
3. Rehacer deploy.
4. No hacer merge ni enviar hasta que este verde.

### Si CRM muestra estado incorrecto

1. Comparar estado local vs backend/produccion.
2. Recargar desde backend si backend es mas reciente.
3. Guardar local en backend solo si local es la version correcta.
4. Registrar timestamp.

## Checklist final antes de enviar

- Banderola publica abre.
- Web publica abre.
- Web contiene banderola correcta.
- Logo real visible en ambas piezas.
- Telefono correcto.
- WhatsApp correcto.
- Email correcto.
- Direccion correcta.
- CTA correcto.
- QR correcto.
- Vercel verde.
- CRM actualizado.
- Mensaje de WhatsApp revisado.
- Email revisado.
- Operador humano aprueba.

## Regla de oro

No existe "listo" por pieza aislada. Solo existe listo cuando el sistema completo esta validado:

```text
audit + banner + web + integration + crm + send
```

