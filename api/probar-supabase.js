
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Método no permitido"
    });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

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
          Authorization: `Bearer ${key}`
        }
      }
    );

    if (!response.ok) {
      return res.status(502).json({
        error: "No se pudo conectar con Supabase"
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
