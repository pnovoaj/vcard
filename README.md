# VCard NFC privada

Este repositorio contiene únicamente el código no sensible de un Cloudflare Worker. Los enlaces de contacto y los hashes de los tokens se configuran como secretos cifrados en Cloudflare y nunca se guardan en Git.

GitHub Pages no puede validar secretos: todo archivo y JavaScript enviado por Pages es público. Por eso la URL NFC apunta al Worker, que valida el token antes de mostrar la página o redirigir a una descarga.

## Configuración inicial

Requisitos: Node.js 20+, una cuenta de Cloudflare y Wrangler autenticado.

1. Instala dependencias con `npm install`.
2. Genera un token de 32 bytes y su hash sin imprimirlos en un archivo versionado:

   ```sh
   TOKEN=$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')
   printf '%s' "$TOKEN" | shasum -a 256
   ```

3. Guarda el hash hexadecimal resultante en `NFC_TOKEN_HASHES` y los dos enlaces existentes en `CONTACT_WORK_URL` y `CONTACT_PERSONAL_URL`:

   ```sh
   npx wrangler secret put NFC_TOKEN_HASHES
   npx wrangler secret put CONTACT_WORK_URL
   npx wrangler secret put CONTACT_PERSONAL_URL
   ```

4. Despliega con `npm run deploy`. El dominio configurado es `https://contacto.clubalbatros.cl`.
5. Verifica la respuesta y graba en NFC Tools la URL exacta `https://contacto.clubalbatros.cl/c/TOKEN`, reemplazando `TOKEN` por el valor generado localmente.

No pegues el token en un issue, PR, commit, captura o registro de CI. La NTAG215 seguirá siendo reescribible; después de probarla, puede bloquearse contra escritura, sabiendo que ese bloqueo es irreversible.

## Rotación y revocación

`NFC_TOKEN_HASHES` acepta hashes separados por comas. Para rotar sin interrumpir el servicio:

1. Genera un token nuevo y añade su hash al secreto, separado por coma del hash anterior.
2. Graba y prueba la nueva URL en la NTAG215.
3. Reemplaza `NFC_TOKEN_HASHES` dejando únicamente el hash nuevo. El token anterior queda revocado inmediatamente.

La URL contiene un secreto reutilizable, no una prueba criptográfica de una lectura física. Si alguien copia la URL podrá usarla hasta que se rote el token.

## Controles incluidos

- comparación del hash SHA-256 del token en el Worker;
- respuestas uniformes `404` para rutas y tokens inválidos;
- `Cache-Control: no-store` y `X-Robots-Tag: noindex, nofollow, noarchive`;
- política CSP y encabezados defensivos;
- rate limiting de 30 solicitudes por minuto por origen, usando una clave IP hasheada;
- secretos obligatorios durante el despliegue;
- pruebas sin datos personales ni enlaces reales.

## Limpieza del historial público

Los dos commits anteriores contienen enlaces directos y deben considerarse divulgados. Eliminarlos del archivo actual no los borra del historial. Después de aprobar este cambio:

1. Revoca o restringe primero los enlaces compartidos en Google Drive y crea enlaces nuevos.
2. Fusiona este PR.
3. Con una copia de respaldo privada, reescribe todas las ramas y etiquetas para eliminar `contactos_pedro_novoa_completo.html` usando `git filter-repo`, y fuerza la actualización de las referencias remotas.
4. Sigue el procedimiento de GitHub Support para retirar vistas y objetos almacenados en caché; los forks o clones ajenos no pueden recuperarse.

La reescritura cambia los identificadores de todos los commits y no puede hacerse mediante un PR normal. Debe coordinarse como una operación administrativa posterior a la fusión.
