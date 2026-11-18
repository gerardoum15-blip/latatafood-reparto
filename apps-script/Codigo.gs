/**
 * Aula Virtual — servidor (Google Apps Script)
 * Datos en Google Sheets, archivos en Google Drive, todo en la cuenta del profesor.
 *
 * ANTES DE INSTALAR: cambia los datos de CONFIG y ejecuta la función instalar().
 */
const CONFIG = {
  NOMBRE_PLATAFORMA: 'Aula Virtual',
  PROFESOR_DNI: '00000000',
  PROFESOR_NOMBRES: 'Nombre',
  PROFESOR_APELLIDOS: 'Apellido',
  PROFESOR_CORREO: '',
  PROFESOR_CLAVE_INICIAL: 'Cambiar.2026', // la app te pedirá cambiarla al entrar
  NOTA_MAXIMA: 20,
  MODELO_IA: 'claude-opus-5-5'
};

const TABLAS = {
  Usuarios: ['id', 'dni', 'nombres', 'apellidos', 'celular', 'correo', 'hash', 'salt', 'rol', 'estado', 'creado', 'ultimoAcceso', 'minutos', 'debeCambiarClave'],
  Sedes: ['id', 'nombre', 'direccion', 'creado', 'carpetaId'],
  Aulas: ['id', 'sedeId', 'nombre', 'codigo', 'descripcion', 'creado', 'carpetaId', 'estado'],
  Matriculas: ['id', 'aulaId', 'userId', 'fecha', 'estado'],
  Materiales: ['id', 'aulaId', 'titulo', 'descripcion', 'fileId', 'archivo', 'mime', 'tamano', 'fecha'],
  Tareas: ['id', 'aulaId', 'tipo', 'titulo', 'consigna', 'fechaLimite', 'notaMaxima', 'peso', 'preguntas', 'creado'],
  Entregas: ['id', 'tareaId', 'aulaId', 'userId', 'texto', 'archivos', 'respuestas', 'metricas', 'fecha', 'nota', 'comentario', 'revisada', 'analisis']
};
const TIPOS_TAREA = ['foro', 'archivo', 'formulario', 'parcial', 'final'];
const SESION_SEG = 6 * 3600;

/* ======================= Instalación ======================= */

function instalar() {
  const props = PropertiesService.getScriptProperties();
  let raiz = props.getProperty('ROOT_ID') ? DriveApp.getFolderById(props.getProperty('ROOT_ID')) : null;
  if (!raiz) { raiz = DriveApp.createFolder(CONFIG.NOMBRE_PLATAFORMA); props.setProperty('ROOT_ID', raiz.getId()); }
  let ss = props.getProperty('DB_ID') ? SpreadsheetApp.openById(props.getProperty('DB_ID')) : null;
  if (!ss) {
    ss = SpreadsheetApp.create(CONFIG.NOMBRE_PLATAFORMA + ' - Base de datos');
    DriveApp.getFileById(ss.getId()).moveTo(raiz);
    props.setProperty('DB_ID', ss.getId());
  }
  Object.keys(TABLAS).forEach(nombre => {
    let sh = ss.getSheetByName(nombre);
    if (!sh) sh = ss.insertSheet(nombre);
    sh.getRange(1, 1, sh.getMaxRows(), Math.max(TABLAS[nombre].length, sh.getMaxColumns())).setNumberFormat('@');
    sh.getRange(1, 1, 1, TABLAS[nombre].length).setValues([TABLAS[nombre]]);
    sh.setFrozenRows(1);
  });
  const hoja1 = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1');
  if (hoja1 && ss.getSheets().length > 1) ss.deleteSheet(hoja1);
  if (!tabla_('Usuarios').filter(u => u.rol === 'profesor').length) {
    const salt = Utilities.getUuid();
    insertar_('Usuarios', {
      id: nuevoId_(), dni: String(CONFIG.PROFESOR_DNI), nombres: CONFIG.PROFESOR_NOMBRES, apellidos: CONFIG.PROFESOR_APELLIDOS,
      correo: CONFIG.PROFESOR_CORREO, celular: '', hash: hash_(CONFIG.PROFESOR_CLAVE_INICIAL, salt), salt: salt,
      rol: 'profesor', estado: 'activo', creado: ahora_(), ultimoAcceso: '', minutos: '0', debeCambiarClave: '1'
    });
  }
  Logger.log('Listo. Carpeta: ' + raiz.getUrl() + '  Base de datos: ' + ss.getUrl());
}

function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle(CONFIG.NOMBRE_PLATAFORMA)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/* ======================= Base de datos (Sheets) ======================= */

let CACHE_TABLAS_ = {};
function hoja_(nombre) { return SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('DB_ID')).getSheetByName(nombre); }
function tabla_(nombre) {
  if (CACHE_TABLAS_[nombre]) return CACHE_TABLAS_[nombre];
  const sh = hoja_(nombre), v = sh.getDataRange().getValues(), h = TABLAS[nombre];
  const filas = [];
  for (let i = 1; i < v.length; i++) {
    if (v[i].every(c => c === '' || c === null)) continue;
    const o = { _fila: i + 1 };
    h.forEach((k, j) => o[k] = v[i][j] === undefined || v[i][j] === null ? '' : String(v[i][j]));
    filas.push(o);
  }
  CACHE_TABLAS_[nombre] = filas;
  return filas;
}
function insertar_(nombre, obj) {
  const sh = hoja_(nombre), h = TABLAS[nombre];
  const rg = sh.getRange(sh.getLastRow() + 1, 1, 1, h.length);
  rg.setNumberFormat('@'); // texto: conserva ceros a la izquierda del DNI
  rg.setValues([h.map(k => obj[k] === undefined || obj[k] === null ? '' : String(obj[k]))]);
  delete CACHE_TABLAS_[nombre];
  return obj;
}
function actualizar_(nombre, obj) {
  const sh = hoja_(nombre), h = TABLAS[nombre];
  sh.getRange(obj._fila, 1, 1, h.length).setValues([h.map(k => obj[k] === undefined || obj[k] === null ? '' : String(obj[k]))]);
  delete CACHE_TABLAS_[nombre];
  return obj;
}
function borrar_(nombre, obj) { hoja_(nombre).deleteRow(obj._fila); delete CACHE_TABLAS_[nombre]; }
function buscar_(nombre, id) { return tabla_(nombre).find(r => r.id === String(id)) || null; }
function nuevoId_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 12); }
function ahora_() { return String(Date.now()); }
function json_(s, def) { try { return s ? JSON.parse(s) : def; } catch (e) { return def; } }
function conBloqueo_(fn) { const l = LockService.getScriptLock(); l.waitLock(20000); try { return fn(); } finally { l.releaseLock(); } }

/* ======================= Seguridad ======================= */

function hash_(clave, salt) {
  let b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + clave, Utilities.Charset.UTF_8);
  for (let i = 0; i < 300; i++) b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, b.concat(Utilities.newBlob(salt).getBytes()));
  return Utilities.base64Encode(b);
}
function crearSesion_(user, imp) {
  const token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put('s:' + token, JSON.stringify({ u: user.id, imp: imp || '' }), SESION_SEG);
  return token;
}
function sesion_(token) {
  if (!token) throw new Error('SESION');
  const c = CacheService.getScriptCache(), raw = c.get('s:' + token);
  if (!raw) throw new Error('SESION');
  c.put('s:' + token, raw, SESION_SEG);
  const s = JSON.parse(raw), u = buscar_('Usuarios', s.u);
  if (!u || u.estado === 'bloqueado') throw new Error('SESION');
  u._imp = s.imp; u._token = token;
  return u;
}
function soloProfe_(u) { if (u.rol !== 'profesor') throw new Error('Esta acción es solo para el profesor.'); }
function publico_(u) { return { id: u.id, dni: u.dni, nombres: u.nombres, apellidos: u.apellidos, celular: u.celular, correo: u.correo, rol: u.rol, estado: u.estado, debeCambiarClave: u.debeCambiarClave === '1', imp: !!u._imp }; }
function nombreDe_(u) { return u ? (u.apellidos + ' ' + u.nombres).trim() : '—'; }
function matriculado_(u, aulaId) {
  if (u.rol === 'profesor') return true;
  return tabla_('Matriculas').some(m => m.aulaId === aulaId && m.userId === u.id && m.estado === 'activo');
}
function validarClave_(c) { if (!c || String(c).length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.'); }

/* ======================= Punto de entrada ======================= */

/** El navegador llama a api(accion, token, datos). Devuelve siempre {ok, data} o {ok:false, error}. */
function api(accion, token, datos) {
  try {
    CACHE_TABLAS_ = {};
    const fn = ACCIONES_[accion];
    if (!fn) throw new Error('Acción desconocida');
    const publicas = ['estadoDni', 'login', 'registrar', 'config'];
    const u = publicas.indexOf(accion) >= 0 ? null : sesion_(token);
    return { ok: true, data: fn(u, datos || {}) };
  } catch (e) {
    return { ok: false, error: e.message === 'SESION' ? 'SESION' : String(e.message || e) };
  }
}

const ACCIONES_ = {
  /* ---------- Acceso ---------- */
  config: () => ({ nombre: CONFIG.NOMBRE_PLATAFORMA, notaMaxima: CONFIG.NOTA_MAXIMA }),
  estadoDni: (_, d) => {
    const k = String(d.usuario || '').trim().toLowerCase();
    const u = tabla_('Usuarios').find(x => x.dni === k || (x.correo && x.correo.toLowerCase() === k));
    return { existe: !!u, esCorreo: k.indexOf('@') > 0 };
  },
  login: (_, d) => {
    const k = String(d.usuario || '').trim().toLowerCase(), cache = CacheService.getScriptCache();
    const intentos = Number(cache.get('f:' + k) || 0);
    if (intentos >= 5) throw new Error('Demasiados intentos. Espera 10 minutos o pide a tu profesor que restablezca tu contraseña.');
    const u = tabla_('Usuarios').find(x => x.dni === k || (x.correo && x.correo.toLowerCase() === k));
    if (!u || u.hash !== hash_(String(d.clave || ''), u.salt)) { cache.put('f:' + k, String(intentos + 1), 600); throw new Error('DNI, correo o contraseña incorrectos.'); }
    if (u.estado === 'bloqueado') throw new Error('Tu cuenta está desactivada. Habla con tu profesor.');
    cache.remove('f:' + k);
    u.ultimoAcceso = ahora_(); actualizar_('Usuarios', u);
    return { token: crearSesion_(u), usuario: publico_(u) };
  },
  registrar: (_, d) => conBloqueo_(() => {
    const dni = String(d.dni || '').trim();
    if (!/^\d{8}$/.test(dni) && !/^[A-Za-z0-9]{6,12}$/.test(dni)) throw new Error('Escribe un DNI válido (8 dígitos) o tu carné de extranjería.');
    if (!String(d.nombres || '').trim() || !String(d.apellidos || '').trim()) throw new Error('Escribe tus nombres y apellidos completos.');
    if (!/^\+?\d[\d\s]{6,14}$/.test(String(d.celular || '').trim())) throw new Error('Escribe un número de celular válido.');
    const correo = String(d.correo || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) throw new Error('Escribe un correo válido.');
    validarClave_(d.clave);
    const us = tabla_('Usuarios');
    if (us.some(x => x.dni === dni)) throw new Error('Ese DNI ya tiene una cuenta. Inicia sesión.');
    if (us.some(x => x.correo && x.correo.toLowerCase() === correo)) throw new Error('Ese correo ya está registrado.');
    let aula = null;
    if (d.codigo) { aula = tabla_('Aulas').find(a => a.codigo === String(d.codigo).trim().toUpperCase() && a.estado !== 'archivada'); if (!aula) throw new Error('No encontré un aula con ese código. Revísalo con tu profesor.'); }
    const salt = Utilities.getUuid();
    const u = insertar_('Usuarios', { id: nuevoId_(), dni: dni, nombres: String(d.nombres).trim(), apellidos: String(d.apellidos).trim(), celular: String(d.celular).trim(), correo: correo, hash: hash_(String(d.clave), salt), salt: salt, rol: 'estudiante', estado: 'activo', creado: ahora_(), ultimoAcceso: ahora_(), minutos: '0', debeCambiarClave: '0' });
    if (aula) insertar_('Matriculas', { id: nuevoId_(), aulaId: aula.id, userId: u.id, fecha: ahora_(), estado: 'activo' });
    const nu = tabla_('Usuarios').find(x => x.id === u.id);
    return { token: crearSesion_(nu), usuario: publico_(nu) };
  }),
  yo: u => publico_(u),
  salir: u => { CacheService.getScriptCache().remove('s:' + u._token); return true; },
  cambiarClave: (u, d) => {
    if (!u._imp && u.hash !== hash_(String(d.actual || ''), u.salt)) throw new Error('Tu contraseña actual no es correcta.');
    validarClave_(d.nueva);
    u.salt = Utilities.getUuid(); u.hash = hash_(String(d.nueva), u.salt); u.debeCambiarClave = '0';
    actualizar_('Usuarios', u); return true;
  },
  actualizarPerfil: (u, d) => {
    if (d.celular) u.celular = String(d.celular).trim();
    if (d.correo) { const c = String(d.correo).trim().toLowerCase(); if (tabla_('Usuarios').some(x => x.id !== u.id && x.correo === c)) throw new Error('Ese correo ya está registrado.'); u.correo = c; }
    actualizar_('Usuarios', u); return publico_(u);
  },
  ping: (u, d) => {
    if (u._imp) return true;
    u.ultimoAcceso = ahora_(); u.minutos = String(Number(u.minutos || 0) + Math.min(5, Math.max(0, Number(d.minutos) || 0)));
    actualizar_('Usuarios', u); return true;
  },

  /* ---------- Estudiante ---------- */
  misAulas: u => {
    const sedes = tabla_('Sedes');
    const ids = u.rol === 'profesor' ? null : tabla_('Matriculas').filter(m => m.userId === u.id && m.estado === 'activo').map(m => m.aulaId);
    return tabla_('Aulas').filter(a => a.estado !== 'archivada' && (!ids || ids.indexOf(a.id) >= 0)).map(a => {
      const s = sedes.find(x => x.id === a.sedeId);
      return { id: a.id, nombre: a.nombre, sede: s ? s.nombre : '', descripcion: a.descripcion };
    });
  },
  unirme: (u, d) => conBloqueo_(() => {
    const a = tabla_('Aulas').find(x => x.codigo === String(d.codigo || '').trim().toUpperCase() && x.estado !== 'archivada');
    if (!a) throw new Error('No encontré un aula con ese código.');
    const m = tabla_('Matriculas').find(x => x.aulaId === a.id && x.userId === u.id);
    if (m && m.estado === 'retirado') throw new Error('Fuiste retirado de esta aula. Habla con tu profesor.');
    if (!m) insertar_('Matriculas', { id: nuevoId_(), aulaId: a.id, userId: u.id, fecha: ahora_(), estado: 'activo' });
    return { id: a.id, nombre: a.nombre };
  }),
  aula: (u, d) => {
    const a = buscar_('Aulas', d.aulaId); if (!a || !matriculado_(u, a.id)) throw new Error('No tienes acceso a esta aula.');
    const s = buscar_('Sedes', a.sedeId);
    const materiales = tabla_('Materiales').filter(m => m.aulaId === a.id).sort((x, y) => y.fecha - x.fecha).map(m => ({ id: m.id, titulo: m.titulo, descripcion: m.descripcion, archivo: m.archivo, mime: m.mime, tamano: Number(m.tamano), fecha: Number(m.fecha), fileId: u.rol === 'profesor' ? m.fileId : '' }));
    const ents = tabla_('Entregas').filter(e => e.aulaId === a.id);
    const tareas = tabla_('Tareas').filter(t => t.aulaId === a.id).sort((x, y) => y.creado - x.creado).map(t => {
      const base = { id: t.id, tipo: t.tipo, titulo: t.titulo, consigna: t.consigna, fechaLimite: Number(t.fechaLimite) || 0, notaMaxima: Number(t.notaMaxima) || CONFIG.NOTA_MAXIMA, peso: Number(t.peso) || 1, creado: Number(t.creado) };
      if (u.rol === 'profesor') { const es = ents.filter(e => e.tareaId === t.id); base.entregas = es.length; base.porRevisar = es.filter(e => e.revisada !== '1' && (e.texto || e.archivos || e.respuestas)).length; }
      else { const e = ents.find(x => x.tareaId === t.id && x.userId === u.id); base.entregada = !!(e && (e.texto || e.archivos !== '' || e.respuestas)); base.nota = e && e.revisada === '1' && e.nota !== '' ? Number(e.nota) : null; }
      return base;
    });
    const out = { id: a.id, nombre: a.nombre, descripcion: a.descripcion, sede: s ? s.nombre : '', sedeId: a.sedeId, materiales: materiales, tareas: tareas };
    if (u.rol === 'profesor') { out.codigo = a.codigo; out.carpeta = a.carpetaId ? 'https://drive.google.com/drive/folders/' + a.carpetaId : ''; }
    return out;
  },
  verMaterial: (u, d) => {
    const m = buscar_('Materiales', d.id); if (!m || !matriculado_(u, m.aulaId)) throw new Error('No tienes acceso a este material.');
    const f = DriveApp.getFileById(m.fileId);
    if (f.getSize() > 25 * 1024 * 1024) throw new Error('El archivo pesa más de 25 MB y no se puede abrir aquí. Pide a tu profesor que lo comparta de otra forma.');
    return { nombre: m.archivo, mime: f.getMimeType(), b64: Utilities.base64Encode(f.getBlob().getBytes()) };
  },
  tarea: (u, d) => {
    const t = buscar_('Tareas', d.tareaId); if (!t || !matriculado_(u, t.aulaId)) throw new Error('No tienes acceso a esta tarea.');
    const preguntas = json_(t.preguntas, []);
    const out = { id: t.id, aulaId: t.aulaId, tipo: t.tipo, titulo: t.titulo, consigna: t.consigna, fechaLimite: Number(t.fechaLimite) || 0, notaMaxima: Number(t.notaMaxima) || CONFIG.NOTA_MAXIMA, peso: Number(t.peso) || 1 };
    if (u.rol === 'profesor') { out.preguntas = preguntas; return out; }
    out.preguntas = preguntas.map(p => ({ id: p.id, texto: p.texto, tipo: p.tipo, opciones: p.opciones || [], puntos: p.puntos }));
    const e = tabla_('Entregas').find(x => x.tareaId === t.id && x.userId === u.id);
    out.miEntrega = e ? { texto: e.texto, archivos: json_(e.archivos, []).map(f => ({ nombre: f.nombre, tamano: f.tamano })), respuestas: json_(e.respuestas, {}), fecha: Number(e.fecha) || 0, nota: e.revisada === '1' && e.nota !== '' ? Number(e.nota) : null, comentario: e.revisada === '1' ? e.comentario : '', revisada: e.revisada === '1' } : null;
    return out;
  },
  entregar: (u, d) => conBloqueo_(() => {
    if (u.rol !== 'estudiante') throw new Error('Solo los estudiantes entregan tareas.');
    if (u._imp) throw new Error('Estás viendo la cuenta del estudiante: no puedes entregar por él.');
    const t = buscar_('Tareas', d.tareaId); if (!t || !matriculado_(u, t.aulaId)) throw new Error('No tienes acceso a esta tarea.');
    if (t.tipo === 'parcial' || t.tipo === 'final') throw new Error('Los exámenes los registra el profesor.');
    if (Number(t.fechaLimite) && Date.now() > Number(t.fechaLimite)) throw new Error('La fecha límite ya pasó.');
    let e = tabla_('Entregas').find(x => x.tareaId === t.id && x.userId === u.id);
    if (e && e.revisada === '1') throw new Error('Tu profesor ya revisó esta tarea; no se puede cambiar.');
    const texto = String(d.texto || '').slice(0, 30000);
    const archivos = (d.archivos || []).filter(f => f && f.id).map(f => ({ id: String(f.id), nombre: String(f.nombre || ''), mime: String(f.mime || ''), tamano: Number(f.tamano) || 0 }));
    const prev = e ? json_(e.archivos, []) : [];
    const todos = prev.concat(archivos.filter(f => !prev.some(p => p.id === f.id)));
    let respuestas = d.respuestas || {}, nota = '';
    if (t.tipo === 'formulario') {
      const ps = json_(t.preguntas, []), cerradas = ps.filter(p => p.tipo === 'opcion');
      if (cerradas.length && cerradas.length === ps.length) {
        const total = ps.reduce((s, p) => s + (Number(p.puntos) || 1), 0), bien = ps.reduce((s, p) => s + (String(respuestas[p.id]) === String(p.correcta) ? (Number(p.puntos) || 1) : 0), 0);
        nota = String(Math.round(bien / total * (Number(t.notaMaxima) || CONFIG.NOTA_MAXIMA) * 10) / 10);
      }
    }
    if (t.tipo === 'foro' && !texto.trim()) throw new Error('Escribe tu respuesta antes de enviar.');
    if (t.tipo === 'archivo' && !todos.length) throw new Error('Sube al menos un archivo.');
    const datos = { tareaId: t.id, aulaId: t.aulaId, userId: u.id, texto: texto, archivos: JSON.stringify(todos), respuestas: JSON.stringify(respuestas), metricas: JSON.stringify(d.metricas || {}), fecha: ahora_(), nota: nota, comentario: '', revisada: nota !== '' ? '1' : '0', analisis: '' };
    if (e) { Object.assign(e, datos); actualizar_('Entregas', e); } else insertar_('Entregas', Object.assign({ id: nuevoId_() }, datos));
    return { nota: nota !== '' ? Number(nota) : null };
  }),
  misNotas: u => notasDe_(u.id),

  /* ---------- Subida de archivos por partes (videos grandes) ---------- */
  subirInicio: (u, d) => {
    const carpeta = carpetaDestino_(u, d);
    const meta = { name: String(d.nombre || 'archivo').slice(0, 200), parents: [carpeta.getId()] };
    const r = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id', {
      method: 'post', contentType: 'application/json; charset=UTF-8', payload: JSON.stringify(meta), muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'X-Upload-Content-Type': d.mime || 'application/octet-stream', 'X-Upload-Content-Length': String(d.tamano) }
    });
    if (r.getResponseCode() >= 300) throw new Error('Drive no aceptó el archivo (' + r.getResponseCode() + ').');
    const h = r.getHeaders(), url = h.Location || h.location;
    const id = nuevoId_();
    CacheService.getScriptCache().put('up:' + id, JSON.stringify({ url: url, u: u.id }), 21600);
    return { subidaId: id };
  },
  subirParte: (u, d) => {
    const info = json_(CacheService.getScriptCache().get('up:' + d.subidaId), null);
    if (!info || info.u !== u.id) throw new Error('La subida expiró. Vuelve a intentarlo.');
    const bytes = Utilities.base64Decode(d.b64), ini = Number(d.inicio), total = Number(d.total);
    const r = UrlFetchApp.fetch(info.url, { method: 'put', payload: bytes, contentType: 'application/octet-stream', muteHttpExceptions: true, headers: { 'Content-Range': 'bytes ' + ini + '-' + (ini + bytes.length - 1) + '/' + total } });
    const c = r.getResponseCode();
    if (c === 308) return { listo: false };
    if (c === 200 || c === 201) { CacheService.getScriptCache().remove('up:' + d.subidaId); return { listo: true, id: JSON.parse(r.getContentText()).id }; }
    throw new Error('Falló la subida (' + c + '). Revisa tu conexión y vuelve a intentar.');
  },

  /* ---------- Profesor: sedes y aulas ---------- */
  panel: u => {
    soloProfe_(u);
    const us = tabla_('Usuarios').filter(x => x.rol === 'estudiante'), ahora = Date.now(), ents = tabla_('Entregas');
    const aulas = tabla_('Aulas').filter(a => a.estado !== 'archivada'), mats = tabla_('Matriculas').filter(m => m.estado === 'activo');
    return {
      sedes: tabla_('Sedes').map(s => ({ id: s.id, nombre: s.nombre, direccion: s.direccion, aulas: aulas.filter(a => a.sedeId === s.id).map(a => ({ id: a.id, nombre: a.nombre, codigo: a.codigo, estudiantes: mats.filter(m => m.aulaId === a.id).length, porRevisar: ents.filter(e => e.aulaId === a.id && e.revisada !== '1' && (e.texto || e.archivos || e.respuestas)).length })) })),
      estudiantes: us.length,
      activosSemana: us.filter(x => x.ultimoAcceso && ahora - Number(x.ultimoAcceso) < 7 * 864e5).length,
      sinEntrar7: us.filter(x => x.ultimoAcceso && ahora - Number(x.ultimoAcceso) >= 7 * 864e5).length,
      nuncaEntraron: us.filter(x => !x.ultimoAcceso || Number(x.minutos || 0) === 0).length,
      porRevisar: ents.filter(e => e.revisada !== '1' && (e.texto || e.archivos || e.respuestas)).length,
      iaActiva: !!PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY')
    };
  },
  guardarSede: (u, d) => conBloqueo_(() => {
    soloProfe_(u); const nombre = String(d.nombre || '').trim(); if (!nombre) throw new Error('Escribe el nombre de la sede.');
    if (d.id) { const s = buscar_('Sedes', d.id); s.nombre = nombre; s.direccion = String(d.direccion || ''); actualizar_('Sedes', s); if (s.carpetaId) DriveApp.getFolderById(s.carpetaId).setName(nombre); return { id: s.id }; }
    const c = raiz_().createFolder(nombre);
    return insertar_('Sedes', { id: nuevoId_(), nombre: nombre, direccion: String(d.direccion || ''), creado: ahora_(), carpetaId: c.getId() });
  }),
  guardarAula: (u, d) => conBloqueo_(() => {
    soloProfe_(u); const nombre = String(d.nombre || '').trim(); if (!nombre) throw new Error('Escribe el nombre del aula.');
    const s = buscar_('Sedes', d.sedeId); if (!s) throw new Error('Elige una sede.');
    if (d.id) { const a = buscar_('Aulas', d.id); a.nombre = nombre; a.descripcion = String(d.descripcion || ''); actualizar_('Aulas', a); if (a.carpetaId) DriveApp.getFolderById(a.carpetaId).setName(nombre); return { id: a.id }; }
    const c = DriveApp.getFolderById(s.carpetaId).createFolder(nombre);
    c.createFolder('Material'); c.createFolder('Estudiantes');
    let codigo; const usados = tabla_('Aulas').map(a => a.codigo);
    do { codigo = Math.random().toString(36).slice(2, 8).toUpperCase().replace(/[O0I1]/g, 'X'); } while (usados.indexOf(codigo) >= 0);
    return insertar_('Aulas', { id: nuevoId_(), sedeId: s.id, nombre: nombre, codigo: codigo, descripcion: String(d.descripcion || ''), creado: ahora_(), carpetaId: c.getId(), estado: 'activa' });
  }),
  archivarAula: (u, d) => { soloProfe_(u); const a = buscar_('Aulas', d.aulaId); a.estado = 'archivada'; actualizar_('Aulas', a); return true; },
  guardarMaterial: (u, d) => conBloqueo_(() => {
    soloProfe_(u); const a = buscar_('Aulas', d.aulaId); if (!a) throw new Error('Aula no encontrada.');
    if (!d.fileId) throw new Error('Falta el archivo.');
    return insertar_('Materiales', { id: nuevoId_(), aulaId: a.id, titulo: String(d.titulo || d.archivo || 'Material'), descripcion: String(d.descripcion || ''), fileId: d.fileId, archivo: String(d.archivo || ''), mime: String(d.mime || ''), tamano: String(d.tamano || 0), fecha: ahora_() });
  }),
  borrarMaterial: (u, d) => conBloqueo_(() => { soloProfe_(u); const m = buscar_('Materiales', d.id); if (m) { try { DriveApp.getFileById(m.fileId).setTrashed(true); } catch (e) {} borrar_('Materiales', m); } return true; }),
  guardarTarea: (u, d) => conBloqueo_(() => {
    soloProfe_(u); const a = buscar_('Aulas', d.aulaId); if (!a) throw new Error('Aula no encontrada.');
    if (TIPOS_TAREA.indexOf(d.tipo) < 0) throw new Error('Tipo de tarea no válido.');
    if (!String(d.titulo || '').trim()) throw new Error('Escribe el título.');
    const preguntas = (d.preguntas || []).filter(p => p && String(p.texto || '').trim()).map((p, i) => ({ id: p.id || 'p' + (i + 1) + '_' + nuevoId_().slice(0, 4), texto: String(p.texto).trim(), tipo: p.tipo === 'opcion' ? 'opcion' : 'abierta', opciones: p.tipo === 'opcion' ? (p.opciones || []).map(String).filter(Boolean) : [], correcta: p.tipo === 'opcion' ? Number(p.correcta) || 0 : '', puntos: Number(p.puntos) || 1 }));
    if (d.tipo === 'formulario' && !preguntas.length) throw new Error('Agrega al menos una pregunta.');
    const datos = { aulaId: a.id, tipo: d.tipo, titulo: String(d.titulo).trim(), consigna: String(d.consigna || ''), fechaLimite: d.fechaLimite ? String(Number(d.fechaLimite)) : '', notaMaxima: String(Number(d.notaMaxima) || CONFIG.NOTA_MAXIMA), peso: String(Number(d.peso) || 1), preguntas: JSON.stringify(preguntas) };
    if (d.id) { const t = buscar_('Tareas', d.id); Object.assign(t, datos); actualizar_('Tareas', t); return { id: t.id }; }
    return insertar_('Tareas', Object.assign({ id: nuevoId_(), creado: ahora_() }, datos));
  }),
  borrarTarea: (u, d) => conBloqueo_(() => {
    soloProfe_(u); const t = buscar_('Tareas', d.id); if (!t) return true;
    tabla_('Entregas').filter(e => e.tareaId === t.id).sort((x, y) => y._fila - x._fila).forEach(e => borrar_('Entregas', e));
    borrar_('Tareas', buscar_('Tareas', d.id)); return true;
  }),

  /* ---------- Profesor: revisión ---------- */
  entregas: (u, d) => {
    soloProfe_(u); const t = buscar_('Tareas', d.tareaId); if (!t) throw new Error('Tarea no encontrada.');
    const est = estudiantesDeAula_(t.aulaId), ents = tabla_('Entregas').filter(e => e.tareaId === t.id);
    return {
      tarea: ACCIONES_.tarea(u, { tareaId: t.id }),
      filas: est.map(s => {
        const e = ents.find(x => x.userId === s.id);
        const m = e ? json_(e.metricas, {}) : {}, an = e ? json_(e.analisis, {}) : {};
        return { userId: s.id, nombre: nombreDe_(s), dni: s.dni, entregaId: e ? e.id : '', fecha: e ? Number(e.fecha) : 0, nota: e && e.nota !== '' ? Number(e.nota) : null, revisada: e ? e.revisada === '1' : false, tiene: !!(e && (e.texto || json_(e.archivos, []).length || e.respuestas !== '{}' && e.respuestas)), alertas: alertas_(e, m, an) };
      })
    };
  },
  entrega: (u, d) => {
    soloProfe_(u);
    const t = buscar_('Tareas', d.tareaId), s = buscar_('Usuarios', d.userId);
    if (!t || !s) throw new Error('No encontrada.');
    const e = tabla_('Entregas').find(x => x.tareaId === t.id && x.userId === s.id);
    return {
      estudiante: { id: s.id, nombre: nombreDe_(s), dni: s.dni },
      tarea: { id: t.id, tipo: t.tipo, titulo: t.titulo, notaMaxima: Number(t.notaMaxima) || CONFIG.NOTA_MAXIMA, preguntas: json_(t.preguntas, []) },
      entrega: e ? { id: e.id, texto: e.texto, archivos: json_(e.archivos, []).map(f => Object.assign(f, { url: 'https://drive.google.com/file/d/' + f.id + '/view' })), respuestas: json_(e.respuestas, {}), metricas: json_(e.metricas, {}), fecha: Number(e.fecha) || 0, nota: e.nota !== '' ? Number(e.nota) : null, comentario: e.comentario, revisada: e.revisada === '1', analisis: json_(e.analisis, {}) } : null
    };
  },
  calificar: (u, d) => conBloqueo_(() => {
    soloProfe_(u); const t = buscar_('Tareas', d.tareaId); if (!t) throw new Error('Tarea no encontrada.');
    const max = Number(t.notaMaxima) || CONFIG.NOTA_MAXIMA, nota = d.nota === '' || d.nota === null || d.nota === undefined ? '' : Number(d.nota);
    if (nota !== '' && (isNaN(nota) || nota < 0 || nota > max)) throw new Error('La nota debe estar entre 0 y ' + max + '.');
    let e = tabla_('Entregas').find(x => x.tareaId === t.id && x.userId === d.userId);
    const archivos = (d.archivos || []).map(f => ({ id: String(f.id), nombre: String(f.nombre || ''), mime: String(f.mime || ''), tamano: Number(f.tamano) || 0 }));
    if (!e) e = insertar_('Entregas', { id: nuevoId_(), tareaId: t.id, aulaId: t.aulaId, userId: d.userId, texto: '', archivos: '[]', respuestas: '{}', metricas: '{}', fecha: ahora_(), nota: '', comentario: '', revisada: '0', analisis: '' }) && tabla_('Entregas').find(x => x.tareaId === t.id && x.userId === d.userId);
    if (archivos.length) e.archivos = JSON.stringify(json_(e.archivos, []).concat(archivos));
    e.nota = nota === '' ? '' : String(nota); e.comentario = String(d.comentario || ''); e.revisada = nota === '' ? '0' : '1';
    actualizar_('Entregas', e); return true;
  }),
  analizarTarea: (u, d) => { soloProfe_(u); return analizar_(d.tareaId, Number(d.limiteIA) || 8); },

  /* ---------- Profesor: estudiantes ---------- */
  estudiantes: (u, d) => {
    soloProfe_(u);
    const q = String(d.q || '').trim().toLowerCase(), aulas = tabla_('Aulas'), mats = tabla_('Matriculas');
    return tabla_('Usuarios').filter(x => x.rol === 'estudiante').filter(x => !q || [x.dni, x.nombres, x.apellidos, x.correo, x.celular].join(' ').toLowerCase().indexOf(q) >= 0 || (x.apellidos + ' ' + x.nombres).toLowerCase().indexOf(q) >= 0)
      .filter(x => !d.aulaId || mats.some(m => m.userId === x.id && m.aulaId === d.aulaId && m.estado === 'activo'))
      .sort((a, b) => nombreDe_(a).localeCompare(nombreDe_(b)))
      .slice(0, 300)
      .map(x => ({ id: x.id, nombre: nombreDe_(x), dni: x.dni, correo: x.correo, celular: x.celular, estado: x.estado, ultimoAcceso: Number(x.ultimoAcceso) || 0, minutos: Number(x.minutos) || 0, aulas: mats.filter(m => m.userId === x.id && m.estado === 'activo').map(m => { const a = aulas.find(y => y.id === m.aulaId); return a ? a.nombre : ''; }).filter(Boolean) }));
  },
  estudiante: (u, d) => {
    soloProfe_(u); const s = buscar_('Usuarios', d.id); if (!s) throw new Error('No encontrado.');
    const aulas = tabla_('Aulas'), sedes = tabla_('Sedes');
    return {
      datos: Object.assign(publico_(s), { creado: Number(s.creado), ultimoAcceso: Number(s.ultimoAcceso) || 0, minutos: Number(s.minutos) || 0 }),
      matriculas: tabla_('Matriculas').filter(m => m.userId === s.id).map(m => { const a = aulas.find(y => y.id === m.aulaId) || {}; const se = sedes.find(y => y.id === a.sedeId) || {}; return { aulaId: m.aulaId, aula: a.nombre, sede: se.nombre, estado: m.estado, fecha: Number(m.fecha) }; }),
      notas: notasDe_(s.id)
    };
  },
  restablecerClave: (u, d) => {
    soloProfe_(u); const s = buscar_('Usuarios', d.id); validarClave_(d.clave);
    s.salt = Utilities.getUuid(); s.hash = hash_(String(d.clave), s.salt); s.debeCambiarClave = '1'; actualizar_('Usuarios', s); return true;
  },
  entrarComo: (u, d) => { soloProfe_(u); const s = buscar_('Usuarios', d.id); if (!s) throw new Error('No encontrado.'); return { token: crearSesion_(s, u.id), usuario: Object.assign(publico_(s), { imp: true }) }; },
  estadoCuenta: (u, d) => { soloProfe_(u); const s = buscar_('Usuarios', d.id); s.estado = d.estado === 'bloqueado' ? 'bloqueado' : 'activo'; actualizar_('Usuarios', s); return true; },
  editarEstudiante: (u, d) => {
    soloProfe_(u); const s = buscar_('Usuarios', d.id);
    ['nombres', 'apellidos', 'celular', 'correo', 'dni'].forEach(k => { if (d[k] !== undefined && String(d[k]).trim()) s[k] = String(d[k]).trim(); });
    actualizar_('Usuarios', s); return true;
  },
  matricular: (u, d) => conBloqueo_(() => {
    soloProfe_(u); const s = tabla_('Usuarios').find(x => x.dni === String(d.dni || '').trim() || x.id === d.userId);
    if (!s) throw new Error('No hay ningún estudiante registrado con ese DNI. Pídele que se registre con el código del aula.');
    const m = tabla_('Matriculas').find(x => x.aulaId === d.aulaId && x.userId === s.id);
    if (m) { m.estado = 'activo'; actualizar_('Matriculas', m); } else insertar_('Matriculas', { id: nuevoId_(), aulaId: d.aulaId, userId: s.id, fecha: ahora_(), estado: 'activo' });
    return { nombre: nombreDe_(s) };
  }),
  retirar: (u, d) => { soloProfe_(u); const m = tabla_('Matriculas').find(x => x.aulaId === d.aulaId && x.userId === d.userId); if (m) { m.estado = 'retirado'; actualizar_('Matriculas', m); } return true; },

  /* ---------- Profesor: notas y reportes ---------- */
  notasAula: (u, d) => { soloProfe_(u); return matrizNotas_(d.aulaId); },
  comparativo: u => {
    soloProfe_(u);
    return tabla_('Sedes').map(s => ({
      sedeId: s.id, sede: s.nombre,
      aulas: tabla_('Aulas').filter(a => a.sedeId === s.id && a.estado !== 'archivada').map(a => {
        const m = matrizNotas_(a.id), proms = m.filas.map(f => f.promedio).filter(x => x !== null);
        return { id: a.id, aula: a.nombre, estudiantes: m.filas.length, promedio: proms.length ? red_(proms.reduce((x, y) => x + y, 0) / proms.length) : null, aprobados: proms.filter(x => x >= CONFIG.NOTA_MAXIMA * 0.55).length, desaprobados: proms.filter(x => x < CONFIG.NOTA_MAXIMA * 0.55).length, entregas: m.tasaEntrega };
      })
    }));
  },
  exportarNotas: (u, d) => {
    soloProfe_(u);
    const aulas = tabla_('Aulas').filter(a => a.estado !== 'archivada' && (!d.aulaId || a.id === d.aulaId) && (!d.sedeId || a.sedeId === d.sedeId));
    if (!aulas.length) throw new Error('No hay aulas para exportar.');
    const nombre = 'Notas ' + (d.aulaId ? aulas[0].nombre : d.sedeId ? (buscar_('Sedes', d.sedeId) || {}).nombre : 'todas las aulas') + ' ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH-mm');
    const ss = SpreadsheetApp.create(nombre), sedes = tabla_('Sedes');
    const resumen = [['Sede', 'Aula', 'DNI', 'Estudiante', 'Promedio']];
    aulas.forEach((a, i) => {
      const m = matrizNotas_(a.id), sh = i === 0 ? ss.getSheets()[0] : ss.insertSheet();
      sh.setName(a.nombre.slice(0, 90).replace(/[\[\]\*\?\/\\:]/g, '-') + (i ? ' ' + (i + 1) : ''));
      const cab = ['DNI', 'Estudiante'].concat(m.tareas.map(t => t.titulo + ' (/' + t.notaMaxima + ', peso ' + t.peso + ')')).concat(['Promedio (/' + CONFIG.NOTA_MAXIMA + ')']);
      const filas = m.filas.map(f => [f.dni, f.nombre].concat(f.notas.map(n => n === null ? '' : n)).concat([f.promedio === null ? '' : f.promedio]));
      sh.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight('bold');
      if (filas.length) sh.getRange(2, 1, filas.length, cab.length).setValues(filas);
      sh.setFrozenRows(1);
      const se = sedes.find(s => s.id === a.sedeId) || {};
      m.filas.forEach(f => resumen.push([se.nombre || '', a.nombre, f.dni, f.nombre, f.promedio === null ? '' : f.promedio]));
    });
    if (aulas.length > 1) { const sh = ss.insertSheet('Resumen', 0); sh.getRange(1, 1, resumen.length, 5).setValues(resumen); sh.getRange(1, 1, 1, 5).setFontWeight('bold'); sh.setFrozenRows(1); }
    SpreadsheetApp.flush();
    const archivo = DriveApp.getFileById(ss.getId()); archivo.moveTo(carpetaHija_(raiz_(), 'Reportes de notas'));
    const r = UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=xlsx', { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    return { nombre: nombre + '.xlsx', b64: r.getResponseCode() === 200 ? Utilities.base64Encode(r.getContent()) : '', url: ss.getUrl() };
  },
  configIA: (u, d) => {
    soloProfe_(u); const p = PropertiesService.getScriptProperties();
    if (d.quitar) p.deleteProperty('ANTHROPIC_API_KEY'); else if (d.clave) p.setProperty('ANTHROPIC_API_KEY', String(d.clave).trim());
    return { activa: !!p.getProperty('ANTHROPIC_API_KEY') };
  }
};

/* ======================= Utilidades de negocio ======================= */

function raiz_() { return DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('ROOT_ID')); }
function carpetaHija_(padre, nombre) { const it = padre.getFoldersByName(nombre); return it.hasNext() ? it.next() : padre.createFolder(nombre); }
function estudiantesDeAula_(aulaId) {
  const ids = tabla_('Matriculas').filter(m => m.aulaId === aulaId && m.estado === 'activo').map(m => m.userId);
  return tabla_('Usuarios').filter(x => ids.indexOf(x.id) >= 0).sort((a, b) => nombreDe_(a).localeCompare(nombreDe_(b)));
}
/** Carpeta: Sede / Aula / Material  ó  Sede / Aula / Estudiantes / Apellidos Nombres - DNI / Tarea */
function carpetaDestino_(u, d) {
  if (d.destino === 'material') { soloProfe_(u); const a = buscar_('Aulas', d.aulaId); return carpetaHija_(DriveApp.getFolderById(a.carpetaId), 'Material'); }
  const t = buscar_('Tareas', d.tareaId); if (!t) throw new Error('Tarea no encontrada.');
  let est = u;
  if (u.rol === 'profesor') { est = buscar_('Usuarios', d.userId); if (!est) throw new Error('Elige el estudiante.'); }
  else if (!matriculado_(u, t.aulaId)) throw new Error('No tienes acceso a esta tarea.');
  const a = buscar_('Aulas', t.aulaId);
  const ests = carpetaHija_(DriveApp.getFolderById(a.carpetaId), 'Estudiantes');
  const cEst = carpetaHija_(ests, (nombreDe_(est) + ' - ' + est.dni).replace(/[\/\\]/g, '-'));
  return carpetaHija_(cEst, t.titulo.replace(/[\/\\]/g, '-').slice(0, 100));
}
function red_(x) { return Math.round(x * 100) / 100; }
function matrizNotas_(aulaId) {
  const tareas = tabla_('Tareas').filter(t => t.aulaId === aulaId).sort((a, b) => a.creado - b.creado);
  const ents = tabla_('Entregas').filter(e => e.aulaId === aulaId), est = estudiantesDeAula_(aulaId);
  let entregadas = 0, posibles = 0;
  const filas = est.map(s => {
    let suma = 0, pesos = 0;
    const notas = tareas.map(t => {
      const e = ents.find(x => x.tareaId === t.id && x.userId === s.id);
      if (t.tipo !== 'parcial' && t.tipo !== 'final') { posibles++; if (e && (e.texto || json_(e.archivos, []).length || (e.respuestas && e.respuestas !== '{}'))) entregadas++; }
      if (!e || e.revisada !== '1' || e.nota === '') return null;
      const n = Number(e.nota), max = Number(t.notaMaxima) || CONFIG.NOTA_MAXIMA, p = Number(t.peso) || 1;
      suma += n / max * CONFIG.NOTA_MAXIMA * p; pesos += p; return n;
    });
    return { userId: s.id, dni: s.dni, nombre: nombreDe_(s), notas: notas, promedio: pesos ? red_(suma / pesos) : null };
  });
  return { tareas: tareas.map(t => ({ id: t.id, titulo: t.titulo, tipo: t.tipo, notaMaxima: Number(t.notaMaxima) || CONFIG.NOTA_MAXIMA, peso: Number(t.peso) || 1 })), filas: filas, tasaEntrega: posibles ? Math.round(entregadas / posibles * 100) : null };
}
function notasDe_(userId) {
  const aulas = tabla_('Aulas'), sedes = tabla_('Sedes');
  return tabla_('Matriculas').filter(m => m.userId === userId && m.estado === 'activo').map(m => {
    const a = aulas.find(x => x.id === m.aulaId); if (!a) return null;
    const mz = matrizNotas_(a.id), f = mz.filas.find(x => x.userId === userId);
    const ents = tabla_('Entregas').filter(e => e.aulaId === a.id && e.userId === userId);
    return {
      aulaId: a.id, aula: a.nombre, sede: (sedes.find(s => s.id === a.sedeId) || {}).nombre || '', promedio: f ? f.promedio : null,
      items: mz.tareas.map((t, i) => { const e = ents.find(x => x.tareaId === t.id); return { titulo: t.titulo, tipo: t.tipo, notaMaxima: t.notaMaxima, peso: t.peso, nota: f ? f.notas[i] : null, fecha: e ? Number(e.fecha) : 0, comentario: e && e.revisada === '1' ? e.comentario : '' }; })
    };
  }).filter(Boolean);
}

/* ======================= Detección de copia y de IA ======================= */

function alertas_(e, m, an) {
  const out = [];
  if (!e) return out;
  const largo = (e.texto || '').length;
  if (m && largo > 40 && m.pegado) { const p = Math.min(100, Math.round(m.pegado / largo * 100)); if (p >= 30) out.push({ tipo: 'pegado', nivel: p >= 70 ? 'alto' : 'medio', texto: 'Pegó ' + p + '% del texto' }); }
  if (m && largo > 300 && m.ms && (m.tecleado || 0) > largo * 0.6 && largo / (m.ms / 60000) > 600) out.push({ tipo: 'rapido', nivel: 'medio', texto: 'Escribió muy rápido (' + Math.round(largo / (m.ms / 60000)) + ' letras/min)' });
  if (an && an.similitud >= 35) out.push({ tipo: 'similitud', nivel: an.similitud >= 60 ? 'alto' : 'medio', texto: an.similitud + '% igual a ' + an.conQuien });
  if (an && an.ia && an.ia.nivel && an.ia.nivel !== 'baja') out.push({ tipo: 'ia', nivel: an.ia.nivel === 'alta' ? 'alto' : 'medio', texto: 'Posible texto de IA (' + an.ia.nivel + ')' });
  return out;
}
function textoDeEntrega_(e) {
  const r = json_(e.respuestas, {});
  return [e.texto || ''].concat(Object.keys(r).map(k => typeof r[k] === 'string' && r[k].length > 25 ? r[k] : '')).join('\n').trim();
}
function normaliza_(t) { return String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9ñ\s]/g, ' ').split(/\s+/).filter(Boolean); }
function tejas_(pal, n) { const s = {}; for (let i = 0; i + n <= pal.length; i++) s[pal.slice(i, i + n).join(' ')] = 1; return s; }
function analizar_(tareaId, limiteIA) {
  const t = buscar_('Tareas', tareaId); if (!t) throw new Error('Tarea no encontrada.');
  const ents = tabla_('Entregas').filter(e => e.tareaId === t.id), us = tabla_('Usuarios');
  const datos = ents.map(e => { const tx = textoDeEntrega_(e), p = normaliza_(tx); return { e: e, texto: tx, pal: p, tj: tejas_(p, 5) }; }).filter(x => x.pal.length >= 15);
  const key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  let usadasIA = 0, pendientesIA = 0;
  datos.forEach(a => {
    let mejor = 0, quien = '', frases = [];
    const na = Object.keys(a.tj).length;
    datos.forEach(b => {
      if (a === b) return;
      const nb = Object.keys(b.tj).length, comunes = Object.keys(a.tj).filter(k => b.tj[k]);
      const sim = Math.round(comunes.length / Math.max(1, Math.min(na, nb)) * 100);
      if (sim > mejor) { mejor = sim; quien = nombreDe_(us.find(x => x.id === b.e.userId)); frases = comunes.slice(0, 4); }
    });
    const prev = json_(a.e.analisis, {});
    const an = { similitud: mejor, conQuien: quien, frases: frases, fecha: Date.now(), ia: prev.ia && prev.iaFecha >= Number(a.e.fecha) ? prev.ia : null, iaFecha: prev.iaFecha || 0 };
    if (!an.ia && key && a.pal.length >= 60) {
      if (usadasIA < limiteIA) { an.ia = detectarIA_(key, t, a.texto); an.iaFecha = Date.now(); usadasIA++; } else pendientesIA++;
    }
    if (!an.ia) an.ia = indiciosLocales_(a.texto, json_(a.e.metricas, {}));
    a.e.analisis = JSON.stringify(an); actualizar_('Entregas', a.e);
  });
  return { analizadas: datos.length, pendientesIA: pendientesIA, iaActiva: !!key };
}
/** Sin API: solo indicios del texto (variedad del largo de las oraciones y muletillas típicas). */
function indiciosLocales_(texto, m) {
  const or = texto.split(/[.!?]+\s/).map(s => s.trim().split(/\s+/).length).filter(n => n > 2);
  if (or.length < 4) return { nivel: 'baja', razones: ['Texto corto: no hay suficientes datos.'], fuente: 'local' };
  const media = or.reduce((a, b) => a + b, 0) / or.length, cv = Math.sqrt(or.reduce((a, b) => a + (b - media) * (b - media), 0) / or.length) / media;
  const muletillas = (texto.toLowerCase().match(/en conclusi[oó]n|cabe destacar|es importante (destacar|mencionar|se[ñn]alar)|en resumen|en el [aá]mbito de|juega un papel (fundamental|crucial)|en la actualidad|a lo largo de la historia/g) || []).length;
  let pts = 0; const razones = [];
  if (cv < 0.35) { pts++; razones.push('Oraciones de largo muy parejo.'); }
  if (muletillas >= 2) { pts++; razones.push('Frases de relleno típicas de textos generados (' + muletillas + ').'); }
  if (m && m.pegado && texto.length && m.pegado / texto.length > 0.7) { pts++; razones.push('Casi todo el texto fue pegado.'); }
  return { nivel: pts >= 2 ? 'media' : 'baja', razones: razones.length ? razones : ['Sin indicios claros.'], fuente: 'local' };
}
/** Con API de Claude: devuelve un indicio con razones, nunca una prueba. */
function detectarIA_(key, t, texto) {
  const cuerpo = {
    model: CONFIG.MODELO_IA, max_tokens: 2000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: { type: 'object', properties: { nivel: { type: 'string', enum: ['baja', 'media', 'alta'] }, razones: { type: 'array', items: { type: 'string' } } }, required: ['nivel', 'razones'], additionalProperties: false } } },
    fallbacks: 'default',
    system: 'Eres un asistente que ayuda a un profesor a revisar respuestas de estudiantes adultos. Estima qué tan probable es que el texto haya sido generado con IA y no escrito por el estudiante. Ningún detector es confiable: sé prudente, usa "alta" solo con señales muy claras y nunca afirmes que hubo trampa. Da hasta 3 razones breves en español, basadas en rasgos concretos del texto.',
    messages: [{ role: 'user', content: 'Consigna de la tarea: ' + (t.consigna || t.titulo).slice(0, 2000) + '\n\nRespuesta del estudiante:\n"""\n' + texto.slice(0, 12000) + '\n"""' }]
  };
  try {
    const r = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post', contentType: 'application/json', payload: JSON.stringify(cuerpo), muteHttpExceptions: true,
      headers: { 'x-api-key': key, 'anthropic-version': '2026-10-21', 'anthropic-beta': 'server-side-fallback-2026-07-01' }
    });
    const j = JSON.parse(r.getContentText());
    if (r.getResponseCode() !== 200) return { nivel: 'baja', razones: ['No se pudo consultar la IA: ' + ((j.error && j.error.message) || r.getResponseCode())], fuente: 'error' };
    if (j.stop_reason === 'refusal') return { nivel: 'baja', razones: ['La IA no evaluó este texto.'], fuente: 'error' };
    const txt = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const o = JSON.parse(txt);
    return { nivel: o.nivel, razones: (o.razones || []).slice(0, 3), fuente: 'claude' };
  } catch (e) {
    return { nivel: 'baja', razones: ['No se pudo consultar la IA.'], fuente: 'error' };
  }
}
