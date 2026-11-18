// Simulación mínima de los servicios de Google Apps Script para probar Codigo.gs en Node.
const vm = require('vm'), fs = require('fs'), crypto = require('crypto');
function crearEntorno(rutaGs) {
  let n = 0; const id = p => p + (++n) + crypto.randomBytes(3).toString('hex');
  const props = {}, cache = {}, drive = {}, sheetsById = {};
  const toSigned = buf => Array.from(buf).map(b => b > 127 ? b - 256 : b);
  const toBuf = arr => Buffer.from(arr.map(b => b & 255));
  function mkSheet(name) {
    let rows = [];
    const sh = {
      _rows: () => rows, getName: () => name, setName: v => { name = v; return sh; },
      getLastRow: () => rows.length, getMaxRows: () => Math.max(1000, rows.length), getMaxColumns: () => 26, setFrozenRows() {},
      getDataRange: () => ({ getValues: () => rows.length ? rows.map(r => r.slice()) : [[]] }),
      appendRow: r => { rows.push(r.map(v => v)); return sh; },
      deleteRow: i => { rows.splice(i - 1, 1); },
      getRange: (r, c, nr, nc) => ({
        setNumberFormat() { return this; }, setFontWeight() { return this; },
        setValues(v) { for (let i = 0; i < v.length; i++) { while (rows.length < r + i) rows.push([]); for (let j = 0; j < v[i].length; j++) rows[r - 1 + i][c - 1 + j] = v[i][j]; } return this; }
      })
    };
    return sh;
  }
  function mkSS(nombre) {
    const sid = id('ss'), sheets = [mkSheet('Hoja 1')];
    const ss = { getId: () => sid, getUrl: () => 'https://docs.google.com/spreadsheets/d/' + sid, getName: () => nombre,
      getSheetByName: x => sheets.find(s => s.getName() === x) || null, getSheets: () => sheets,
      insertSheet: (x, idx) => { const s = mkSheet(typeof x === 'string' ? x : 'Hoja ' + (sheets.length + 1)); if (typeof idx === 'number') sheets.splice(idx, 0, s); else sheets.push(s); return s; },
      deleteSheet: s => sheets.splice(sheets.indexOf(s), 1) };
    sheetsById[sid] = ss; drive[sid] = mkFile(sid, nombre, 'application/vnd.google-apps.spreadsheet', Buffer.alloc(0));
    return ss;
  }
  function mkFile(fid, name, mime, bytes, parent) {
    return { _bytes: bytes, _parent: parent, _trash: false, getId: () => fid, getName: () => name, getSize: () => bytes.length, getMimeType: () => mime,
      getBlob: () => ({ getBytes: () => toSigned(bytes) }), moveTo(f) { this._parent = f.getId(); }, setTrashed(v) { this._trash = v; } };
  }
  function mkFolder(name, parent) {
    const fid = id('fo'), f = { _parent: parent, getId: () => fid, getUrl: () => 'https://drive.google.com/drive/folders/' + fid, getName: () => name, setName: v => { name = v; },
      createFolder: x => mkFolder(x, fid),
      getFoldersByName: x => { const l = Object.values(drive).filter(d => d._isFolder && d._parent === fid && d.getName() === x); let i = 0; return { hasNext: () => i < l.length, next: () => l[i++] }; } };
    f._isFolder = true; drive[fid] = f; return f;
  }
  const uploads = {};
  const ctx = {
    console, JSON, Math, Date, String, Number, Object, Array, Error, RegExp, isNaN, parseInt, encodeURIComponent,
    Logger: { log: (...a) => console.log('[Logger]', ...a) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = String(v); }, deleteProperty: k => { delete props[k]; } }) },
    SpreadsheetApp: { create: mkSS, openById: x => sheetsById[x], flush() {} },
    DriveApp: { createFolder: x => mkFolder(x, 'root'), getFolderById: x => drive[x], getFileById: x => { if (!drive[x]) throw new Error('No existe ' + x); return drive[x]; } },
    CacheService: { getScriptCache: () => ({ get: k => { const c = cache[k]; return c && c.exp > Date.now() ? c.v : null; }, put: (k, v, s) => { cache[k] = { v: String(v), exp: Date.now() + (s || 600) * 1000 }; }, remove: k => { delete cache[k]; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Session: { getScriptTimeZone: () => 'America/Lima' },
    ScriptApp: { getOAuthToken: () => 'TOKEN' },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, data) => toSigned(crypto.createHash(alg).update(typeof data === 'string' ? Buffer.from(data, 'utf8') : toBuf(data)).digest()),
      base64Encode: b => toBuf(b).toString('base64'), base64Decode: s => toSigned(Buffer.from(s, 'base64')),
      newBlob: s => ({ getBytes: () => toSigned(Buffer.from(s, 'utf8')) }),
      formatDate: d => d.toISOString().slice(0, 16).replace('T', ' ')
    },
    UrlFetchApp: {
      fetch(url, o) {
        const resp = (code, body, headers) => ({ getResponseCode: () => code, getContentText: () => typeof body === 'string' ? body : JSON.stringify(body), getContent: () => toSigned(Buffer.from('PK-xlsx-falso')), getHeaders: () => headers || {} });
        if (url.indexOf('uploadType=resumable') >= 0) { const meta = JSON.parse(o.payload), uid = id('up'); uploads[uid] = { meta, total: +o.headers['X-Upload-Content-Length'], mime: o.headers['X-Upload-Content-Type'], parts: [] }; return resp(200, '', { Location: 'https://upload/' + uid }); }
        if (url.startsWith('https://upload/')) {
          const up = uploads[url.split('/').pop()], m = /bytes (\d+)-(\d+)\/(\d+)/.exec(o.headers['Content-Range']);
          up.parts.push(toBuf(o.payload)); const got = up.parts.reduce((s, b) => s + b.length, 0);
          if (+m[1] !== got - toBuf(o.payload).length) return resp(400, 'rango malo');
          if (got < up.total) return resp(308, '');
          const fid = id('fi'); drive[fid] = mkFile(fid, up.meta.name, up.mime, Buffer.concat(up.parts), up.meta.parents[0]); return resp(200, { id: fid });
        }
        if (url.indexOf('/export?format=xlsx') >= 0) return resp(200, 'xlsx');
        return resp(404, 'no simulado: ' + url);
      }
    },
    HtmlService: {}
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(rutaGs, 'utf8') + '\n;globalThis.__api = api; globalThis.__instalar = instalar; globalThis.__CONFIG = CONFIG;', ctx);
  return { ctx, drive, sheetsById, props, ruta: f => { const parts = []; let x = drive[f]; while (x) { parts.unshift(x.getName()); x = drive[x._parent]; } return parts.join(' / '); } };
}
module.exports = { crearEntorno };
