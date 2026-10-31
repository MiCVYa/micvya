
import crypto from "node:crypto";

const BUCKET = "fotos-cv";
const MAX_BYTES = 5 * 1024 * 1024;

const FORMATOS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

function responder(res, codigo, mensaje) {
  return res.status(codigo).json({ error: mensaje });
}

function comprobarImagen(buffer, tipo) {
  if (tipo === "image/jpeg") {
    return (
      buffer.length >= 4 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    );
  }

  if (tipo === "image/png") {
    return (
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(
        Buffer.from("89504e470d0a1a0a", "hex")
      )
    );
  }

  if (tipo === "image/webp") {
    return (
      buffer.length >= 12 &&
      buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "WEBP"
    );
  }

  return false;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return responder(res, 405, "Método no permitido");
  }

  const supabaseUrl = process.env.SUPABASE_URL
    ?.trim()
    .replace(/\/+$/, "");

  const supabaseKey =
    process.env.SUPABASE_SECRET_KEY?.trim();

  if (!supabaseUrl || !supabaseKey) {
    return responder(
      res,
      500,
      "Falta configurar el servidor"
    );
  }

  const { tokenDescarga, foto, tipo } = req.body || {};

  if (
    typeof tokenDescarga !== "string" ||
    !/^[a-f0-9]{64}$/i.test(tokenDescarga)
  ) {
    return responder(
      res,
      401,
      "Clave de solicitud inválida"
    );
  }

  if (
    typeof tipo !== "string" ||
    !Object.hasOwn(FORMATOS, tipo)
  ) {
    return responder(
      res,
      400,
      "Formato de imagen no permitido"
    );
  }

  if (
    typeof foto !== "string" ||
    foto.length > 7_100_000
  ) {
    return responder(
      res,
      400,
      "La foto es demasiado grande"
    );
  }

  const coincidencia = foto.match(
    /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/
  );

  if (!coincidencia || coincidencia[1] !== tipo) {
    return responder(
      res,
      400,
      "Los datos de la foto son inválidos"
    );
  }

  const buffer = Buffer.from(coincidencia[2], "base64");

  if (
    buffer.length === 0 ||
    buffer.length > MAX_BYTES ||
    !comprobarImagen(buffer, tipo)
  ) {
    return responder(
      res,
      400,
      "La imagen no es válida o supera los 5 MB"
    );
  }

  const hash = crypto
    .createHash("sha256")
    .update(tokenDescarga)
    .digest("hex");

  const headers = {
    apikey: supabaseKey,
    Accept: "application/json"
  };

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
      headers
    });

    if (!consulta.ok) {
      throw new Error("Error consultando la solicitud");
    }

    const solicitudes = await consulta.json();

    if (solicitudes.length !== 1) {
      return responder(
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
      return responder(
        res,
        403,
        "No se puede agregar una foto a esta solicitud"
      );
    }

    const nombreArchivo =
      `${solicitud.id}/foto.${FORMATOS[tipo]}`;

    const rutaStorage = new URL(
      `/storage/v1/object/${BUCKET}/${nombreArchivo}`,
      supabaseUrl
    );

    const subida = await fetch(rutaStorage, {
      method: "POST",
      headers: {
        apikey: supabaseKey,
        "Content-Type": tipo,
        "x-upsert": "false"
      },
      body: buffer
    });

    if (!subida.ok) {
      console.error("Error subiendo foto", subida.status);

      return responder(
        res,
        502,
        "No se pudo guardar la foto"
      );
    }

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
      foto_path: nombreArchivo
    };

    const actualizacion = await fetch(actualizarUrl, {
      method: "PATCH",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify({
        datos_cv: datosActualizados
      })
    });

    if (!actualizacion.ok) {
      console.error(
        "Error asociando foto",
        actualizacion.status
      );

      return responder(
        res,
        502,
        "La foto se guardó, pero no se pudo asociar"
      );
    }

    const filas = await actualizacion.json();

    if (filas.length !== 1) {
      return responder(
        res,
        409,
        "La solicitud cambió de estado"
      );
    }

    return res.status(200).json({
      ok: true,
      mensaje: "Foto guardada correctamente"
    });

  } catch (error) {
    console.error("Error procesando foto", error);

    return responder(
      res,
      500,
      "No se pudo procesar la foto"
    );
  }
}
