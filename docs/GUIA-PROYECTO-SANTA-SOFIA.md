# GUÍA DEL PROYECTO — Santa Sofía Residentes

## 1. Objetivo

Implementar para Santa Sofía Club Residencial V.I.S el mismo patrón funcional usado en Cerro Azul: página pública con formulario de residentes, backend Apps Script y base de datos en Google Sheets.

## 2. Datos oficiales usados

Fuente: RUT oficial Santa Sofía subido a Drive por el usuario.

- Archivo RUT oficial: https://drive.google.com/file/d/1cyS7kGSVn2LRUzFuAPIDD78Fk4o7A-PJ/view?usp=drive_link
- ID: 1cyS7kGSVn2LRUzFuAPIDD78Fk4o7A-PJ

- Razón social: Santa Sofía Club Residencial V.I.S
- NIT: 901142051-3
- Dirección: CR 27 # 44-25, Armenia, Quindío
- Correo: santasofia.clubresidencial@gmail.com
- Prefijo de formulario: SS-0001

## 3. Carpeta Drive del proyecto

https://drive.google.com/drive/folders/1GHR3HITyjPlIFbGrEYZWVAuMewdSzxF7

## 4. Sheets

- Sheet principal de respuestas:
  https://docs.google.com/spreadsheets/d/1xL359rDrhb3_qbhY-tm2MfPXKBqbAehC3zWzsMv1PUo/edit

- Sheet nativo de matrículas para lookup:
  https://docs.google.com/spreadsheets/d/1qEnC5BCRags2r_RHQiB0LjK6Or1rx31Gvopr22-n12w/edit

- Excel original que debe quedar / base:
  https://docs.google.com/spreadsheets/d/10bnCXdR4mVU6W5oLeUM0v4FMUOiyI0jD/edit

- Complemento usado para completar matrículas:
  https://docs.google.com/spreadsheets/d/1-hCyqJZ5gDFMMsYnAuRdyL6yW1cXUFWo/edit

## 5. Resultado cruce de matrículas

- Total unidades: 462
- Matrículas inicialmente buenas: 318
- Pendientes/XXXX originales: 144
- Completadas con certeza: 27
- Ambiguas: 1
- Pendientes: 116

La única ambigua detectada:
- Moto 60: opciones 280-226117 o 280-226125

## 6. Regla funcional para matrículas no disponibles

Si la administración tiene matrícula válida:
- El formulario la autocompleta.
- El residente puede editarla si no coincide.

Si la administración no tiene matrícula, aparece con XXXX, está vacía, es ambigua o no se encuentra:
- El formulario NO impide seguir llenando.
- El campo queda obligatorio.
- Se muestra aviso amarillo:
  "La administración no tiene disponible la matrícula inmobiliaria de esta unidad. Por favor escríbala manualmente según su escritura, certificado de tradición o documento de propiedad."
- Si intenta enviar sin escribirla, se bloquea el envío.
- En la respuesta se marca `Requiere Revisión Matrículas = Sí`.

## 7. Archivos del proyecto

- `index.html`: formulario público.
- `assets/styles.css`: estilos.
- `assets/logo.png`: logo Santa Sofía.
- `js/app.js`: lógica frontend, validaciones y lookup.
- `apps-script/Codigo.gs`: backend Apps Script.
- `data/matriculas_santa_sofia_COMPLETADO_PROPUESTA.xlsx`: Excel corregido.
- `data/reporte_completado_matriculas_santa_sofia.csv`: reporte de cruce.

## 8. Despliegue pendiente

### Paso A — GitHub Pages

Crear repo público sugerido:

https://github.com/Fabig76/santa-sofia-residentes

URL esperada:

https://fabig76.github.io/santa-sofia-residentes/

No hacer `git push` sin OK explícito de Fabio.

### Paso B — Apps Script manual

Desde la cuenta `santasofia.clubresidencial@gmail.com`:

1. Abrir https://script.google.com/home
2. Crear proyecto nuevo: `Santa Sofía - Formulario Residentes Backend`
3. Pegar el contenido completo de `apps-script/Codigo.gs`
4. Guardar.
5. Ejecutar una vez `getNextFormId` para autorizar permisos.
6. Implementar → Nueva implementación → Aplicación web.
7. Ejecutar como: Yo.
8. Quién tiene acceso: Cualquier persona.
9. Copiar la URL `/exec`.
10. Enviar la URL para ponerla en `js/app.js`.

## 9. Pruebas esperadas después del deploy

Reemplazar `<URL_EXEC>` por la URL real del Web App:

1. `<URL_EXEC>?action=nextId`
   Esperado: `{ok:true,nextId:"SS-0001"}`

2. `<URL_EXEC>?action=lookupMatApto&apto=311`
   Esperado: matrícula válida de apartamento.

3. `<URL_EXEC>?action=lookupMatApto&apto=111`
   Esperado: `requiereManual:true` porque está pendiente/XXXX.

4. `<URL_EXEC>?action=lookupMatParq&celda=Moto%2034`
   Esperado: matrícula `280-226102`.

5. `<URL_EXEC>?action=lookupMatParq&celda=Moto%2060`
   Esperado: `requiereManual:true` por ambigua/pendiente.

6. Enviar formulario de prueba desde la página.

7. Probar modo edición con el SS-XXXX creado.

## 10. Estado actual

Proyecto local preparado y probado sintácticamente. Falta:
- publicar repo GitHub Pages con OK explícito;
- desplegar Apps Script manualmente desde cuenta Santa Sofía;
- insertar URL `/exec` en `js/app.js`;
- prueba end-to-end real desde navegador.
