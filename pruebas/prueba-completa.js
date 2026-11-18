const { chromium, devices } = require('playwright'); const { crearEntorno } = require('./simulador-google.js'); const path = require('path'), os = require('os'); const fs = require('fs');
const SP = fs.mkdtempSync(path.join(os.tmpdir(), 'aula-')), HTML = 'file://' + SP_HTML();
// Google Apps Script borra todo lo que hay entre /* y */ en el HTML (aunque esté dentro de un texto).
// Se imita aquí para que la prueba falle si el código vuelve a tener esas secuencias dentro de textos.
function SP_HTML() { const src = fs.readFileSync(path.join(__dirname, '../apps-script/Index.html'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''); const f = path.join(SP, 'Index.html'); fs.writeFileSync(f, src); return f; }
fs.writeFileSync(SP + '/tarea.pdf', '%PDF-1.4\n%%EOF\n'); fs.writeFileSync(SP + '/video.mp4', require('crypto').randomBytes(9 * 1024 * 1024 + 123)); fs.writeFileSync(SP + '/examen.jpg', Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64'));
const E = crearEntorno(path.join(__dirname, '../apps-script/Codigo.gs')); E.ctx.__instalar();
const errs = [], log = (...a) => console.log('✓', ...a);
async function nueva(b, nombre) {
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  await ctx.exposeFunction('__api', (a, t, d) => JSON.parse(JSON.stringify(E.ctx.__api(a, t, JSON.parse(JSON.stringify(d || {}))))));
  await ctx.addInitScript(() => {
    const mk = (ok, ko) => ({ withSuccessHandler: f => mk(f, ko), withFailureHandler: f => mk(ok, f), api: (a, t, d) => window.__api(a, t, d).then(ok, e => ko && ko(e)) });
    window.google = { script: { run: mk(() => {}, () => {}) } };
  });
  const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(nombre + ': ' + e.message)); pg.on('dialog', d => d.accept());
  await pg.goto(HTML); await pg.waitForSelector('#lUser'); return pg;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function shot(pg, n) { await pg.screenshot({ path: `${SP}/${n}.png`, fullPage: true }); }
(async () => {
  const b = await chromium.launch();
  // ---- Profesor
  const P = await nueva(b, 'profe');
  await P.fill('#lUser', '00000000'); await P.fill('#lClave', 'Cambiar.2026'); await P.click('#fLogin button[type=submit]');
  await P.waitForSelector('#cN'); await P.fill('#cA', 'Cambiar.2026'); await P.fill('#cN', 'Profe.2026'); await P.fill('#cN2', 'Profe.2026'); await P.click('#fClave button');
  await P.waitForSelector('text=Sedes y aulas'); log('profe entra y cambia clave');
  await P.click('text=+ Sede'); await P.fill('#sNom', 'Sede Centro'); await P.click('#fSede button[type=submit]'); await P.waitForSelector('text=+ Aula');
  await P.click('text=+ Aula'); await P.fill('#aNom', 'Matemática I'); await P.click('#fAula button[type=submit]'); await P.waitForSelector('text=Matemática I');
  const codigo = (await P.textContent('.item .muted')).match(/código (\w+)/)[1]; log('sede y aula creadas, código', codigo);
  await P.click('text=Matemática I'); await P.waitForSelector('text=+ Nueva tarea o examen');
  // tareas
  async function nuevaTarea(tipo, titulo, extra) { await P.click('text=+ Nueva tarea o examen'); await P.waitForSelector('#tTipo'); await P.selectOption('#tTipo', tipo); await P.fill('#tTit', titulo); await P.fill('#tCon', 'Consigna de ' + titulo); if (extra) await extra(); await P.click('#fTar button[type=submit]'); await P.waitForSelector('text=' + titulo); }
  await nuevaTarea('foro', 'Opinión sobre la lectura');
  await nuevaTarea('formulario', 'Quiz 1', async () => { await P.click('#qAdd'); await P.fill('.qTxt', '¿Cuánto es 2+2?'); await P.fill('.qOps', '3\n4\n5'); await P.fill('.qCor', '2'); await P.click('#qAdd'); await P.fill('.q[data-i="1"] .qTxt', '¿Capital del Perú?'); await P.fill('.q[data-i="1"] .qOps', 'Lima\nCusco'); await P.fill('.q[data-i="1"] .qCor', '1'); });
  await nuevaTarea('archivo', 'Video de exposición');
  await nuevaTarea('parcial', 'Examen parcial');
  log('4 tareas creadas');
  await P.click('.tabs >> text=Material'); await P.fill('#mTit', 'Separata semana 1'); await P.setInputFiles('#mFile', SP + '/tarea.pdf'); await P.click('#mSubir'); await P.waitForSelector('text=Separata semana 1'); log('material PDF subido');
  await shot(P, 'p1-aula');
  // ---- Estudiantes
  const textos = {
    ana: 'La lectura me hizo pensar en cómo usamos los números en la vida diaria. Cuando voy al mercado calculo los precios y comparo ofertas sin darme cuenta. Me pareció interesante la parte de los porcentajes porque siempre me confundían. Ahora entiendo mejor cómo funcionan los descuentos.',
    beto: 'La lectura me hizo pensar en cómo usamos los números en la vida diaria. Cuando voy al mercado calculo los precios y comparo ofertas sin darme cuenta. Me pareció muy interesante la parte de los porcentajes. Ahora entiendo mejor los descuentos de las tiendas.',
    carla: 'En conclusión, cabe destacar que las matemáticas juegan un papel fundamental en la actualidad. Es importante destacar que su aplicación en la vida cotidiana es crucial. En resumen, los porcentajes permiten comprender fenómenos económicos de manera precisa. A lo largo de la historia, el ser humano ha utilizado los números para organizar su entorno.'
  };
  const dnis = { ana: '45678912', beto: '01234567', carla: '70707070' };
  for (const k of Object.keys(textos)) {
    const S = await nueva(b, k);
    await S.click('text=Crear mi cuenta'); await S.fill('#rDni', dnis[k]); await S.fill('#rNom', k[0].toUpperCase() + k.slice(1)); await S.fill('#rApe', 'Pérez ' + k); await S.fill('#rCel', '987654321'); await S.fill('#rCor', k + '@correo.com'); await S.fill('#rC1', 'clave123'); await S.fill('#rC2', 'clave123'); await S.fill('#rCod', codigo);
    await S.click('#fReg button[type=submit]'); await S.waitForSelector('text=Matemática I'); await S.click('text=Matemática I'); await S.waitForSelector('text=Opinión sobre la lectura');
    await S.click('text=Opinión sobre la lectura'); await S.waitForSelector('#eTxt');
    if (k === 'carla') { await S.focus('#eTxt'); await S.evaluate(t => { const ta = document.querySelector('#eTxt'); const dt = new DataTransfer(); dt.setData('text/plain', t); ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true })); ta.value = t; }, textos[k]); }
    else await S.type('#eTxt', textos[k], { delay: 0 });
    await S.click('#fEnt button[type=submit]'); await S.waitForSelector('text=/✓ Entregado|Tu entrega/');
    await S.click('.back'); await S.click('text=Quiz 1'); await S.waitForSelector('.q');
    await S.check(`input[name^="q_"][value="${k === 'beto' ? 0 : 1}"] >> nth=0`); await S.check('.q >> nth=1 >> input[value="0"]');
    await S.click('#fEnt button[type=submit]'); await S.waitForSelector('text=/✓ Entregado|Tu entrega/');
    if (k === 'ana') { await S.click('.back'); await S.click('text=Video de exposición'); await S.setInputFiles('#eFiles', SP + '/video.mp4'); await S.click('#fEnt button[type=submit]'); await S.waitForSelector('text=/✓ Entregado|Tu entrega/', { timeout: 60000 }); log('ana subió video de 9 MB por partes'); await shot(S, 'e-ana-video'); }
    if (k === 'beto') { await S.click('.back'); await S.click('.tabs >> text=Material'); const [pop] = await Promise.all([S.waitForEvent('popup', { timeout: 5000 }).catch(() => null), S.click('text=Abrir')]); log('beto abre material', pop ? 'en pestaña nueva' : 'descarga'); }
    await S.context().close();
  }
  log('3 estudiantes registrados y entregaron');
  // ---- Profe revisa
  await P.click('.tabs >> text=Tareas'); await P.click('text=Opinión sobre la lectura'); await P.waitForSelector('#bAnal');
  await P.click('#bAnal'); await sleep(600); await P.waitForSelector('.pill.bad, .pill.warn');
  const alertas = await P.$$eval('.item', els => els.map(e => e.innerText.replace(/\n+/g, ' | ')));
  console.log(alertas); await shot(P, 'p2-revision');
  await P.click('.item >> nth=2'); await P.waitForSelector('#cNota'); await shot(P, 'p3-entrega');
  console.log((await P.textContent('.card >> nth=1')).replace(/\s+/g, ' ').slice(0, 400));
  await P.fill('#cNota', '15'); await P.fill('#cCom', 'Bien, pero usa tus palabras.'); await P.click('#fCal button[type=submit]'); await P.waitForSelector('#bAnal'); log('nota guardada');
  await P.click('.back'); await P.click('text=Examen parcial'); await P.click('.item >> nth=0'); await P.setInputFiles('#cFotos', SP + '/examen.jpg'); await P.fill('#cNota', '17'); await P.click('#fCal button[type=submit]'); await P.waitForSelector('text=Toca a cada estudiante'); log('examen con foto y nota');
  await P.click('.back'); await P.click('.tabs >> text=Notas'); await P.waitForSelector('table'); console.log((await P.textContent('table')).replace(/\s+/g, ' ')); await shot(P, 'p4-notas');
  await P.click('text=Descargar Excel'); await P.waitForSelector('text=Reporte listo'); log('excel exportado'); await P.click('text=Cerrar');
  await P.click('.tabs >> text=Estudiantes'); await P.waitForSelector('text=Retirar');
  await P.click('.nav >> text=Estudiantes'); await P.waitForSelector('#bQ'); await P.fill('#bQ', '0123'); await P.click('#fBus button'); await sleep(300); console.log('búsqueda:', (await P.textContent('#lEst')).replace(/\s+/g, ' ').slice(0, 120));
  await P.click('#lEst .item'); await P.waitForSelector('#bClave'); await shot(P, 'p5-estudiante');
  await P.click('#bClave'); await P.click('#fRc button[type=submit]'); await P.waitForSelector('text=Entendido'); const nueva_ = await P.textContent('p[style*="user-select"]'); await P.click('text=Entendido'); log('clave restablecida', nueva_);
  await P.click('#bComo'); await P.waitForSelector('#imp:not([hidden])'); log('entrar como:', (await P.textContent('#imp')).trim().slice(0, 50)); await P.click('#imp button'); await P.waitForSelector('#bQ');
  await P.click('.nav >> text=Notas'); await P.waitForSelector('text=Notas y comparativos'); await shot(P, 'p6-comparativo');
  console.log('comparativo:', (await P.textContent('#app')).replace(/\s+/g, ' ').slice(0, 200));
  // ---- Estudiante ve notas
  const A = await nueva(b, 'ana2'); await A.fill('#lUser', 'ana@correo.com'); await A.fill('#lClave', 'clave123'); await A.click('#fLogin button[type=submit]'); await A.waitForSelector('text=Matemática I');
  await A.click('.nav >> text=Mis notas'); await A.waitForSelector('table'); await shot(A, 'e-notas'); console.log('notas ana:', (await A.textContent('#app')).replace(/\s+/g, ' ').slice(0, 220));
  // ---- Beto con nueva clave
  const B = await nueva(b, 'beto2'); await B.fill('#lUser', '01234567'); await B.fill('#lClave', nueva_.trim()); await B.click('#fLogin button[type=submit]'); await B.waitForSelector('#cN'); log('beto entra con la nueva clave y debe cambiarla');
  // Drive
  console.log('Carpetas en Drive:'); Object.values(E.drive).filter(f => !f._isFolder && f._parent).forEach(f => console.log('  ', E.ruta(f.getId())));
  console.log('ERRORES', errs); await b.close();
})().catch(async e => { console.error('FALLÓ', e.message); console.log('ERRORES', errs); process.exit(1); });
