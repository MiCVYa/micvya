
import crypto from "node:crypto";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Método no permitido"
    });
  }

  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;

  if (!secret || !token) {
    return res.status(500).json({
      error: "Falta configurar Mercado Pago"
    });
  }

  const signature = req.headers["x-signature"];
  const requestId = req.headers["x-request-id"];

  if (!signature || !requestId) {
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

  if (!paymentId || !parts.ts || !parts.v1) {
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

  const received = parts.v1;

  if (
    expected.length !== received.length ||
    !crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(received)
    )
  ) {
    return res.status(401).json({
      error: "Firma inválida"
    });
  }

  try {
    const response = await fetch(
      `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (!response.ok) {
      return res.status(502).json({
        error: "No se pudo consultar el pago"
      });
    }

    const payment = await response.json();

    console.log("Notificación verificada:", {
      id: payment.id,
      status: payment.status,
      reference: payment.external_reference
    });

    // Próximo paso: guardar el estado del pago
    // y vincularlo con el CV correspondiente.

    return res.status(200).json({
      received: true
    });
  } catch (error) {
    console.error("Error al verificar pago:", error);
    return res.status(500).json({
      error: "Error procesando notificación"
    });
  }
}
