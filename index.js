const express = require('express');
const path = require('path');
const { Sequelize, QueryTypes } = require('sequelize');
const oracledb = require('oracledb');

// DB configuration from environment variables (or defaults for local dev)
const DEFAULT_DB_HOST = process.env.DB_HOST || 'localhost';
const DEFAULT_DB_PORT = parseInt(process.env.DB_PORT || '1521');
const DEFAULT_DB_SERVICE = process.env.DB_SERVICE || 'XE';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Estilos compartidos
const estilosGlobales = `<style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; padding: 2rem; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
    .container { max-width: 1200px; margin: 0 auto; }
    .header { text-align: center; color: white; margin-bottom: 2rem; }
    .header h1 { font-size: 2.5rem; text-transform: uppercase; letter-spacing: 2px; text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3); margin-bottom: 0.5rem; }
    .user-info { background: rgba(255, 255, 255, 0.95); border-radius: 15px; padding: 1.5rem; margin-bottom: 2rem; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2); text-align: center; }
    .user-info h2 { color: #667eea; font-size: 1.3rem; margin-bottom: 1rem; }
    .user-badge { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 0.5rem 1.5rem; border-radius: 25px; font-weight: 600; font-size: 1.1rem; margin-bottom: 1.5rem; }
    .form-group { margin-bottom: 1rem; }
    .form-group label { display: block; margin-bottom: 0.5rem; color: #333; font-weight: 600; }
    .form-group select { width: 100%; padding: 0.75rem; border: 2px solid #ddd; border-radius: 8px; font-size: 1rem; transition: border-color 0.3s ease; }
    .form-group select:focus { outline: none; border-color: #667eea; box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1); }
    .view-btn { background: linear-gradient(135deg, #11c76d 0%, #00a651 100%); color: white; border: none; padding: 0.6rem 1.2rem; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 0.95rem; transition: all 0.3s ease; text-transform: uppercase; letter-spacing: 0.5px; width: 100%; }
    .view-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(17, 199, 109, 0.4); }
    .view-btn:active { transform: translateY(0); }
    table { width: 100%; border-collapse: collapse; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2); margin-bottom: 2rem; }
    th { background: linear-gradient(135deg, #1976d2 0%, #1565c0 100%); color: white; padding: 1rem; text-align: left; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; font-size: 0.95rem; border-bottom: 3px solid #0d47a1; }
    td { padding: 1rem; border-bottom: 1px solid #e0e0e0; text-align: left; color: #333; }
    tr:last-child td { border-bottom: none; }
    tr:hover { background-color: #f5f5f5; }
    .back-btn { display: block; text-align: center; margin-top: 2rem; background: white; color: #667eea; padding: 1rem 2rem; border-radius: 10px; text-decoration: none; font-weight: 600; border: 2px solid #667eea; transition: all 0.3s ease; width: fit-content; margin-left: auto; margin-right: auto; cursor: pointer; }
    .back-btn:hover { background: #667eea; color: white; transform: translateY(-2px); box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4); }
    .alerta { background: rgba(255, 255, 255, 0.95); border-radius: 15px; padding: 2rem; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2); text-align: center; color: #d32f2f; font-size: 1.2rem; font-weight: 600; margin-bottom: 2rem; border: 2px solid #d32f2f; }
    .success-box { background: rgba(255, 255, 255, 0.95); border-radius: 15px; padding: 2rem; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2); text-align: center; color: #1976d2; font-size: 1.1rem; margin-bottom: 2rem; border-left: 5px solid #1976d2; }
</style>`;

// Sirve el formulario
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'form.html'));
});

// Ruta principal de consulta con combo box
app.post('/consulta', async (req, res) => {
  const { usuario, password } = req.body;
  const host = DEFAULT_DB_HOST;
  const port = DEFAULT_DB_PORT;
  const service = DEFAULT_DB_SERVICE;
  const connectString = `${host}:${port}/${service}`;

  // Test oracledb connection first (supports SYSDBA for SYS)
  try {
    const connOpts = { user: usuario, password, connectString };
    if (String(usuario).toUpperCase() === 'SYS') {
      connOpts.privilege = oracledb.SYSDBA;
    }
    const testConn = await oracledb.getConnection(connOpts);
    await testConn.close();
  } catch (err) {
    console.warn('oracledb test:', err.message);
  }

  const sequelize = new Sequelize(service, usuario, password, {
    host,
    dialect: 'oracle',
    port,
    dialectOptions: {
      connectString
    },
    logging: false
  });

  try {
    await sequelize.authenticate();
    
    // Handle SYSTEM separately with DBA_TAB_PRIVS; others use ALL_TAB_PRIVS
    const isSystem = String(usuario).toUpperCase() === 'SYSTEM';
    let resultados = [];
    
    if (isSystem) {
      // SYSTEM: show only SYS/XDB tables where SYSTEM has explicit privileges
      resultados = await sequelize.query(
        `SELECT DISTINCT OWNER, TABLE_NAME, PRIVILEGE FROM DBA_TAB_PRIVS WHERE GRANTEE = 'SYSTEM' AND OWNER IN ('SYS','XDB') ORDER BY OWNER, TABLE_NAME`,
        { type: QueryTypes.SELECT }
      );
    } else {
      // Regular user: show tables from ALL_TAB_PRIVS
      resultados = await sequelize.query(
        `SELECT TABLE_NAME, GRANTOR as OWNER, PRIVILEGE FROM ALL_TAB_PRIVS WHERE GRANTEE = :usuario ORDER BY GRANTOR, TABLE_NAME`,
        { type: QueryTypes.SELECT, replacements: { usuario: usuario.toUpperCase() } }
      );
    }

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Panel de Usuario</title>
  ${estilosGlobales}
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>✅ CONSULTA EXITOSA PARA USUARIO ${usuario.toUpperCase()}</h1>
    </div>
    
    <div class="user-info">
      <h2>Información del usuario:</h2>
      <div class="user-badge">🔐 Usuario: ${usuario}</div>
      
      <div class="form-group">
        <label for="opciones">Selecciona una opción:</label>
        <select id="opciones" name="opciones">
          <option value="">-- Selecciona una opción --</option>
          <option value="tablas">📋 CONTENIDO DE LAS TABLAS</option>
          <option value="roles">👤 CONSULTA DE ROLES DEL USUARIO</option>
          <option value="privilegios">🔑 PRIVILEGIOS DEL USUARIO</option>
        </select>
      </div>
      
      <form id="formulario" action="/consulta/vista" method="POST" style="display: none;">
        <input type="hidden" name="usuario" value="${usuario}">
        <input type="hidden" name="password" value="${password}">
        <input type="hidden" id="tipo" name="tipo" value="">
        <button type="submit" class="view-btn">Ver</button>
      </form>
    </div>

    ${resultados.length === 0 ? `
      <div class="alerta">El usuario <b>${usuario}</b> no tiene acceso a ninguna tabla.</div>
    ` : `
      <table>
        <thead>
          <tr>
            <th>OWNER</th>
            <th>TABLE_NAME</th>
            <th>PRIVILEGE</th>
          </tr>
        </thead>
        <tbody>
          ${resultados.map(fila => `
            <tr>
              <td>${fila.GRANTOR}</td>
              <td><strong>${fila.TABLE_NAME}</strong></td>
              <td>
                ${fila.PRIVILEGE === 'SELECT' ? `
                  <form action="/tabla/${encodeURIComponent(fila.TABLE_NAME)}" method="POST" class="action-form">
                    <input type="hidden" name="usuario" value="${usuario}">
                    <input type="hidden" name="password" value="${password}">
                    <input type="hidden" name="owner" value="${fila.GRANTOR}">
                    <button type="submit" class="view-btn" style="width: auto; padding: 0.5rem 1rem;">👁️ Ver</button>
                  </form>
                ` : `<span style="color: #999;">${fila.PRIVILEGE}</span>`}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `}

    <a href="/" class="back-btn">🔙 Volver al inicio</a>
  </div>

  <script>
    document.getElementById('opciones').addEventListener('change', function() {
      if (this.value) {
        document.getElementById('tipo').value = this.value;
        document.getElementById('formulario').style.display = 'block';
      } else {
        document.getElementById('formulario').style.display = 'none';
      }
    });
  </script>
</body>
</html>`;

    res.send(html);
  } catch (error) {
    let mensajeError = 'Error al conectar o consultar';
    let titulo = '❌ Error de conexión';

    if (error.message.includes('ORA-01017') || error.message.includes('ORA-28000')) {
      mensajeError = 'Usuario no encontrado o contraseña incorrecta.';
      titulo = '❌ USUARIO NO ENCONTRADO O SU CONTRASEÑA ESTA MAL ESCRITA';
    }

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Error</title>
  ${estilosGlobales}
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${titulo}</h1>
    </div>
    <div class="alerta">${mensajeError}</div>
    <a href="/" class="back-btn">🔙 Volver al inicio</a>
  </div>
</body>
</html>`;

    res.send(html);
  } finally {
    await sequelize.close();
  }
});

// Ruta para mostrar las diferentes vistas
app.post('/consulta/vista', async (req, res) => {
  const { usuario, password, tipo } = req.body;
  const host = DEFAULT_DB_HOST;
  const port = DEFAULT_DB_PORT;
  const service = DEFAULT_DB_SERVICE;
  const connectString = `${host}:${port}/${service}`;

  const sequelize = new Sequelize(service, usuario, password, {
    host,
    dialect: 'oracle',
    port,
    dialectOptions: { connectString },
    logging: false
  });

  try {
    await sequelize.authenticate();

    let contenido = '';
    let titulo = '';

    if (tipo === 'roles') {
      // CONSULTA DE ROLES DEL USUARIO
      const roles = await sequelize.query(
        `SELECT * FROM DBA_ROLE_PRIVS WHERE GRANTEE = :usuario`,
        {
          type: QueryTypes.SELECT,
          replacements: { usuario: usuario.toUpperCase() }
        }
      );

      titulo = `ROLES ASIGNADOS PARA ${usuario.toUpperCase()}`;
      
      if (roles.length > 0) {
        contenido = `<table>
          <thead>
            <tr>
              <th>GRANTEE</th>
              <th>GRANTED_ROLE</th>
              <th>ADMIN_OPTION</th>
              <th>DEFAULT_ROLE</th>
            </tr>
          </thead>
          <tbody>`;
        
        roles.forEach(rol => {
          contenido += `<tr>
            <td>${rol.GRANTEE}</td>
            <td>${rol.GRANTED_ROLE}</td>
            <td>${rol.ADMIN_OPTION}</td>
            <td>${rol.DEFAULT_ROLE}</td>
          </tr>`;
        });
        
        contenido += `</tbody></table>`;
      } else {
        contenido = `<div class="alerta">El usuario no tiene roles asignados.</div>`;
      }

    } else if (tipo === 'privilegios') {
      // PRIVILEGIOS DEL USUARIO
      const privilegios = await sequelize.query(
        `SELECT * FROM DBA_SYS_PRIVS WHERE GRANTEE = :usuario`,
        {
          type: QueryTypes.SELECT,
          replacements: { usuario: usuario.toUpperCase() }
        }
      );

      titulo = `PRIVILEGIOS DE SISTEMA PARA ${usuario.toUpperCase()}`;
      
      if (privilegios.length > 0) {
        contenido = `<table>
          <thead>
            <tr>
              <th>GRANTEE</th>
              <th>PRIVILEGE</th>
              <th>ADMIN_OPTION</th>
            </tr>
          </thead>
          <tbody>`;
        
        privilegios.forEach(priv => {
          contenido += `<tr>
            <td>${priv.GRANTEE}</td>
            <td>${priv.PRIVILEGE}</td>
            <td>${priv.ADMIN_OPTION}</td>
          </tr>`;
        });
        
        contenido += `</tbody></table>`;
      } else {
        contenido = `<div class="alerta">El usuario no tiene privilegios de sistema asignados.</div>`;
      }

    } else if (tipo === 'tablas') {
      // CONTENIDO DE LAS TABLAS - filtra por privilegios reales
      const isSystem = String(usuario).toUpperCase() === 'SYSTEM';
      let tablas = [];
      
      if (isSystem) {
        tablas = await sequelize.query(
          `SELECT DISTINCT OWNER, TABLE_NAME, PRIVILEGE FROM DBA_TAB_PRIVS WHERE GRANTEE = 'SYSTEM' AND OWNER IN ('SYS','XDB') ORDER BY OWNER, TABLE_NAME`,
          { type: QueryTypes.SELECT }
        );
      } else {
        tablas = await sequelize.query(
          `SELECT DISTINCT TABLE_NAME, GRANTOR as OWNER, PRIVILEGE FROM ALL_TAB_PRIVS WHERE GRANTEE = :usuario ORDER BY GRANTOR, TABLE_NAME`,
          { type: QueryTypes.SELECT, replacements: { usuario: usuario.toUpperCase() } }
        );
      }

      titulo = `TABLAS DISPONIBLES PARA ${usuario.toUpperCase()}`;
      
      if (tablas.length > 0) {
        contenido = `<table>
          <thead>
            <tr>
              <th>NOMBRE DE TABLA</th>
              <th>OWNER</th>
              <th>PRIVILEGE</th>
            </tr>
          </thead>
          <tbody>`;
        
        tablas.forEach(tabla => {
          const owner = tabla.GRANTOR || tabla.OWNER || '';
          const tableName = tabla.TABLE_NAME;
          const privilege = tabla.PRIVILEGE || '';
          contenido += `<tr>
            <td>${tableName}</td>
            <td>${owner}</td>
            <td>
              ${(privilege === 'SELECT' || privilege === 'INSERT' || privilege === 'DELETE' || privilege === 'UPDATE') ? `
                <form action="/tabla/${encodeURIComponent(tableName)}" method="POST" style="display:inline;">
                  <input type="hidden" name="usuario" value="${usuario}">
                  <input type="hidden" name="password" value="${password}">
                  <input type="hidden" name="owner" value="${owner}">
                  <button type="submit" class="view-btn" style="width: auto; padding: 0.5rem 1rem;">👁️ Ver Contenido</button>
                </form>
              ` : `<span style="display:inline-block; background:#4CAF50; color:white; padding:0.3rem 0.8rem; border-radius:4px; font-size:0.85rem; font-weight:bold;">${privilege}</span>`}
            </td>
          </tr>`;
        });
        
        contenido += `</tbody></table>`;
      } else {
        contenido = `<div class="alerta">El usuario no tiene tablas disponibles.</div>`;
      }
    }

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${titulo}</title>
  ${estilosGlobales}
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${titulo}</h1>
    </div>
    
    <div class="user-info">
      <div class="user-badge">🔐 Usuario: ${usuario}</div>
    </div>

    ${contenido}

    <form action="/consulta" method="POST" style="display:inline;">
      <input type="hidden" name="usuario" value="${usuario}">
      <input type="hidden" name="password" value="${password}">
      <button type="submit" class="back-btn">🔙 Volver a Consulta Principal</button>
    </form>
  </div>
</body>
</html>`;

    res.send(html);
  } catch (error) {
    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Error</title>
  ${estilosGlobales}
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>❌ Error</h1>
    </div>
    <div class="alerta">Error al consultar: ${error.message}</div>
    <a href="/" class="back-btn">🔙 Volver al inicio</a>
  </div>
</body>
</html>`;
    res.send(html);
  } finally {
    await sequelize.close();
  }
});

// Ruta para consultar tabla específica
app.post('/tabla/:tableName', async (req, res) => {
  const { usuario, password, owner } = req.body;
  const { tableName } = req.params;

  if (!usuario || !password || !owner) {
    return res.send(`<h2>Error: Faltan parámetros requeridos</h2>`);
  }

  const host = DEFAULT_DB_HOST;
  const port = DEFAULT_DB_PORT;
  const service = DEFAULT_DB_SERVICE;
  const connectString = `${host}:${port}/${service}`;

  const sequelize = new Sequelize(service, usuario, password, {
    host,
    dialect: 'oracle',
    port,
    dialectOptions: { connectString },
    logging: false
  });

  try {
    await sequelize.authenticate();
    // Use unquoted OWNER.TABLE in uppercase to handle case-sensitivity
    const registros = await sequelize.query(
      `SELECT * FROM ${owner.toUpperCase()}.${tableName.toUpperCase()} FETCH FIRST 50 ROWS ONLY`,
      { type: QueryTypes.SELECT }
    );

    let html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Contenido de ${tableName}</title>
  ${estilosGlobales}
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 CONTENIDO DE LA TABLA ${tableName.toUpperCase()}</h1>
    </div>
    
    <div class="user-info">
      <div class="user-badge">🔐 Usuario: ${usuario}</div>
    </div>`;

    if (registros.length > 0) {
      html += `<table><thead><tr>`;
      Object.keys(registros[0]).forEach(col => {
        html += `<th>${col}</th>`;
      });
      html += `</tr></thead><tbody>`;
      
      registros.forEach(row => {
        html += `<tr>`;
        Object.values(row).forEach(val => {
          const valor = val !== null ? val : '<em style="color: #ccc;">NULL</em>';
          html += `<td>${valor}</td>`;
        });
        html += `</tr>`;
      });
      html += `</tbody></table>`;
    } else {
      html += `<div class="alerta">📭 La tabla está vacía.</div>`;
    }

    html += `<form action="/consulta" method="POST" style="display:inline;">
      <input type="hidden" name="usuario" value="${usuario}">
      <input type="hidden" name="password" value="${password}">
      <button type="submit" class="back-btn">🔙 Volver</button>
    </form>
  </div>
</body>
</html>`;

    res.send(html);
  } catch (error) {
    res.send(`<h2>Error al consultar la tabla: ${error.message}</h2>`);
  } finally {
    await sequelize.close();
  }
});

app.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
});

console.log('Servidor iniciado, esperando conexiones...');
console.log('Presiona Ctrl+C para salir...');
