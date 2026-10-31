
const URL_RECUPERACION =
  "https://micvya-git-prueba-mercadopago-mi-cvy-a.vercel.app/recuperar.html";

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

  const { email } = req.body || {};

  if (
    typeof email !== "string" ||
    !email.trim() ||
    email.length > 254
  ) {
    return res.status(400).json({
      error: "Ingresá un correo válido"
    });
  }

  try {
    const url = new URL(
      "/auth/v1/recover",
      supabaseUrl
    );

    url.searchParams.set(
      "redirect_to",
      URL_RECUPERACION
    );

    const respuesta = await fetch(url, {
      method: "POST",
      headers: {
        apikey: supabaseKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: email.trim()
      })
    });

    if (!respuesta.ok) {
      console.error(
        "Error solicitando recuperación:",
        respuesta.status
      );

      return res.status(502).json({
        error: "No se pudo enviar el correo. Intentá más tarde."
      });
    }

    return res.status(200).json({
      mensaje:
        "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña."
    });

  } catch (error) {
    console.error(
      "Error de recuperación:",
      error
    );

    return res.status(500).json({
      error: "Ocurrió un error al solicitar la recuperación"
    });
  }
}
