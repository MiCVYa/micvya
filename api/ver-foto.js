
import crypto from "node:crypto";

const BUCKET = "fotos-cv";

const FORMATOS = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp"
};

function responder(res, codigo, mensaje) {
  return res.status(codigo).json({
    ok: false,
    error: mensaje
  });
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
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

    consultaUrl.searchParams.set("limit", "2");

    const consulta = await fetch(consultaUrl, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Accept: "application/json"
      },
      cache: "no-store"
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
      return responder(
        res,
        403,
        "El pago todavía no está aprobado"
      );
    }

    if (solicitud.diseno !== "modern") {
      return responder(
        res,
        404,
        "Este diseño no utiliza foto"
      );
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

    const tipo = FORMATOS[
      coincidencia[1].toLowerCase()
    ];

    const rutaArchivo = path
      .split("/")
      .map(encodeURIComponent)
      .join("/");

    const firmaUrl = new URL(
      `/storage/v1/object/sign/${BUCKET}/${rutaArchivo}`,
      supabaseUrl
    );

    const firma = await fetch(firmaUrl, {
      method: "POST",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        expiresIn: 300
      }),
      cache: "no-store"
    });

    if (!firma.ok) {
      throw new Error(
        "No se pudo generar el enlace temporal de la foto"
      );
    }

    const resultado = await firma.json();

    const enlace =
      resultado.signedURL ||
      resultado.signedUrl;

    if (typeof enlace !== "string" || !enlace) {
      throw new Error(
        "Supabase no devolvió el enlace temporal"
      );
    }

    // Supabase puede devolver:
    // /object/sign/...
    // o /storage/v1/object/sign/...
    // Normalizamos ambos formatos.

    const origenSupabase = new URL(supabaseUrl);

    const enlaceRecibido = new URL(
      enlace,
      supabaseUrl
    );

    if (enlaceRecibido.origin !== origenSupabase.origin) {
      throw new Error(
        "El enlace pertenece a un servidor desconocido"
      );
    }

    let pathname = enlaceRecibido.pathname;

    if (pathname.startsWith("/object/sign/")) {
      pathname = "/storage/v1" + pathname;
    }

    const rutaEsperada =
      `/storage/v1/object/sign/${BUCKET}/${rutaArchivo}`;

    if (pathname !== rutaEsperada) {
      throw new Error(
        "La ruta del enlace temporal no es válida"
      );
    }

    if (!enlaceRecibido.searchParams.has("token")) {
      throw new Error(
        "El enlace temporal no contiene autorización"
      );
    }

    const fotoUrl = new URL(
      pathname,
      supabaseUrl
    );

    fotoUrl.search = enlaceRecibido.search;

    return res.status(200).json({
      ok: true,
      fotoUrl: fotoUrl.href,
      tipo,
      venceEnSegundos: 300
    });

  } catch (error) {
    console.error(
      "Error al consultar la foto:",
      error
    );

    return responder(
      res,
      500,
      "No se pudo obtener la foto"
    );
  }
}
