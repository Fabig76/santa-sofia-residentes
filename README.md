# Formulario de Residentes — Santa Sofía Club Residencial V.I.S

Sistema público para actualización de datos de residentes y propietarios de Santa Sofía Club Residencial V.I.S.

Arquitectura:
- Frontend estático en GitHub Pages.
- Backend Google Apps Script Web App.
- Base principal en Google Sheets.
- Lookup de matrículas desde Google Sheets nativo de Santa Sofía.

## Datos del proyecto

Fuente oficial: RUT Santa Sofía subido a Drive.
- Archivo RUT oficial: https://drive.google.com/file/d/1cyS7kGSVn2LRUzFuAPIDD78Fk4o7A-PJ/view?usp=drive_link
- ID: 1cyS7kGSVn2LRUzFuAPIDD78Fk4o7A-PJ

- Razón social: Santa Sofía Club Residencial V.I.S
- NIT: 901142051-3
- Dirección: CR 27 # 44-25, Armenia, Quindío
- Correo administración: santasofia.clubresidencial@gmail.com
- Prefijo formularios: SS-0001, SS-0002, ...

## Sheets

- Sheet principal de respuestas: https://docs.google.com/spreadsheets/d/1xL359rDrhb3_qbhY-tm2MfPXKBqbAehC3zWzsMv1PUo/edit
- Sheet nativo de matrículas lookup: https://docs.google.com/spreadsheets/d/1qEnC5BCRags2r_RHQiB0LjK6Or1rx31Gvopr22-n12w/edit

## Regla para matrículas no disponibles

Si el lookup encuentra una matrícula válida, el formulario la autocompleta.

Si la matrícula está vacía, pendiente, contiene `X`/`XXXX`, es ambigua o no aparece:
- El residente puede seguir llenando el formulario.
- El campo de matrícula queda obligatorio.
- Se muestra aviso de que la administración no la tiene disponible.
- El residente debe escribirla manualmente según escritura, certificado de tradición o documento de propiedad.
- En el Sheet principal se marca `Requiere Revisión Matrículas = Sí`.

## Pendiente para producción

1. Desplegar `apps-script/Codigo.gs` manualmente desde la cuenta `santasofia.clubresidencial@gmail.com`.
2. Configurar Web App:
   - Ejecutar como: Yo
   - Quién tiene acceso: Cualquier persona
3. Copiar la URL `/exec` generada.
4. Pegar esa URL en `js/app.js`, constante `APPS_SCRIPT_URL`.
5. Publicar el repo como GitHub Pages.

Mientras `APPS_SCRIPT_URL` esté vacío, la página mostrará que el formulario no está conectado al servidor.
