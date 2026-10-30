
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Método no permitido"
    });
  }

  const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY?.trim();

  if (!url || !key) {
    return res.status(500).json({
      error: "Falta configurar Supabase"
    });
  }

  try {
    const response = await fetch(
      `${url}/rest/v1/solicitudes_cv?select=id&limit=1`,
      {
        headers: {
          apikey: key,
          Accept: "application/json"
        }
      }
    );

    if (!response.ok) {
      const body = await response.text();

      console.error("Supabase HTTP:", response.status);
      console.error("Detalle:", body);

      let codigo = null;

      try {
        codigo = JSON.parse(body).code ?? null;
      } catch {}

      return res.status(502).json({
        error: "No se pudo conectar con Supabase",
        codigo_supabase: response.status,
        detalle_codigo: codigo
      });
    }

    return res.status(200).json({
      conectado: true,
      mensaje: "MiCVYa conectado correctamente con Supabase"
    });

  } catch (error) {
    return res.status(500).json({
      error: "Error de conexión"
    });
  }
}
