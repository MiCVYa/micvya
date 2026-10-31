
const PRECIO_CV = 5000;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (!["GET", "POST"].includes(req.method)) {
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

  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    Accept: "application/json"
  };

  try {
    // Iniciar sesión con Supabase Auth.
    if (req.method === "POST") {
      const { email, password } = req.body || {};

      if (
        typeof email !== "string" ||
        typeof password !== "string" ||
        !email ||
        !password ||
        email.length > 254 ||
        password.length > 1024
      ) {
        return res.status(400).json({
          error: "Ingresá tu correo y contraseña"
        });
      }

      const loginResponse = await fetch(
        `${supabaseUrl}/auth/v1/token?grant_type=password`,
        {
          method: "POST",
          headers: {
            apikey: supabaseKey,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ email, password })
        }
      );

      if (!loginResponse.ok) {
        return res.status(401).json({
          error: "Correo o contraseña incorrectos"
        });
      }

      const session = await loginResponse.json();

      if (!session.access_token) {
        return res.status(502).json({
          error: "No se pudo iniciar sesión"
        });
      }

      const userResponse = await fetch(
        `${supabaseUrl}/auth/v1/user`,
        {
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${session.access_token}`
          }
        }
      );

      if (!userResponse.ok) {
        return res.status(401).json({
          error: "Sesión inválida"
        });
      }

      const user = await userResponse.json();

      const adminUrl = new URL(
        "/rest/v1/administradores",
        supabaseUrl
      );

      adminUrl.searchParams.set(
        "usuario_id",
        `eq.${user.id}`
      );

      adminUrl.searchParams.set(
        "select",
        "usuario_id"
      );

      const adminResponse = await fetch(adminUrl, {
        headers
      });

      if (!adminResponse.ok) {
        throw new Error("No se pudo verificar el administrador");
      }

      const admins = await adminResponse.json();

      if (admins.length !== 1) {
        return res.status(403).json({
          error: "No tenés permisos de administrador"
        });
      }

      return res.status(200).json({
        access_token: session.access_token,
        expires_in: session.expires_in
      });
    }

    // Comprobar la sesión en cada consulta.
    const authorization = req.headers.authorization || "";

    if (!/^Bearer \S+$/.test(authorization)) {
      return res.status(401).json({
        error: "Tenés que iniciar sesión"
      });
    }

    const userResponse = await fetch(
      `${supabaseUrl}/auth/v1/user`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: authorization
        }
      }
    );

    if (!userResponse.ok) {
      return res.status(401).json({
        error: "La sesión venció. Ingresá nuevamente."
      });
    }

    const user = await userResponse.json();

    // Verificar que siga siendo administrador.
    const adminUrl = new URL(
      "/rest/v1/administradores",
      supabaseUrl
    );

    adminUrl.searchParams.set(
      "usuario_id",
      `eq.${user.id}`
    );

    adminUrl.searchParams.set(
      "select",
      "usuario_id"
    );

    const adminResponse = await fetch(adminUrl, {
      headers
    });

    if (!adminResponse.ok) {
      throw new Error("Error verificando permisos");
    }

    const admins = await adminResponse.json();

    if (admins.length !== 1) {
      return res.status(403).json({
        error: "Acceso denegado"
      });
    }

    // Consultar solamente datos necesarios.
    const ventasUrl = new URL(
      "/rest/v1/solicitudes_cv",
      supabaseUrl
    );

    ventasUrl.searchParams.set(
      "select",
      "id,diseno,estado_pago,creado_en,pagado_en"
    );

    ventasUrl.searchParams.set(
      "order",
      "creado_en.desc"
    );

    // Primera versión: máximo 1000 solicitudes.
    ventasUrl.searchParams.set("limit", "1000");

    const ventasResponse = await fetch(ventasUrl, {
      headers
    });

    if (!ventasResponse.ok) {
      throw new Error("Error consultando las ventas");
    }

    const ventas = await ventasResponse.json();

    const aprobadas = ventas.filter(
      venta => venta.estado_pago === "aprobado"
    ).length;

    const pendientes = ventas.filter(
      venta => venta.estado_pago === "pendiente"
    ).length;

    return res.status(200).json({
      aprobadas,
      pendientes,
      total: ventas.length,
      recaudacion: aprobadas * PRECIO_CV,
      ventas: ventas.slice(0, 50).map(venta => ({
        id: venta.id,
        diseno: venta.diseno,
        estado: venta.estado_pago,
        fecha: venta.pagado_en || venta.creado_en,
        importe:
          venta.estado_pago === "aprobado"
            ? PRECIO_CV
            : 0
      })),
      limitado: ventas.length === 1000
    });

  } catch (error) {
    console.error("Error en administración:", error);

    return res.status(500).json({
      error: "No se pudo procesar la solicitud"
    });
  }
}
