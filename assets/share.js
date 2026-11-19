/* Slugonomics anonymous results sharing + page counts.
   - Off until assets/config.js has Firebase values (and GoatCounter for page counts).
   - Students opt in once per device. Shared rows hold quiz answers and survey
     ratings only: no name, email, account or IP-derived data is written by this code.
   - Writes go to Firestore "results" (create-only, see firestore.rules). */
(function () {
  const CFG = window.SLUGO_CONFIG || {};
  const ON = !!(CFG.firebaseApiKey && CFG.firebaseProjectId);
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  const K_CONSENT = 'slugShare.consent', K_SENT = 'slugShare.sent', K_DEV = 'slugShare.device';

  function deviceId() {
    let d = LS.get(K_DEV, null);
    if (!d) { d = Array.from(crypto.getRandomValues(new Uint8Array(9)), b => b.toString(36).padStart(2, '0')).join('').slice(0, 16); LS.set(K_DEV, d); }
    return d;
  }
  async function anonId(pid) {
    const data = new TextEncoder().encode(deviceId() + '|' + (pid || 'guest'));
    const h = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(h).slice(0, 10), b => b.toString(16).padStart(2, '0')).join('');
  }

  /* ---------- Firestore REST ---------- */
  function enc(v) {
    if (v == null) return { nullValue: null };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
    if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (typeof v === 'boolean') return { booleanValue: v };
    return { stringValue: String(v) };
  }
  async function write(row) {
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(CFG.firebaseProjectId)}/databases/(default)/documents/results?key=${encodeURIComponent(CFG.firebaseApiKey)}`;
    const fields = {}; Object.keys(row).forEach(k => { if (row[k] !== undefined) fields[k] = enc(row[k]); });
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }), keepalive: true });
    if (!r.ok) throw new Error('write ' + r.status);
  }

  /* ---------- queue ---------- */
  let pending = [];
  async function flush() {
    if (!ON || LS.get(K_CONSENT, null) !== 'yes') return;
    const sent = LS.get(K_SENT, {});
    const todo = pending.splice(0);
    for (const p of todo) {
      if (sent[p.key]) continue;
      try { await write(p.row); sent[p.key] = 1; LS.set(K_SENT, sent); }
      catch (e) { pending.push(p); }
    }
  }
  const ints = a => Array.isArray(a) ? a.map(x => (Number.isInteger(x) ? x : -1)).slice(0, 20) : [];
  const day = () => new Date().toISOString().slice(0, 10);

  /* sync(game, profileId, studyObject, meta)
     studyObject: {pre:{score,of,ans,t}, post:{...}, survey:{learn,rec,change,t}} */
  async function sync(game, pid, v, meta) {
    if (!ON || !v) return;
    meta = meta || {};
    const anon = await anonId(pid);
    const sent = LS.get(K_SENT, {});
    const base = { v: 1, game, anon, day: day(), college: String(meta.college || '').slice(0, 20), year: String(meta.year || '').slice(0, 10) };
    ['pre', 'post'].forEach(ph => {
      const x = v[ph]; if (!x || typeof x.score !== 'number') return;
      const key = `${game}:${anon}:${ph}:${x.t || 0}`;
      if (sent[key] || pending.some(p => p.key === key)) return;
      const key2 = Array.isArray(meta.key) ? meta.key : null;
      const right = key2 && Array.isArray(x.ans) ? key2.map((k, i) => (x.ans[i] === k ? 1 : 0)) : [];
      pending.push({ key, row: { ...base, phase: ph, score: x.score, of: x.of || 0, ans: ints(x.ans), right } });
    });
    if (v.survey && (v.survey.learn || v.survey.rec || v.survey.change)) {
      const s = v.survey, key = `${game}:${anon}:survey:${s.t || 0}`;
      if (!sent[key] && !pending.some(p => p.key === key))
        pending.push({ key, row: { ...base, phase: 'survey', learn: +s.learn || 0, rec: +s.rec || 0, change: String(s.change || '').slice(0, 300) } });
    }
    if (!pending.length) return;
    const c = LS.get(K_CONSENT, null);
    if (c === 'yes') flush();
    else if (c == null) ask();
  }

  /* ---------- consent dialog ---------- */
  const T = {
    en: { h: 'Help prove this works?', p: 'Share your quiz answers and ratings anonymously. No name, no email, nothing that identifies you. It helps us show UCSC whether students actually learn from Slugonomics.', yes: 'Share anonymously', no: 'No thanks', later: 'Not now', on: 'Anonymous result sharing is on', off: 'Anonymous result sharing is off', turnOn: 'Turn on', turnOff: 'Turn off' },
    es: { h: '¿Nos ayudas a demostrar que funciona?', p: 'Comparte tus respuestas y calificaciones de forma anónima. Sin nombre, sin correo, nada que te identifique. Así podemos mostrarle a UCSC si los estudiantes realmente aprenden.', yes: 'Compartir de forma anónima', no: 'No, gracias', later: 'Ahora no', on: 'Compartir resultados anónimos: activado', off: 'Compartir resultados anónimos: desactivado', turnOn: 'Activar', turnOff: 'Desactivar' },
    ko: { h: '효과를 증명하는 데 도와주시겠어요?', p: '퀴즈 답과 평가를 익명으로 공유해 주세요. 이름, 이메일 등 본인을 알 수 있는 정보는 없습니다. 학생들이 실제로 배우는지 UCSC에 보여 주는 데 쓰입니다.', yes: '익명으로 공유', no: '괜찮아요', later: '나중에', on: '익명 결과 공유: 켜짐', off: '익명 결과 공유: 꺼짐', turnOn: '켜기', turnOff: '끄기' },
    zh: { h: '帮我们证明它有效？', p: '匿名分享你的测验答案和评分。不含姓名、邮箱或任何能识别你的信息，用来向 UCSC 说明学生是否真的学到了东西。', yes: '匿名分享', no: '不用了', later: '以后再说', on: '匿名分享结果：已开启', off: '匿名分享结果：已关闭', turnOn: '开启', turnOff: '关闭' }
  };
  const L = () => { const l = (document.documentElement.lang || 'en').slice(0, 2); return T[l] || T.en; };
  let asked = false;
  function ask() {
    if (asked || document.getElementById('slugshare')) return; asked = true;
    const t = L();
    const css = `#slugshare{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:flex-end;justify-content:center;padding:16px;background:rgba(16,37,31,.45);font-family:inherit}
#slugshare .box{background:#fff;color:#22352F;max-width:460px;width:100%;border-radius:18px;padding:24px 24px 20px;box-shadow:0 24px 60px -20px rgba(0,0,0,.45);animation:ssu .25s ease-out}
@media(min-width:640px){#slugshare{align-items:center}}
@keyframes ssu{from{transform:translateY(16px);opacity:0}to{transform:none;opacity:1}}
#slugshare h2{margin:0 0 8px;font-size:1.3rem;line-height:1.2;color:#10251F;font-family:inherit}
#slugshare p{margin:0 0 18px;font-size:.98rem;line-height:1.5}
#slugshare .row{display:flex;gap:10px;flex-wrap:wrap}
#slugshare button{font:inherit;font-weight:700;border-radius:10px;padding:12px 16px;cursor:pointer;border:0}
#slugshare .y{background:#F4C21B;color:#10251F;flex:1 1 auto}
#slugshare .n{background:transparent;color:#10251F;box-shadow:inset 0 0 0 1.5px #CFD9D3}
#slugshare .l{background:none;color:#56665F;padding:12px 6px;margin-left:auto}
#slugshare button:focus-visible{outline:3px solid #10251F;outline-offset:2px}
@media (prefers-reduced-motion:reduce){#slugshare .box{animation:none}}`;
    const w = document.createElement('div'); w.id = 'slugshare';
    w.innerHTML = `<style>${css}</style><div class="box" role="dialog" aria-modal="true" aria-labelledby="ss-h"><h2 id="ss-h">${t.h}</h2><p>${t.p}</p>
<div class="row"><button class="y" type="button">${t.yes}</button><button class="n" type="button">${t.no}</button><button class="l" type="button">${t.later}</button></div></div>`;
    const prev = document.activeElement;
    const close = () => { w.remove(); document.removeEventListener('keydown', onKey, true); if (prev && prev.focus) prev.focus({ preventScroll: true }); };
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    w.querySelector('.y').onclick = () => { LS.set(K_CONSENT, 'yes'); close(); flush(); };
    w.querySelector('.n').onclick = () => { LS.set(K_CONSENT, 'no'); pending = []; close(); };
    w.querySelector('.l').onclick = close;
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(w);
    w.querySelector('.y').focus({ preventScroll: true });
  }

  /* toggle for settings/footers: SlugShare.mountToggle(element) */
  function mountToggle(el) {
    if (!el) return;
    if (!ON) { el.hidden = true; return; }
    const t = L(), on = LS.get(K_CONSENT, null) === 'yes';
    el.hidden = false;
    el.innerHTML = `${on ? t.on : t.off} · <button type="button" class="linkbtn">${on ? t.turnOff : t.turnOn}</button>`;
    el.querySelector('button').onclick = () => { LS.set(K_CONSENT, on ? 'no' : 'yes'); mountToggle(el); if (!on) flush(); };
  }

  /* ---------- page counts (GoatCounter, no cookies) ---------- */
  function counts() {
    if (!CFG.goatcounterCode) return;
    window.goatcounter = { no_onload: true };
    const s = document.createElement('script');
    s.async = true; s.src = 'https://gc.zgo.at/count.js';
    s.setAttribute('data-goatcounter', `https://${CFG.goatcounterCode}.goatcounter.com/count`);
    const hit = () => { try { window.goatcounter.count({ path: location.pathname + (location.hash || '') }); } catch (e) {} };
    s.onload = hit;
    window.addEventListener('hashchange', () => { if (window.goatcounter && window.goatcounter.count) hit(); });
    document.head.appendChild(s);
  }
  counts();

  window.SlugShare = { enabled: ON, sync, mountToggle, flush };
})();
