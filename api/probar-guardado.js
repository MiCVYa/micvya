
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Método no permitido"
    });
  }

  // La prueba permanece desactivada por defecto.
  if (process.env.HABILITAR_PRUEBA_GUARDADO !== "si") {
    return res.status(403).json({
      error: "Prueba de guardado desactivada"
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

    const response = await fetch(ruta.toString(), {
      method: "POST",
      headers: {
        apikey: key,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify({
        datos_cv: {
          nombre: "Persona de prueba",
          perfil: "Registro ficticio para probar MiCVYa"
        },
        diseno: "ats",
        estado_pago: "pendiente"
      })
    });

    if (!response.ok) {
      let codigo = null;

      try {
        const detalle = await response.json();
        codigo = detalle.code ?? null;
      } catch {}

      return res.status(502).json({
        guardado: false,
        codigo_supabase: response.status,
        detalle_codigo: codigo
      });
    }

    return res.status(200).json({
      guardado: true,
      mensaje: "Solicitud de prueba guardada correctamente"
    });

  } catch {
    return res.status(500).json({
      guardado: false,
      error: "Error al guardar en Supabase"
    });
  }
}
