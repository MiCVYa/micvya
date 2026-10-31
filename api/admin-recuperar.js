
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Método no permitido"
    });
  }

  const url = process.env.SUPABASE_URL
    ?.trim()
    .replace(/\/+$/, "");

  const key = process.env.SUPABASE_SECRET_KEY?.trim();

  if (!url || !key) {
    return res.status(500).json({
      error: "Falta configurar Supabase"
    });
  }

  const { access_token, password } = req.body || {};

  if (
    typeof access_token !== "string" ||
    typeof password !== "string" ||
    !access_token ||
    password.length < 12 ||
    password.length > 128
  ) {
    return res.status(400).json({
      error: "Enlace o contraseña inválidos"
    });
  }

  try {
    const usuarioRespuesta = await fetch(
      `${url}/auth/v1/user`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${access_token}`
        }
      }
    );

    if (!usuarioRespuesta.ok) {
      return res.status(401).json({
        error: "El enlace venció o no es válido"
      });
    }

    const usuario = await usuarioRespuesta.json();

    const adminUrl = new URL(
      "/rest/v1/administradores",
      url
    );

    adminUrl.searchParams.set(
      "usuario_id",
      `eq.${usuario.id}`
    );

    adminUrl.searchParams.set(
      "select",
      "usuario_id"
    );

    const adminRespuesta = await fetch(adminUrl, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`
      }
    });

    if (!adminRespuesta.ok) {
      throw new Error("Error comprobando permisos");
    }

    const administradores = await adminRespuesta.json();

    if (administradores.length !== 1) {
      return res.status(403).json({
        error: "Esta cuenta no es administradora"
      });
    }

    const actualizar = await fetch(
      `${url}/auth/v1/user`,
      {
        method: "PUT",
        headers: {
          apikey: key,
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          password
        })
      }
    );

    if (!actualizar.ok) {
      return res.status(400).json({
        error: "No se pudo actualizar la contraseña"
      });
    }

    return res.status(200).json({
      ok: true
    });

  } catch (error) {
    console.error("Error recuperando contraseña:", error);

    return res.status(500).json({
      error: "Ocurrió un error al cambiar la contraseña"
    });
  }
}
