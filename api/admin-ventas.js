
const PRECIO_CV = 5000;

const LIMITE_SOLICITUDES = 1000;

function configurarRespuesta(res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

async function obtenerUsuario(url, key, token) {
  const respuesta = await fetch(
    `${url}/auth/v1/user`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${token}`
      }
    }
  );

  if (!respuesta.ok) {
    return null;
  }

  const usuario = await respuesta.json();

  return usuario?.id ? usuario : null;
}

async function esAdministrador(url, key, usuarioId) {
  const consulta = new URL(
    "/rest/v1/administradores",
    url
  );

  consulta.searchParams.set(
    "usuario_id",
    `eq.${usuarioId}`
  );

  consulta.searchParams.set(
    "select",
    "usuario_id"
  );

  consulta.searchParams.set("limit", "1");

  const respuesta = await fetch(consulta, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json"
    }
  });

  if (!respuesta.ok) {
    throw new Error(
      "No se pudo comprobar el administrador"
    );
  }

  const registros = await respuesta.json();

  return (
    Array.isArray(registros) &&
    registros.length === 1
  );
}

async function obtenerVentas(url, key) {
  const consulta = new URL(
    "/rest/v1/solicitudes_cv",
    url
  );

  consulta.searchParams.set(
    "select",
    "id,diseno,estado_pago,creado_en,pagado_en"
  );

  consulta.searchParams.set(
    "order",
    "creado_en.desc"
  );

  consulta.searchParams.set(
    "limit",
    String(LIMITE_SOLICITUDES)
  );

  const respuesta = await fetch(consulta, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json"
    }
  });

  if (!respuesta.ok) {
    throw new Error(
      "No se pudieron consultar las ventas"
    );
  }

  const ventas = await respuesta.json();

  if (!Array.isArray(ventas)) {
    throw new Error("Respuesta de ventas inválida");
  }

  const aprobadas = ventas.filter(
    venta => venta.estado_pago === "aprobado"
  ).length;

  const pendientes = ventas.filter(
    venta => venta.estado_pago === "pendiente"
  ).length;

  return {
    aprobadas,
    pendientes,
    total: ventas.length,
    recaudacion: aprobadas * PRECIO_CV,
    limitado: ventas.length === LIMITE_SOLICITUDES,
    ventas: ventas.slice(0, 50).map(venta => ({
      id: venta.id,
      diseno: venta.diseno,
      estado: venta.estado_pago,
      fecha:
        venta.pagado_en ||
        venta.creado_en ||
        null,
      importe:
        venta.estado_pago === "aprobado"
          ? PRECIO_CV
          : 0
    }))
  };
}

export default async function handler(req, res) {
  configurarRespuesta(res);

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

  try {
    if (req.method === "POST") {
      const { email, password } = req.body || {};

      if (
        typeof email !== "string" ||
        typeof password !== "string" ||
        !email.trim() ||
        !password ||
        email.length > 254 ||
        password.length > 1024
      ) {
        return res.status(400).json({
          error: "Ingresá tu correo y contraseña"
        });
      }

      const respuestaLogin = await fetch(
        `${supabaseUrl}/auth/v1/token?grant_type=password`,
        {
          method: "POST",
          headers: {
            apikey: supabaseKey,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            email: email.trim(),
            password
          })
        }
      );

      if (!respuestaLogin.ok) {
        const detalle = await respuestaLogin.text();

        // Diagnóstico temporal.
        // No registrar contraseñas ni tokens.
        console.error(
          "Error de autenticación Supabase:",
          respuestaLogin.status,
          detalle
        );

        return res.status(401).json({
          error:
            "No se pudo iniciar sesión. Revisá el registro del servidor."
        });
      }

      const sesion = await respuestaLogin.json();

      if (!sesion.access_token) {
        return res.status(502).json({
          error: "No se pudo iniciar sesión"
        });
      }

      const usuario = await obtenerUsuario(
        supabaseUrl,
        supabaseKey,
        sesion.access_token
      );

      if (!usuario) {
        return res.status(401).json({
          error: "No se pudo validar tu sesión"
        });
      }

      const autorizado = await esAdministrador(
        supabaseUrl,
        supabaseKey,
        usuario.id
      );

      if (!autorizado) {
        return res.status(403).json({
          error: "No tenés permisos de administrador"
        });
      }

      return res.status(200).json({
        access_token: sesion.access_token,
        expires_in: sesion.expires_in
      });
    }

    const authorization =
      req.headers.authorization || "";

    const coincidencia = /^Bearer (\S+)$/.exec(
      authorization
    );

    if (!coincidencia) {
      return res.status(401).json({
        error: "Tenés que iniciar sesión"
      });
    }

    const usuario = await obtenerUsuario(
      supabaseUrl,
      supabaseKey,
      coincidencia[1]
    );

    if (!usuario) {
      return res.status(401).json({
        error: "Tu sesión venció. Ingresá nuevamente."
      });
    }

    const autorizado = await esAdministrador(
      supabaseUrl,
      supabaseKey,
      usuario.id
    );

    if (!autorizado) {
      return res.status(403).json({
        error: "Acceso denegado"
      });
    }

    const resumen = await obtenerVentas(
      supabaseUrl,
      supabaseKey
    );

    return res.status(200).json(resumen);

  } catch (error) {
    console.error(
      "Error en panel administrador:",
      error
    );

    return res.status(500).json({
      error: "No se pudo procesar la solicitud"
    });
  }
}
