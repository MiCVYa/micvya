
import crypto from "node:crypto";

const PRECIO_CV = 5000;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Método no permitido"
    });
  }

  const token = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();

  const supabaseUrl = process.env.SUPABASE_URL
    ?.trim()
    .replace(/\/+$/, "");

  const supabaseKey = process.env.SUPABASE_SECRET_KEY?.trim();

  const notificationUrl =
    process.env.MERCADOPAGO_NOTIFICATION_URL?.trim();

  if (!token || !supabaseUrl || !supabaseKey || !notificationUrl) {
    return res.status(500).json({
      error: "Falta configurar Mercado Pago o Supabase"
    });
  }

  let urlNotificacion;

  try {
    urlNotificacion = new URL(notificationUrl);

    if (
      urlNotificacion.protocol !== "https:" ||
      urlNotificacion.pathname !== "/api/webhook" ||
      !urlNotificacion.hostname.endsWith(".vercel.app")
    ) {
      throw new Error("URL de notificación inválida");
    }
  } catch {
    return res.status(500).json({
      error: "La dirección del Webhook no es válida"
    });
  }

  const { datos_cv, diseno } = req.body || {};

  if (
    !datos_cv ||
    typeof datos_cv !== "object" ||
    Array.isArray(datos_cv) ||
    !["modern", "ats"].includes(diseno)
  ) {
    return res.status(400).json({
      error: "Faltan los datos del currículum"
    });
  }

  const campos = [
    "nombre",
    "telefono",
    "email",
    "ciudad",
    "perfil",
    "experiencia",
    "educacion",
    "cursos",
    "habilidades",
    "idiomas"
  ];

  for (const campo of campos) {
    if (
      datos_cv[campo] !== undefined &&
      (
        typeof datos_cv[campo] !== "string" ||
        datos_cv[campo].length > 10000
      )
    ) {
      return res.status(400).json({
        error: "Hay un dato del currículum inválido"
      });
    }
  }

  if (
    !datos_cv.nombre?.trim() ||
    !datos_cv.telefono?.trim()
  ) {
    return res.status(400).json({
      error: "Completá tu nombre y teléfono"
    });
  }

  const referencia = crypto.randomUUID();

  try {
    // 1. Guardar el currículum en Supabase.
    const rutaSupabase = new URL(
      "/rest/v1/solicitudes_cv",
      supabaseUrl
    );

    const respuestaGuardado = await fetch(
      rutaSupabase.toString(),
      {
        method: "POST",
        headers: {
          apikey: supabaseKey,
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        },
        body: JSON.stringify({
          datos_cv,
          diseno,
          estado_pago: "pendiente",
          referencia_pago: referencia
        })
      }
    );

    if (!respuestaGuardado.ok) {
      console.error(
        "Error Supabase:",
        respuestaGuardado.status
      );

      return res.status(502).json({
        error: "No se pudo guardar el currículum"
      });
    }

    // 2. Preparar la dirección de regreso.
    const dominio = process.env.VERCEL_URL;

    if (!dominio) {
      return res.status(500).json({
        error: "Falta configurar la dirección de MiCVYa"
      });
    }

    const regreso = `https://${dominio}/`;

    // 3. Crear el pago en Mercado Pago.
    const respuestaPago = await fetch(
      "https://api.mercadopago.com/checkout/preferences",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": referencia
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
          external_reference: referencia,

          // Dirección a la que Mercado Pago
          // enviará las notificaciones.
          notification_url: notificationUrl,

          back_urls: {
            success: regreso,
            failure: regreso,
            pending: regreso
          }
        })
      }
    );

    const datosPago = await respuestaPago.json();

    if (!respuestaPago.ok) {
      console.error(
        "Error Mercado Pago:",
        respuestaPago.status
      );

      return res.status(502).json({
        error: "Se guardó el CV, pero no se pudo crear el pago"
      });
    }

    const checkoutUrl =
      datosPago.sandbox_init_point ||
      datosPago.init_point;

    if (!checkoutUrl) {
      return res.status(502).json({
        error: "Mercado Pago no devolvió un enlace"
      });
    }

    return res.status(200).json({
      preferenceId: datosPago.id,
      checkoutUrl
    });

  } catch (error) {
    console.error(
      "Error al preparar la solicitud:",
      error
    );

    return res.status(500).json({
      error: "Ocurrió un error al preparar el pago"
    });
  }
}
