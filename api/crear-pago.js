
const PRECIO_CV = 5000;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Método no permitido"
    });
  }

  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;

  if (!token) {
    return res.status(500).json({
      error: "Falta configurar Mercado Pago"
    });
  }

  try {
    const respuesta = await fetch(
      "https://api.mercadopago.com/checkout/preferences",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": crypto.randomUUID()
        },
        body: JSON.stringify({
          items: [
            {
              id: "micvya-cv",
              title: "Currículum MiCVYa",
              quantity: 1,
              currency_id: "ARS",
              unit_price: PRECIO_CV
            }
          ],
          external_reference: crypto.randomUUID(),
          back_urls: {
            success: "https://www.micvya.com.ar/",
            failure: "https://www.micvya.com.ar/",
            pending: "https://www.micvya.com.ar/"
          }
        })
      }
    );

    const datos = await respuesta.json();

    if (!respuesta.ok) {
      console.error("Error de Mercado Pago:", datos);
      return res.status(502).json({
        error: "No se pudo crear el pago"
      });
    }

    return res.status(200).json({
      preferenceId: datos.id,
      checkoutUrl: datos.sandbox_init_point
    });
  } catch (error) {
    console.error("Error al crear el pago:", error);
    return res.status(500).json({
      error: "Ocurrió un error al preparar el pago"
    });
  }
}
