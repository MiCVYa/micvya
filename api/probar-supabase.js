
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
    const proyecto = new URL(url).hostname.split(".")[0].slice(0, 4);

    const response = await fetch(`${url}/rest/v1/`, {
      method: "GET",
      headers: {
        apikey: key,
        Accept: "application/openapi+json"
      }
    });

    if (!response.ok) {
      let codigo = null;

      try {
        const detalle = await response.json();
        codigo = detalle.code ?? null;
      } catch {}

      return res.status(502).json({
        conectado: false,
        proyecto,
        codigo_supabase: response.status,
        detalle_codigo: codigo
      });
    }

    return res.status(200).json({
      conectado: true,
      proyecto,
      mensaje: "La API de Supabase responde correctamente"
    });

  } catch {
    return res.status(500).json({
      conectado: false,
      error: "Error al consultar la API de Supabase"
    });
  }
}
