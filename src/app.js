(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
  };
  const toast = msg => { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2200); };
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast('Скопировано'); }
    catch { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast('Скопировано'); } catch { toast('Выдели текст и скопируй вручную'); } ta.remove(); }
  }

  /* ---------- tabs ---------- */
  function showTab(name) {
    document.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === name));
    ['check', 'train', 'sources', 'how'].forEach(t => $('#tab-' + t).hidden = t !== name);
    store.set('tl-tab', name);
    if (name === 'train' && !$('#train').children.length) Trainer.render();
    if (name === 'sources' && !$('#catalog').children.length) renderCatalog();
  }
  document.querySelectorAll('.tab').forEach(b => b.onclick = () => showTab(b.dataset.tab));

  /* ---------- engines state ---------- */
  const eng = { wiki: 'wait' };
  function renderEngines() {
    const row = (st, name, msg) => `<div class="eng"><i class="dot ${st}"></i><span><b>${name}</b> <span class="m">${msg}</span></span></div>`;
    const wikiMsg = { on: 'сверяем числа и даты', off: 'откроется в полной версии сайта', wait: 'проверяем доступ…' }[eng.wiki];
    $('#engines').innerHTML = row('on', 'База фактов', `${TL.FACTS.length} проверенных фактов`) + row('on', 'Математика', 'пересчёт вычислений и процентов') + row('on', 'Признаки выдумки', '10 сигналов и проверка ссылок') + row('on', 'Надёжные источники', `${Object.keys(SRC.S).length} проверенных сайтов по ${SRC.TOPICS.length} темам`) + row(eng.wiki, 'Википедия', wikiMsg);
  }

  async function detectWiki() {
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 4000);
      const r = await fetch('https://ru.wikipedia.org/w/api.php?action=query&meta=siteinfo&format=json&origin=*', { signal: ctl.signal });
      clearTimeout(t); eng.wiki = r.ok ? 'on' : 'off';
    } catch { eng.wiki = 'off'; }
    renderEngines();
    if (eng.wiki === 'on' && state.result) runWiki();
  }
  /* ---------- analysis ---------- */
  const state = { result: null, text: '', filter: 'all', active: null, busy: '' };

  function run() {
    const text = $('#answer').value.trim();
    if (!text) { state.result = null; renderReport(); return; }
    state.text = $('#answer').value;
    state.result = TL.analyze(state.text);
    state.active = null;
    store.set('tl-draft', state.text);
    saveHistory(state.text, $('#q').value, state.result.score.value);
    renderReport();
    renderEngines();
    if (eng.wiki === 'on') runWiki();
  }

  /* history of checks, kept only in this browser */
  function getHistory() { try { return JSON.parse(store.get('tl-hist') || '[]'); } catch { return []; } }
  function saveHistory(text, q, score) {
    const h = getHistory().filter(x => x.text !== text);
    h.unshift({ text, q, score, at: Date.now() });
    store.set('tl-hist', JSON.stringify(h.slice(0, 8)));
    renderHistory();
  }
  function renderHistory() {
    const h = getHistory(), el = $('#history');
    if (!h.length) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = `<span class="lbl">Недавние проверки</span><div class="hist">${h.map((x, i) => `<button type="button" class="hitem" data-h="${i}"><b class="hs ${x.score == null ? '' : x.score >= 80 ? 'high' : x.score >= 55 ? 'mid' : 'low'}">${x.score ?? '–'}</b><span>${esc(x.text.replace(/\s+/g, ' ').slice(0, 70))}…</span><time>${new Date(x.at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</time></button>`).join('')}</div><button type="button" class="linkbtn" id="clearHist">Очистить историю</button>`;
    el.querySelectorAll('[data-h]').forEach(b => b.onclick = () => { const x = h[+b.dataset.h]; $('#answer').value = x.text; $('#q').value = x.q || ''; renderExamples(-1); run(); });
    $('#clearHist').onclick = () => { store.set('tl-hist', null); renderHistory(); };
  }

  /* Wikipedia: confirm numbers and dates that local checks could not */
  const wikiCache = new Map();
  async function wikiFetch(url) {
    if (wikiCache.has(url)) return wikiCache.get(url);
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 7000);
    const p = fetch(url, { signal: ctl.signal }).then(r => r.json()).finally(() => clearTimeout(t));
    wikiCache.set(url, p); return p;
  }
  function variants(x) {
    const r = TL.norm(x.raw), out = new Set([r, r.replace(/ /g, ''), r.replace(',', '.'), r.replace('.', ',')]);
    if (x.v >= 1000 && Number.isInteger(x.v) && x.v < 1e7 && !x.isYear) out.add(x.v.toLocaleString('ru-RU').replace(/ /g, ' '));
    return [...out].filter(v => v.length >= 2);
  }
  function snippet(text, needle) {
    const i = text.toLowerCase().indexOf(needle); if (i < 0) return '';
    const s = Math.max(text.lastIndexOf('. ', i) + 2, i - 160), e = text.indexOf('.', i + needle.length);
    return text.slice(s, e < 0 ? i + 160 : Math.min(e + 1, i + 220)).trim();
  }
  async function runWiki() {
    const res = state.result; if (!res) return;
    const todo = res.claims.filter(c => !c.wikiDone && ['check', 'risk'].includes(c.verdict) && !c.checks.length && TL.numbers(c.n).some(x => x.v >= 10));
    if (!todo.length) return;
    state.busy = 'wiki'; renderReport();
    await Promise.all(todo.slice(0, 8).map(async c => {
      c.wikiDone = true;
      let names = TL.properNouns(c.text); if (!names.length) names = TL.properNouns(c.text, true).slice(0, 1);
      if (c.ctx) names = names.concat(c.ctx.split(' ').filter(Boolean).slice(0, 2));
      if (!names.length) return;
      const lang = /[а-яё]/i.test(c.text) ? 'ru' : 'en';
      const url = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrlimit=1&gsrsearch=${encodeURIComponent(names.slice(0, 3).join(' '))}&prop=extracts|info&inprop=url&explaintext=1`;
      try {
        const j = await wikiFetch(url);
        const page = Object.values((j.query && j.query.pages) || {})[0]; if (!page || !page.extract) return;
        const ext = TL.norm(page.extract).replace(/[  ]/g, ' ');
        const nums = TL.numbers(c.n).filter(x => x.v >= 10);
        const found = nums.filter(x => variants(x).some(v => ext.includes(v)));
        if (found.length === nums.length) {
          const sn = snippet(page.extract.replace(/[  ]/g, ' '), variants(found[0]).find(v => ext.includes(v)));
          c.checks.push({ src: 'Википедия', result: 'support', fact: `В статье «${page.title}» те же цифры${sn ? ': «' + sn + '»' : '.'}`, link: page.fullurl });
        } else if (!found.length) {
          c.sig.push({ k: 'wiki-miss', level: 'warn', title: 'Не нашли цифры в Википедии', why: `В статье «${page.title}» нет чисел ${nums.map(x => x.raw).join(', ')}. Это не доказывает ошибку, но повод проверить.`, link: page.fullurl });
        }
      } catch {}
    }));
    TL.refresh(res); state.busy = ''; renderReport();
  }

  /* ---------- report rendering ---------- */
  const COLORS = { ok: 'var(--ok)', bad: 'var(--bad)', risk: 'var(--risk)', check: 'var(--check)', opinion: 'var(--opinion)', neutral: 'var(--neutral)' };
  const LEVEL = {
    high: ['Можно доверять, но выборочно', 'Ключевые факты подтверждены. Перед использованием проверь пункты с жёлтой меткой.'],
    mid: ['Доверяй осторожно', 'Часть утверждений не подтверждена или похожа на выдумку. Используй только проверенные пункты.'],
    low: ['Не доверяй без проверки', 'В ответе есть ошибки или сильные признаки выдумки. Не копируй его в работу как есть.'],
    none: ['Нечего проверять', 'В тексте нет фактических утверждений: только мнения и общие фразы.'],
  };

  function renderReport() {
    const el = $('#report'), res = state.result;
    if (!res) { el.innerHTML = `<div class="panel empty">Вставь ответ ИИ слева или выбери пример, и здесь появится разбор.</div>`; return; }
    const { value, counts, level } = res.score;
    const total = res.claims.length;
    const C = 2 * Math.PI * 54, ring = value == null ? 0 : C * value / 100;
    const gcol = level === 'high' ? 'var(--ok)' : level === 'mid' ? 'var(--risk)' : level === 'low' ? 'var(--bad)' : 'var(--neutral)';
    const order = ['ok', 'check', 'risk', 'bad', 'opinion', 'neutral'];
    const busy = state.busy ? `<p class="note"><span class="spin"></span> Сверяем числа и даты с Википедией…</p>` : '';

    let marked = '', pos = 0;
    for (const c of res.claims) {
      marked += esc(state.text.slice(pos, c.start));
      marked += `<span class="m v-${c.verdict}${state.active === c.id ? ' active' : ''}" data-id="${c.id}" title="${esc(TL.VERDICTS[c.verdict].label)}"><sup>${c.id}</sup>${esc(state.text.slice(c.start, c.end))}</span>`;
      pos = c.end;
    }
    marked += esc(state.text.slice(pos));

    const F = { all: ['Все', () => true], problems: ['Ошибки и риски', c => ['bad', 'risk'].includes(c.verdict)], check: ['Проверить', c => c.verdict === 'check'], ok: ['Верно', c => c.verdict === 'ok'] };
    const shown = res.claims.filter(F[state.filter][1]);

    el.innerHTML = `
      <div class="panel summary">
        <div class="gauge" role="img" aria-label="Индекс доверия ${value ?? 'нет'} из 100">
          <svg viewBox="0 0 132 132"><circle cx="66" cy="66" r="54" fill="none" stroke="var(--surface-2)" stroke-width="12"/><circle cx="66" cy="66" r="54" fill="none" stroke="${gcol}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${ring} ${C}"/></svg>
          <div class="val"><div><b>${value ?? '–'}</b><small>доверие</small></div></div>
        </div>
        <div class="verdict">
          <h2>${LEVEL[level][0]}</h2>
          <p>${LEVEL[level][1]}</p>
          <div class="bar">${order.map(k => counts[k] ? `<i style="width:${100 * counts[k] / total}%;background:${COLORS[k]}"></i>` : '').join('')}</div>
          <div class="legend">${order.filter(k => counts[k]).map(k => `<span><i style="background:${COLORS[k]}"></i>${TL.VERDICTS[k].label}: ${counts[k]}</span>`).join('')}</div>
          ${busy}
        </div>
      </div>
      <div class="panel sec">
        <h3>Разметка ответа <span class="note">нажми на фразу, чтобы увидеть объяснение</span></h3>
        <div class="marked" id="marked">${marked}</div>
      </div>
      <div class="panel sec">
        <h3>Утверждения: ${total}
          <span class="filters">${Object.entries(F).map(([k, [l]]) => `<button type="button" class="chip" data-f="${k}" aria-pressed="${state.filter === k}">${l}</button>`).join('')}</span>
        </h3>
        <div class="claims">${shown.map(claimCard).join('') || '<p class="note">Нет утверждений в этой группе.</p>'}</div>
      </div>
      ${biblioBlock(res)}
      ${recheckBlock(res)}
      <div class="actions"><button class="btn" type="button" id="copyReport">Скопировать отчёт</button></div>`;

    el.querySelectorAll('.m').forEach(m => m.onclick = () => focusClaim(+m.dataset.id));
    el.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { state.filter = b.dataset.f; renderReport(); });
    const cp = $('#copyPrompt'); if (cp) cp.onclick = () => copy($('#recheck').textContent);
    const cb = $('#copyBib'); if (cb) cb.onclick = () => copy($('#bib').innerText);
    $('#copyReport').onclick = () => copy(reportText(res));
  }

  function claimCard(c) {
    const V = TL.VERDICTS[c.verdict];
    const srcs = [...new Set(c.checks.map(x => x.src))];
    const conflict = c.checks.some(x => x.result === 'support') && c.checks.some(x => x.result === 'contradict');
    const tags = srcs.map(s => `<span class="src">${esc(s)}</span>`).join('') + (c.sig.length ? '<span class="src">Признаки в тексте</span>' : '') + (conflict ? '<span class="src conflict">Источники расходятся</span>' : '');
    const fix = c.checks.find(x => x.fix);
    const links = c.links.concat(c.checks.filter(x => x.link).map(x => ({ label: 'Источник: ' + x.src, url: x.link })), c.sig.filter(s => s.link && s.k !== 'doi').map(s => ({ label: 'Открыть статью', url: s.link })));
    const uniq = [...new Map(links.map(l => [l.url, l])).values()];
    return `<article class="claim v-${c.verdict}${state.active === c.id ? ' active' : ''}" id="claim-${c.id}">
      <header><span class="n">#${c.id}</span><span class="pill">${V.label}</span>${tags}</header>
      <p class="ct">${esc(c.text)}</p>
      <h4>Почему</h4><ul>${c.why.map(w => `<li>${esc(w)}</li>`).join('')}</ul>
      ${fix ? `<div class="fix"><b>Как правильно:</b> ${esc(fix.fix)}</div>` : ''}
      ${c.how.length ? `<h4>Как проверить</h4><ul>${c.how.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
      ${c.sources ? `<h4>Где проверить надёжно${c.sources.topics.length ? ': ' + esc(c.sources.topics.join(', ').toLowerCase()) : ''}</h4><div class="trusted">${c.sources.items.map(x => `<a href="${esc(x.link)}" target="_blank" rel="noopener" title="${esc(x.why)}"><b>${esc(x.name)}</b><small>${esc(x.domain)}</small></a>`).join('')}</div>` : ''}
      ${uniq.length ? `<h4>Быстрый поиск</h4><div class="links">${uniq.map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join('')}</div>` : ''}
    </article>`;
  }

  function focusClaim(id) {
    state.active = id;
    if (state.filter !== 'all' && !document.getElementById('claim-' + id)) state.filter = 'all';
    renderReport();
    const el = document.getElementById('claim-' + id);
    if (el) el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
  }

  function bibList(res) {
    const seen = new Map();
    res.claims.forEach(c => c.checks.forEach(x => {
      if (!x.link || seen.has(x.link)) return;
      let title = '';
      const m = decodeURIComponent(x.link).match(/wiki\/(.+)$/); if (m) title = m[1].replace(/_/g, ' ');
      const t = x.fact && x.fact.match(/статье «([^»]+)»/); if (t) title = t[1];
      seen.set(x.link, { title: title || x.link.replace(/^https?:\/\//, '').split('/')[0], site: x.link.includes('wikipedia') ? 'Википедия' : x.link.replace(/^https?:\/\/(www\.)?/, '').split('/')[0], url: x.link, ids: [c.id] });
    }));
    return [...seen.values()];
  }
  function biblioBlock(res) {
    const list = bibList(res);
    if (!list.length) return '';
    const d = new Date().toLocaleDateString('ru-RU');
    return `<div class="panel sec">
      <h3>Список источников для твоей работы <button type="button" class="chip" id="copyBib">Скопировать список</button></h3>
      <p class="note">Источники, по которым мы проверили факты. Оформлены по правилам для ссылок на электронные ресурсы, можно вставить в доклад вместо «ответ ИИ».</p>
      <ol class="bib" id="bib">${list.map(x => `<li>${esc(x.title)} // ${esc(x.site)}. URL: <a href="${esc(x.url)}" target="_blank" rel="noopener">${esc((() => { try { return decodeURI(x.url); } catch { return x.url; } })())}</a> (дата обращения: ${d}).</li>`).join('')}</ol>
    </div>`;
  }

  /* catalogue of trusted sources */
  function renderCatalog() {
    const groups = {};
    Object.values(SRC.S).forEach(x => (groups[x.kind] = groups[x.kind] || []).push(x));
    $('#catalog').innerHTML = Object.entries(groups).map(([k, arr]) => `<div class="panel cat"><h3>${esc(k)}</h3>${arr.map(x => `<a class="srcrow" href="${esc(x.home)}" target="_blank" rel="noopener"><b>${esc(x.name)}</b><small>${esc(x.domain)}</small><span>${esc(x.why)}</span></a>`).join('')}</div>`).join('');
  }
  const catSearch = () => {
    const q = $('#srcq').value.trim(); if (!q) return;
    const r = SRC.forClaim(q, 6);
    $('#srcres').innerHTML = `<p class="note">${r.topics.length ? 'Тема: ' + esc(r.topics.join(', ')) : 'Тема не определилась, вот универсальные источники'}</p><div class="trusted">${r.items.map(x => `<a href="${esc(x.link)}" target="_blank" rel="noopener" title="${esc(x.why)}"><b>${esc(x.name)}</b><small>${esc(x.domain)}</small></a>`).join('')}</div>`;
  };
  $('#srcForm').onsubmit = e => { e.preventDefault(); catSearch(); };

  function recheckBlock(res) {
    const flagged = res.claims.filter(c => ['bad', 'risk', 'check'].includes(c.verdict));
    if (!flagged.length) return '';
    const txt = `Перепроверь утверждения из своего ответа. Для каждого напиши:
1) насколько ты уверен, от 0 до 100%;
2) на какой конкретный источник опираешься: автор, название, год (не придумывай, если не знаешь, так и скажи);
3) что в утверждении может быть неточным.

${flagged.map((c, i) => `${i + 1}. ${c.text}`).join('\n')}`;
    return `<div class="panel sec">
      <h3>Попроси ИИ перепроверить себя <button type="button" class="chip" id="copyPrompt">Скопировать запрос</button></h3>
      <p class="note">Вставь этот запрос в тот же чат с ИИ. Если модель не может назвать источник или меняет ответ, утверждению доверять нельзя.</p>
      <div class="prompt-box" id="recheck">${esc(txt)}</div>
    </div>`;
  }

  function reportText(res) {
    const s = res.score;
    return `TrustLens: индекс доверия ${s.value ?? '–'}/100 (${LEVEL[s.level][0]})\n\n` + res.claims.map(c => `[${TL.VERDICTS[c.verdict].label}] ${c.text}\n  Почему: ${c.why[0] || ''}`).join('\n\n');
  }

  /* ---------- input ---------- */
  function renderExamples(active) {
    $('#examples').innerHTML = EXAMPLES.map((e, i) => `<button type="button" class="chip" data-ex="${i}" aria-pressed="${active === i}">${esc(e.title)}</button>`).join('');
    document.querySelectorAll('[data-ex]').forEach(b => b.onclick = () => loadExample(+b.dataset.ex));
  }
  function loadExample(i) {
    $('#q').value = EXAMPLES[i].q; $('#answer').value = EXAMPLES[i].text;
    renderExamples(i); run();
  }
  $('#form').onsubmit = e => { e.preventDefault(); renderExamples(-1); run(); };

  /* ---------- trainer ---------- */
  const Trainer = {
    round: 0, picked: new Set(), revealed: false, score: 0, max: 0, caught: 0, falseAlarms: 0, tips: new Set(),
    render() {
      const el = $('#train');
      if (this.round >= TRAINER.length) return this.final(el);
      const r = TRAINER[this.round];
      el.innerHTML = `<div class="panel">
        <div class="round-head"><h2>${esc(r.topic)}</h2><span class="scoreline">Раунд ${this.round + 1} из ${TRAINER.length} · очки ${this.score}/${this.max}</span></div>
        <div class="progress" aria-hidden="true">${TRAINER.map((_, i) => `<i class="${i < this.round ? 'done' : ''}"></i>`).join('')}</div>
        <p class="note">Так ответил ИИ. ${this.revealed ? 'Вот разбор.' : 'Отметь утверждения, которые считаешь ошибкой.'}</p>
        <div class="stmt">${r.items.map((it, i) => {
          const p = this.picked.has(i);
          if (!this.revealed) return `<button type="button" class="st" data-i="${i}" aria-pressed="${p}"><span class="box">${p ? '✕' : ''}</span><span>${esc(it.t)}</span></button>`;
          const right = p === !it.ok;
          return `<div class="st rev" aria-pressed="${p}"><span class="box">${p ? '✕' : ''}</span><span>${esc(it.t)}</span>
            <div class="res"><span class="tag ${it.ok ? 'good' : 'miss'}">${it.ok ? 'Правда' : 'Ошибка ИИ'}</span><span class="tag ${right ? 'good' : 'miss'}">${right ? 'Ты прав' : p ? 'Ложная тревога' : 'Пропущено'}</span>${it.tip ? `<span class="tag tip">${esc(it.tip)}</span>` : ''}</div>
            <div class="exp">${esc(it.e)}</div></div>`;
        }).join('')}</div>
        <div class="actions" style="margin-top:14px">${this.revealed ? `<button class="btn primary" type="button" id="tNext">${this.round + 1 < TRAINER.length ? 'Следующий раунд' : 'Итоги'}</button>` : `<button class="btn primary" type="button" id="tCheck">Проверить</button>`}</div>
      </div>`;
      el.querySelectorAll('button.st').forEach(b => b.onclick = () => { const i = +b.dataset.i; this.picked.has(i) ? this.picked.delete(i) : this.picked.add(i); this.render(); });
      const c = $('#tCheck'); if (c) c.onclick = () => {
        r.items.forEach((it, i) => { const p = this.picked.has(i); this.max++; if (p === !it.ok) this.score++; if (!it.ok && p) { this.caught++; } if (it.ok && p) this.falseAlarms++; if (!it.ok && it.tip) this.tips.add(it.tip); });
        this.revealed = true; this.render();
      };
      const n = $('#tNext'); if (n) n.onclick = () => { this.round++; this.picked = new Set(); this.revealed = false; this.render(); $('#tab-train').scrollIntoView({ block: 'start' }); };
    },
    final(el) {
      const total = TRAINER.reduce((a, r) => a + r.items.filter(i => !i.ok).length, 0);
      const pct = Math.round(100 * this.score / Math.max(1, this.max));
      const rank = pct >= 95 ? 'Мастер проверки' : pct >= 80 ? 'Фактчекер' : pct >= 60 ? 'Внимательный читатель' : 'Новичок';
      el.innerHTML = `<div class="panel final">
        <div class="big">${pct}%</div><h2>${rank}</h2>
        <p>Ты нашёл ${this.caught} из ${total} ошибок ИИ. Ложных тревог: ${this.falseAlarms}.</p>
        <p class="note">Приёмы ошибок ИИ, которые ты теперь знаешь:</p>
        <div class="tips">${[...this.tips].map(t => `<span class="tag tip">${esc(t)}</span>`).join('')}</div>
        <div class="actions" style="justify-content:center;margin-top:8px"><button class="btn primary" type="button" id="tAgain">Пройти ещё раз</button><button class="btn" type="button" id="tGo">Проверить свой ответ ИИ</button></div>
      </div>`;
      $('#tAgain').onclick = () => { Object.assign(this, { round: 0, picked: new Set(), revealed: false, score: 0, max: 0, caught: 0, falseAlarms: 0, tips: new Set() }); this.render(); };
      $('#tGo').onclick = () => showTab('check');
    },
  };

  /* ---------- boot ---------- */
  renderHistory();
  const draft = store.get('tl-draft');
  renderEngines();
  if (draft && !EXAMPLES.some(e => e.text === draft)) { $('#answer').value = draft; renderExamples(-1); run(); }
  else loadExample(0);
  const hash = (location.hash || '').slice(1);
  showTab(['check', 'train', 'sources', 'how'].includes(hash) ? hash : (store.get('tl-tab') || 'check'));
  detectWiki();
})();
