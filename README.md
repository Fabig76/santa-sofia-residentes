# Formulario de Residentes — Santa Sofía Club Residencial V.I.S

Sistema público para actualización de datos de residentes y propietarios de Santa Sofía Club Residencial V.I.S.

Arquitectura:
- Frontend estático en GitHub Pages.
- Backend Google Apps Script Web App.
- Base principal en Google Sheets.
- Lookup de matrículas desde Google Sheets nativo de Santa Sofía.

## Estado actual (15-Sep-2026)

| Componente | URL | Estado |
|---|---|---|
| Form público residentes | https://fabig76.github.io/santa-sofia-residentes/ | ✅ Activo |
| Panel admin | https://fabig76.github.io/santa-sofia-residentes/admin.html | ✅ Activo |
| Portal vigilantes | https://fabig76.github.io/santa-sofia-residentes/vigilantes.html | ✅ Activo |
| Apps Script Web App | `…/AKfycbzMdiAFqUdBuUDc093SdtgxgSggRFoIn30YqRArXpCSaf4rWIGBILQYLXLgpsLStLvyJQ/dev` | ✅ Activo |

**Deploy v1.8b** (15-Sep-2026, Versión 14): endpoints admin (`adminLookup` con historial + llaves/tags actuales, `actualizarEntrega` con 5 tipos: llaveros_asignar/devolver, tag_asignar/reasignar/devolver) y vigilantes (`vigilantesLookup` con vehículos + motos) funcionales. URL migrada a sufijo `/dev` por deprecación de `/exec` por Google. Ver `docs/SESIONES.md` sección "v1.8 admin con llaveros y tags individuales".

## Datos del proyecto

Fuente oficial: RUT Santa Sofía subido a Drive.
- Archivo RUT oficial: https://drive.google.com/file/d/1cyS7kGSVn2LRUzFuAPIDD78Fk4o7A-PJ/view?usp=drive_link
- ID: `1cyS7kGSVn2LRUzFuAPIDD78Fk4o7A-PJ`

- Razón social: Santa Sofía Club Residencial V.I.S
- NIT: 901142051-3
- Dirección: CR 27 # 44-25, Armenia, Quindío
- Correo administración: santasofia.clubresidencial@gmail.com
- Prefijo formularios: SS-0001, SS-0002, ...

## Sheets

- Sheet principal de respuestas: https://docs.google.com/spreadsheets/d/1xL359rDrhb3_qbhY-tm2MfPXKBqbAehC3zWzsMv1PUo/edit
- Sheet nativo de matrículas lookup: https://docs.google.com/spreadsheets/d/1qEnC5BCRags2r_RHQiB0LjK6Or1rx31Gvopr22-n12w/edit
- Hoja `Entregas` (se crea automáticamente al primer uso desde admin.html)

## Regla para matrículas no disponibles

Si el lookup encuentra una matrícula válida, el formulario la autocompleta.

Si la matrícula está vacía, pendiente, contiene `X`/`XXXX`, es ambigua o no aparece:
- El residente puede seguir llenando el formulario.
- El campo de matrícula queda obligatorio.
- Se muestra aviso de que la administración no la tiene disponible.
- El residente debe escribirla manualmente según escritura, certificado de tradición o documento de propiedad.
- En el Sheet principal se marca `Requiere Revisión Matrículas = Sí`.

## Documentación

- `docs/GUIA-PROYECTO-SANTA-SOFIA.md` — guía completa del proyecto (705 líneas)
- `docs/SESIONES.md` — bitácora cronológica de fixes y eventos relevantes
- `manual-residentes.html` — manual de uso para residentes

## Nota sobre `apps-script/Codigo.gs`

El archivo `apps-script/Codigo.gs` en el repo local tiene cambios sin commitear y contiene el `ADMIN_TOKEN`. NO se commitea al repo público por seguridad. Ver `docs/SESIONES.md` sección "Estado del archivo `apps-script/Codigo.gs` local" para detalle completo.