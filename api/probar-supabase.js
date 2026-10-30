
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
    const ruta = new URL("/rest/v1/solicitudes_cv", url);

    ruta.searchParams.set("select", "id");
    ruta.searchParams.set("limit", "1");

    const response = await fetch(ruta.toString(), {
      method: "GET",
      headers: {
        apikey: key,
        Accept: "application/json"
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
        codigo_supabase: response.status,
        detalle_codigo: codigo
      });
    }

    return res.status(200).json({
      conectado: true,
      tabla: "solicitudes_cv",
      mensaje: "MiCVYa puede consultar la tabla correctamente"
    });

  } catch {
    return res.status(500).json({
      conectado: false,
      error: "Error al consultar Supabase"
    });
  }
}
