
import crypto from "node:crypto";

const BUCKET = "fotos-cv";

const FORMATOS = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp"
};

const MAX_BYTES = 5 * 1024 * 1024;

function responder(res, codigo, mensaje) {
  return res.status(codigo).json({
    error: mensaje
  });
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "POST") {
    return responder(res, 405, "Método no permitido");
  }

  const supabaseUrl = process.env.SUPABASE_URL
    ?.trim()
    .replace(/\/+$/, "");

  const supabaseKey =
    process.env.SUPABASE_SECRET_KEY?.trim();

  if (!supabaseUrl || !supabaseKey) {
    return responder(res, 500, "Falta configurar Supabase");
  }

  const { tokenDescarga } = req.body || {};

  if (
    typeof tokenDescarga !== "string" ||
    !/^[a-f0-9]{64}$/i.test(tokenDescarga)
  ) {
    return responder(res, 401, "Clave de descarga inválida");
  }

  const hash = crypto
    .createHash("sha256")
    .update(tokenDescarga)
    .digest("hex");

  try {
    const consultaUrl = new URL(
      "/rest/v1/solicitudes_cv",
      supabaseUrl
    );

    consultaUrl.searchParams.set(
      "token_descarga_hash",
      `eq.${hash}`
    );

    consultaUrl.searchParams.set(
      "select",
      "id,estado_pago,diseno,datos_cv"
    );

    const consulta = await fetch(consultaUrl, {
      headers: {
        apikey: supabaseKey,
        Accept: "application/json"
      }
    });

    if (!consulta.ok) {
      throw new Error("No se pudo consultar la solicitud");
    }

    const solicitudes = await consulta.json();

    if (solicitudes.length !== 1) {
      return responder(res, 404, "No encontramos el CV");
    }

    const solicitud = solicitudes[0];

    if (solicitud.estado_pago !== "aprobado") {
      return responder(res, 403, "El pago todavía no está aprobado");
    }

    if (solicitud.diseno !== "modern") {
      return responder(res, 404, "Este diseño no utiliza foto");
    }

    const path = solicitud.datos_cv?.foto_path;

    if (typeof path !== "string") {
      return responder(res, 404, "Este CV no tiene foto");
    }

    const patron = new RegExp(
      "^" +
      solicitud.id +
      "/[0-9a-f-]{36}\\.(jpg|png|webp)$",
      "i"
    );

    const coincidencia = path.match(patron);

    if (!coincidencia) {
      return responder(res, 400, "Ruta de foto inválida");
    }

    const tipo = FORMATOS[coincidencia[1].toLowerCase()];

    const rutaArchivo = path
      .split("/")
      .map(encodeURIComponent)
      .join("/");

    const fotoUrl = new URL(
      `/storage/v1/object/authenticated/${BUCKET}/${rutaArchivo}`,
      supabaseUrl
    );

    const foto = await fetch(fotoUrl, {
      headers: {
        apikey: supabaseKey
      }
    });

    if (!foto.ok) {
      return responder(res, 404, "No encontramos la foto");
    }

    const contenido = Buffer.from(
      await foto.arrayBuffer()
    );

    if (
      contenido.length === 0 ||
      contenido.length > MAX_BYTES
    ) {
      return responder(res, 400, "La foto no es válida");
    }

    const tipoReal = foto.headers
      .get("content-type")
      ?.split(";")[0]
      .trim()
      .toLowerCase();

    if (tipoReal !== tipo) {
      return responder(res, 400, "Formato de foto inválido");
    }

    // Devolvemos la imagen como base64 para que
    // el navegador pueda mostrarla en el CV.
    return res.status(200).json({
      ok: true,
      foto: `data:${tipo};base64,${contenido.toString("base64")}`
    });

  } catch (error) {
    console.error("Error al consultar la foto:", error);

    return responder(res, 500, "No se pudo obtener la foto");
  }
}
