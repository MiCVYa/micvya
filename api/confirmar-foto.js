
import crypto from "node:crypto";

const BUCKET = "fotos-cv";

const FORMATOS = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp"
};

const MAX_BYTES = 5 * 1024 * 1024;

function error(res, codigo, mensaje) {
  return res.status(codigo).json({
    error: mensaje
  });
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return error(res, 405, "Método no permitido");
  }

  const supabaseUrl = process.env.SUPABASE_URL
    ?.trim()
    .replace(/\/+$/, "");

  const supabaseKey =
    process.env.SUPABASE_SECRET_KEY?.trim();

  if (!supabaseUrl || !supabaseKey) {
    return error(
      res,
      500,
      "Falta configurar Supabase"
    );
  }

  const { tokenDescarga, path } = req.body || {};

  if (
    typeof tokenDescarga !== "string" ||
    !/^[a-f0-9]{64}$/i.test(tokenDescarga)
  ) {
    return error(
      res,
      401,
      "Clave de solicitud inválida"
    );
  }

  if (
    typeof path !== "string" ||
    path.length > 150
  ) {
    return error(
      res,
      400,
      "Ruta de foto inválida"
    );
  }

  const hash = crypto
    .createHash("sha256")
    .update(tokenDescarga)
    .digest("hex");

  try {
    // Buscar la solicitud mediante su clave privada.
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
      throw new Error("Error consultando la solicitud");
    }

    const solicitudes = await consulta.json();

    if (solicitudes.length !== 1) {
      return error(
        res,
        404,
        "No encontramos la solicitud"
      );
    }

    const solicitud = solicitudes[0];

    if (
      solicitud.estado_pago !== "pendiente" ||
      solicitud.diseno !== "modern"
    ) {
      return error(
        res,
        403,
        "No se puede asociar una foto a esta solicitud"
      );
    }

    if (solicitud.datos_cv?.foto_path) {
      return error(
        res,
        409,
        "Esta solicitud ya tiene una foto asociada"
      );
    }

    // Solo aceptar fotos dentro de la carpeta
    // correspondiente a esta solicitud.
    const patron = new RegExp(
      "^" +
      solicitud.id +
      "/[0-9a-f-]{36}\\.(jpg|png|webp)$",
      "i"
    );

    const coincidencia = path.match(patron);

    if (!coincidencia) {
      return error(
        res,
        400,
        "La foto no pertenece a esta solicitud"
      );
    }

    const extension = coincidencia[1].toLowerCase();
    const tipoEsperado = FORMATOS[extension];

    // Verificar que la foto exista en Storage.
    const rutaArchivo = path
      .split("/")
      .map(encodeURIComponent)
      .join("/");

    const descargaUrl = new URL(
      `/storage/v1/object/authenticated/${BUCKET}/${rutaArchivo}`,
      supabaseUrl
    );

    const descarga = await fetch(descargaUrl, {
      headers: {
        apikey: supabaseKey
      }
    });

    if (!descarga.ok) {
      return error(
        res,
        404,
        "La foto todavía no está disponible"
      );
    }

    const tipoReal = descarga.headers
      .get("content-type")
      ?.split(";")[0]
      .trim()
      .toLowerCase();

    const contenido = Buffer.from(
      await descarga.arrayBuffer()
    );

    if (
      contenido.length === 0 ||
      contenido.length > MAX_BYTES ||
      tipoReal !== tipoEsperado
    ) {
      return error(
        res,
        400,
        "La foto no cumple los requisitos"
      );
    }

    // Asociar la foto al currículum.
    const actualizarUrl = new URL(
      "/rest/v1/solicitudes_cv",
      supabaseUrl
    );

    actualizarUrl.searchParams.set(
      "id",
      `eq.${solicitud.id}`
    );

    actualizarUrl.searchParams.set(
      "estado_pago",
      "eq.pendiente"
    );

    const datosActualizados = {
      ...solicitud.datos_cv,
      foto_path: path
    };

    const actualizacion = await fetch(actualizarUrl, {
      method: "PATCH",
      headers: {
        apikey: supabaseKey,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify({
        datos_cv: datosActualizados
      })
    });

    if (!actualizacion.ok) {
      throw new Error("Error asociando la foto");
    }

    const filas = await actualizacion.json();

    if (filas.length !== 1) {
      return error(
        res,
        409,
        "La solicitud cambió de estado"
      );
    }

    return res.status(200).json({
      ok: true,
      mensaje: "Foto asociada correctamente"
    });

  } catch (err) {
    console.error(
      "Error confirmando foto:",
      err
    );

    return error(
      res,
      500,
      "No se pudo confirmar la foto"
    );
  }
}
