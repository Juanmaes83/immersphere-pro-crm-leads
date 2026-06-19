# Protocolo de Enriquecimiento de Datos para Leads Reales

**Versión:** 0.1  
**Fecha:** 2026-06-20  
**Alcance:** Cualquier lead real procesado por el flujo CRM → Backend → PRs

---

## Regla fundamental

Antes de generar o corregir cualquier Production Package de un lead real, el operador debe ejecutar este protocolo completo. No se acepta Production Package con `url_pendiente_confirmar`, `pendiente de confirmar` ni identificadores técnicos en campos de copy comercial (`painDetected`, `callScript`, `claim`, `proposalSummary`).

---

## Flujo obligatorio

```
CRM lead
  → identificar nombre comercial correcto
  → identificar URL oficial
  → abrir web oficial y confirmar que responde (200)
  → revisar inicio / footer / contacto / cabecera
  → extraer datos publicos confirmados
  → normalizar datos
  → generar/corregir Production Package
  → preflight (canCreatePRs: true requerido)
  → PRs
  → revision humana
  → merge manual
```

---

## 1. Revisar la ficha CRM

| Campo | Descripcion |
|---|---|
| Nombre del lead | Nombre tal como aparece en CRM |
| Nombre comercial | Nombre normalizado de la empresa |
| Slug | Identificador kebab-case unico |
| Sector | Residencial, comercial, turistico, etc. |
| Ciudad/zona | Localizacion confirmada |
| URL web | Confirmar que responde (HTTP 200) |
| Servicio principal | Lo que el operador va a ofrecer |

---

## 2. Revisar la web oficial

### Fuentes prioritarias (en este orden)

1. Pagina de contacto
2. Footer de la pagina principal
3. Aviso legal / Politica de privacidad
4. Pagina de inicio (textos corporativos, tagline)
5. Paginas de servicios

### Datos que deben extraerse

| Dato | Si no aparece |
|---|---|
| Email | `no confirmado` |
| Telefono principal | `no confirmado` |
| Telefonos adicionales | `no confirmado` |
| WhatsApp | `no confirmado` |
| Direccion | `no confirmado` |
| Horario | `no confirmado` |
| Tagline | derivar de servicios |
| Zona geografica | confirmar del CRM |
| Propuesta de valor | derivar del sector |
| Servicios principales | derivar del sector |

---

## 3. Regla anti-placeholder

- Si existe web oficial: NO se permite `url_pendiente_confirmar`.
- NO se permite `pendiente de confirmar` en `painDetected`, `callScript`, `claim` o `proposalSummary`.
- NO se permite usar identificadores tecnicos como copy visible o leido al cliente.
- Si un dato falta, se marca `"no confirmado"` en `internalNotes` — pero NO contamina el copy comercial.

**Incorrecto:**
```json
"painDetected": "url_pendiente_confirmar"
```

**Correcto:**
```json
"painDetected": "Sandhouse Inmobiliaria compite en Torrevieja, uno de los mercados inmobiliarios mas activos de la Costa Blanca. En un entorno donde la diferenciacion visual decide que agencia capta al comprador primero, hay una oportunidad clara de elevar su presentacion digital al nivel del servicio que ya ofrecen."
```

---

## 4. Regla de trazabilidad

Todo dato comercial real debe tener fuente documentada en `internalNotes`:

```json
"internalNotes": [
  "Datos confirmados (fuente: footer/contacto 2026-06-20): email info@example.es | tel +34 600 000 000 | Calle Ejemplo 1, Ciudad."
]
```

---

## 5. Ejemplo completo — Sandhouse Inmobiliaria

| Campo | Valor |
|---|---|
| Nombre en CRM | Sand House Torrevieja |
| Nombre comercial | Sandhouse Inmobiliaria |
| Slug | sandhouse-inmobiliaria |
| Web oficial | https://www.sandhouse.es/ |
| Fuente | footer + pagina de contacto |
| Email | info@sandhouse.es |
| Telefono 1 | +34 655 187 116 |
| Telefono 2 | +34 646 65 97 20 |
| Telefono 3 | +34 623 133 321 |
| WhatsApp | +34 655 187 116 |
| Direccion | C/ Lanzarote 21 bajo, 03183 Torrevieja, Alicante |
| Horario | Lun-Vie 9h-14h y 17h-20h / Sab 9h-14h |
| Tagline | La mejor manera de encontrar tu hogar en Torrevieja y en la costa levantina |
| Zona | Torrevieja, Costa Blanca / Costa Levantina |
| Sector | Inmobiliaria residencial |
