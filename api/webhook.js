
import crypto from "node:crypto";

const PRECIO_CV = 5000;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Método no permitido"
    });
  }

  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  const supabaseUrl = process.env.SUPABASE_URL
    ?.trim()
    .replace(/\/+$/, "");
  const supabaseKey = process.env.SUPABASE_SECRET_KEY?.trim();

  if (!secret || !token || !supabaseUrl || !supabaseKey) {
    return res.status(500).json({
      error: "Falta configurar el servidor"
    });
  }

  const signature = req.headers["x-signature"];
  const requestId = req.headers["x-request-id"];

  if (
    typeof signature !== "string" ||
    typeof requestId !== "string"
  ) {
    return res.status(401).json({
      error: "Notificación sin firma"
    });
  }

  const parts = Object.fromEntries(
    signature.split(",").map(part => {
      const [key, value] = part.trim().split("=");
      return [key, value];
    })
  );

  const paymentId = String(req.query["data.id"] || "");

  if (
    !/^\d+$/.test(paymentId) ||
    !/^\d+$/.test(parts.ts || "") ||
    !/^[a-f0-9]{64}$/i.test(parts.v1 || "")
  ) {
    return res.status(401).json({
      error: "Firma incompleta"
    });
  }

  const manifest =
    `id:${paymentId.toLowerCase()};request-id:${requestId};ts:${parts.ts};`;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(manifest)
    .digest("hex");

  const received = parts.v1.toLowerCase();

  if (
    !crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(received, "hex")
    )
  ) {
    return res.status(401).json({
      error: "Firma inválida"
    });
  }

  try {
    // Consultar el pago directamente a Mercado Pago.
    const response = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (!response.ok) {
      console.error("Error consultando Mercado Pago", response.status);

      return res.status(502).json({
        error: "No se pudo consultar el pago"
      });
    }

    const payment = await response.json();

    // No confiar únicamente en la notificación.
    if (
      String(payment.id) !== paymentId ||
      payment.status !== "approved" ||
      payment.currency_id !== "ARS" ||
      Number(payment.transaction_amount) !== PRECIO_CV ||
      Number(payment.transaction_details?.total_paid_amount) < PRECIO_CV
    ) {
      return res.status(200).json({
        received: true,
        updated: false
      });
    }

    const referencia = payment.external_reference;

    if (
      typeof referencia !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(referencia)
    ) {
      return res.status(200).json({
        received: true,
        updated: false
      });
    }

    // Buscar la solicitud vinculada al pago.
    const consultaUrl = new URL(
      "/rest/v1/solicitudes_cv",
      supabaseUrl
    );

    consultaUrl.searchParams.set(
      "referencia_pago",
      `eq.${referencia}`
    );

    consultaUrl.searchParams.set(
      "select",
      "id,estado_pago,mercado_pago_id"
    );

    const consulta = await fetch(consultaUrl, {
      headers: {
        apikey: supabaseKey,
        Accept: "application/json"
      }
    });

    if (!consulta.ok) {
      console.error("Error consultando Supabase", consulta.status);

      return res.status(502).json({
        error: "No se pudo consultar la solicitud"
      });
    }

    const solicitudes = await consulta.json();

    if (solicitudes.length !== 1) {
      console.error("No se encontró la referencia de pago");

      return res.status(200).json({
        received: true,
        updated: false
      });
    }

    const solicitud = solicitudes[0];

    // Evitar asociar un pago distinto a una solicitud ya pagada.
    if (solicitud.estado_pago === "aprobado") {
      return res.status(200).json({
        received: true,
        updated: false
      });
    }

    if (
      solicitud.mercado_pago_id &&
      solicitud.mercado_pago_id !== paymentId
    ) {
      return res.status(409).json({
        error: "La solicitud tiene otro pago asociado"
      });
    }

    // Marcar el CV como pagado.
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

    const actualizacion = await fetch(actualizarUrl, {
      method: "PATCH",
      headers: {
        apikey: supabaseKey,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify({
        estado_pago: "aprobado",
        mercado_pago_id: paymentId,
        pagado_en: new Date().toISOString()
      })
    });

    if (!actualizacion.ok) {
      console.error(
        "Error actualizando Supabase",
        actualizacion.status
      );

      return res.status(502).json({
        error: "No se pudo actualizar el pago"
      });
    }

    const filas = await actualizacion.json();

    return res.status(200).json({
      received: true,
      updated: filas.length === 1
    });

  } catch (error) {
    console.error("Error procesando el webhook", error);

    return res.status(500).json({
      error: "Error procesando la notificación"
    });
  }
}
