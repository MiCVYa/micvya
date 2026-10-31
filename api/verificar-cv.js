
import crypto from "node:crypto";

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

  const supabaseKey = process.env.SUPABASE_SECRET_KEY?.trim();

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({
      error: "Falta configurar el servidor"
    });
  }

  const tokenDescarga = req.body?.tokenDescarga;

  if (
    typeof tokenDescarga !== "string" ||
    !/^[a-f0-9]{64}$/.test(tokenDescarga)
  ) {
    return res.status(400).json({
      error: "Clave de descarga inválida"
    });
  }

  const tokenHash = crypto
    .createHash("sha256")
    .update(tokenDescarga)
    .digest("hex");

  try {
    const url = new URL(
      "/rest/v1/solicitudes_cv",
      supabaseUrl
    );

    url.searchParams.set(
      "token_descarga_hash",
      `eq.${tokenHash}`
    );

    url.searchParams.set(
      "select",
      "estado_pago,datos_cv,diseno"
    );

    url.searchParams.set("limit", "1");

    const response = await fetch(url.toString(), {
      headers: {
        apikey: supabaseKey,
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      console.error(
        "Error consultando Supabase:",
        response.status
      );

      return res.status(502).json({
        error: "No se pudo consultar el currículum"
      });
    }

    const solicitudes = await response.json();

    if (solicitudes.length !== 1) {
      return res.status(404).json({
        error: "No se encontró el currículum"
      });
    }

    const solicitud = solicitudes[0];

    if (solicitud.estado_pago !== "aprobado") {
      return res.status(200).json({
        aprobado: false
      });
    }

    return res.status(200).json({
      aprobado: true,
      datos_cv: solicitud.datos_cv,
      diseno: solicitud.diseno
    });

  } catch (error) {
    console.error(
      "Error verificando currículum:",
      error
    );

    return res.status(500).json({
      error: "No se pudo verificar el pago"
    });
  }
}
