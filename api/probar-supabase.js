
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
    const base = new URL(url);
    const proyecto = base.hostname.split(".")[0].slice(0, 4);

    // Comprobamos cómo se está construyendo la dirección.
    const ruta = new URL("/rest/v1/", base);

    const response = await fetch(ruta.toString(), {
      method: "GET",
      headers: {
        apikey: key,
        Accept: "application/openapi+json"
      }
    });

    let codigo = null;

    if (!response.ok) {
      try {
        const detalle = await response.json();
        codigo = detalle.code ?? null;
      } catch {}
    }

    return res.status(200).json({
      proyecto,
      protocolo: ruta.protocol,
      ruta: ruta.pathname,
      codigo_supabase: response.status,
      detalle_codigo: codigo,
      conectado: response.ok
    });

  } catch {
    return res.status(500).json({
      error: "No se pudo completar la prueba"
    });
  }
}
