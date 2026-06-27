# Production Replication Guides

Estas guias son la fuente oficial para replicar producciones reales desde el CRM sin regenerar desde cero.

## Documentos

1. [Visual Banner Replication Guide](01-visual-banner-replication-guide.md)
2. [Complete Web Replication Guide](02-complete-web-replication-guide.md)
3. [CRM Integration And Production Readiness Guide](03-crm-integration-production-readiness.md)

## Orden correcto de uso

1. Crear y validar la banderola.
2. Crear y validar la web completa.
3. Integrar ambas piezas en el estado de produccion del CRM.
4. Validar URL publica, iframe, assets, mensajes y readiness antes de enviar.

## Regla de oro

No existe "listo" por pieza aislada. Solo existe listo cuando:

```text
audit + banner + web + integration + crm + send
```

