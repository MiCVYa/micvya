
import crypto from "node:crypto";

const BUCKET = "fotos-cv";
const MAX_BYTES = 5 * 1024 * 1024;

const FORMATOS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Método no permitido"
    });
  }

  const supabaseUrl = process.env.SUPABASE_URL
    ?.trim()
    .replace(/\/+$/, "");

  const supabaseKey =
    process.env.SUPABASE_SECRET_KEY?.trim();

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({
      error: "Falta configurar Supabase"
    });
  }

  const { tokenDescarga, tipo, tamano } = req.body || {};

  if (
    typeof tokenDescarga !== "string" ||
    !/^[a-f0-9]{64}$/i.test(tokenDescarga)
  ) {
    return res.status(401).json({
      error: "Clave de solicitud inválida"
    });
  }

  if (
    typeof tipo !== "string" ||
    !Object.prototype.hasOwnProperty.call(FORMATOS, tipo)
  ) {
    return res.status(400).json({
      error: "Formato de foto no permitido"
    });
  }

  if (
    !Number.isInteger(tamano) ||
    tamano < 1 ||
    tamano > MAX_BYTES
  ) {
    return res.status(400).json({
      error: "La foto debe pesar como máximo 5 MB"
    });
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
      return res.status(404).json({
        error: "No encontramos el currículum"
      });
    }

    const solicitud = solicitudes[0];

    if (
      solicitud.estado_pago !== "pendiente" ||
      solicitud.diseno !== "modern"
    ) {
      return res.status(403).json({
        error: "No se puede subir una foto a esta solicitud"
      });
    }

    if (solicitud.datos_cv?.foto_path) {
      return res.status(409).json({
        error: "Esta solicitud ya tiene una foto"
      });
    }

    const extension = FORMATOS[tipo];

    const nombreArchivo =
      `${solicitud.id}/${crypto.randomUUID()}.${extension}`;

    const urlFirma = new URL(
      `/storage/v1/object/upload/sign/${BUCKET}/${nombreArchivo}`,
      supabaseUrl
    );

    const firma = await fetch(urlFirma, {
      method: "POST",
      headers: {
        apikey: supabaseKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        upsert: false
      })
    });

    if (!firma.ok) {
      console.error(
        "Error creando autorización de subida",
        firma.status
      );

      return res.status(502).json({
        error: "No se pudo autorizar la foto"
      });
    }

    const datosFirma = await firma.json();

    if (
      typeof datosFirma.token !== "string" ||
      !datosFirma.token
    ) {
      return res.status(502).json({
        error: "Supabase no devolvió la autorización"
      });
    }

    return res.status(200).json({
      ok: true,
      bucket: BUCKET,
      path: nombreArchivo,
      token: datosFirma.token,
      supabaseUrl
    });

  } catch (error) {
    console.error("Error preparando foto", error);

    return res.status(500).json({
      error: "No se pudo preparar la subida"
    });
  }
}
