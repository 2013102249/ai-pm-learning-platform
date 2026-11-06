/* AI 产品经理学习平台 · 交互逻辑
   数据来自 data/data.js（由 scripts/build_data.py 从两个 GitHub 仓库构建） */
(() => {
  'use strict';
  const D = window.APP_DATA;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ESC_MAP[c]);
  const LS = 'aipm_learn_v1';

  /* ---------------- 数据索引 ---------------- */
  const ALLDAYS = D.weeks.flatMap(w => w.days.map(d => Object.assign({}, d, { week: w.id, weekTitle: w.title })));
  const LEARN_SEQ = D.weeks.flatMap(w => w.days.map(d => d.id).concat([w.id + '-WE']));
  const QUIZ = D.quiz.map((q, i) => Object.assign({}, q, { _i: i }));
  const QBANK = D.qbank;
  const QB_BY_ID = Object.fromEntries(QBANK.map(q => [q.id, q]));
  const TERMS = D.glossary.terms;
  const TERM_BY_ID = Object.fromEntries(TERMS.map(t => [t.id, t]));
  const CATS = D.glossary.cats;
  const QUIZ_TYPES = Array.from(new Set(QUIZ.map(q => q.qtype))).sort();
  const QB_LEVELS = ['初级', '中级', '高级'];
  const FILE_ICONS = { '教案': '▤', '导学案': '◈', '讲课稿': '▦', '播客稿': '♪', '分层习题': '✎', 'PPT 大纲': '▣', '配图清单': '◉', '交互说明': '⚙' };

  const dayInfo = (id) => {
    for (const w of D.weeks) {
      const d = w.days.find(x => x.id === id);
      if (d) return { w, d };
    }
    return null;
  };
  const weekOf = (id) => (id || '').replace(/-WE$/, '').replace(/D\d+$/, '');

  /* ---------------- 本地状态 ---------------- */
  const DEFAULT = {
    name: '同学', startDate: '', dayDone: [], tasks: {}, quizStatus: {}, qbankStatus: {},
    qbankFav: [], milestones: [], deliverables: [], lastDay: ''
  };
  let S;
  try { S = Object.assign({}, DEFAULT, JSON.parse(localStorage.getItem(LS) || '{}')); }
  catch (e) { S = Object.assign({}, DEFAULT); }
  for (const k of Object.keys(DEFAULT)) if (S[k] == null) S[k] = Array.isArray(DEFAULT[k]) ? [] : DEFAULT[k];
  const save = () => { try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) {} };

  const UI = {
    quiz: { week: 'all', day: 'all', layer: 'all', type: 'all', q: '', onlyWrong: false, page: 0, open: {} },
    interview: { src: 'all', level: 'all', type: 'all', q: '', rec: 'all', onlyFav: false, page: 0, open: {} },
    glossary: { cat: 'all', q: '', hot: false, flash: null, flipped: false },
    resources: { cat: 'start', q: '' },
    learn: { day: 'W1D1', showAllQuiz: false, openAns: {} },
    map: { stage: 'all' }
  };

  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(t._timer); t._timer = setTimeout(() => t.classList.remove('show'), 1900);
  }
  const toggleIn = (arr, v) => { const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); };

  function progress() {
    const course = S.dayDone.length / D.meta.stats.days;
    const right = Object.values(S.quizStatus).filter(v => v === 'right' || v === 'mastered').length;
    const quiz = right / D.meta.stats.quiz;
    const interview = Object.keys(S.qbankStatus).length / D.meta.stats.qbank;
    const portfolio = S.milestones.length / D.meta.stats.milestones;
    const total = course * .5 + quiz * .2 + interview * .15 + portfolio * .15;
    return { course, quiz, interview, portfolio, total, right };
  }
  const pct = (v) => Math.round(v * 100) + '%';

  function currentDayId() {
    if (!S.startDate) return '';
    const start = new Date(S.startDate + 'T00:00:00');
    if (isNaN(start.getTime())) return '';
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const diff = Math.floor((now - start) / 86400000);
    if (diff < 0 || diff >= 56) return '';
    const wk = Math.floor(diff / 7) + 1;
    const dy = (diff % 7) + 1;
    return dy <= 5 ? 'W' + wk + 'D' + dy : 'W' + wk + '-WE';
  }
  const nextDayId = () => (ALLDAYS.find(d => !S.dayDone.includes(d.id)) || ALLDAYS[0]).id;

  /* ---------------- 通用组件 ---------------- */
  function ring(p, label) {
    const r = 46, c = 2 * Math.PI * r, off = c * (1 - Math.min(1, p));
    return '<div class="ring"><svg width="112" height="112" viewBox="0 0 112 112">' +
      '<circle cx="56" cy="56" r="' + r + '" fill="none" stroke="#EFECF8" stroke-width="9"/>' +
      '<circle cx="56" cy="56" r="' + r + '" fill="none" stroke="url(#rg)" stroke-width="9" stroke-linecap="round" stroke-dasharray="' + c + '" stroke-dashoffset="' + off + '"/>' +
      '<defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7C3AED"/><stop offset="1" stop-color="#2563EB"/></linearGradient></defs>' +
      '</svg><div class="val"><b>' + Math.round(p * 100) + '<span style="font-size:13px">%</span></b><span>' + esc(label) + '</span></div></div>';
  }
  function chips(list, cls) { return (list || []).map(x => '<span class="chip ' + (cls || '') + '">' + esc(x) + '</span>').join(''); }
  function statTiles(items) {
    return '<div class="stat-strip">' + items.map(x => '<div class="stat-tile"><b>' + esc(x.v) + '</b><span>' + esc(x.l) + '</span></div>').join('') + '</div>';
  }
  function selectHtml(id, key, label, opts, val) {
    return '<select data-change="' + key + '" data-ui="' + id + '" aria-label="' + esc(label) + '">' +
      opts.map(o => '<option value="' + esc(o.v) + '"' + (String(val) === String(o.v) ? ' selected' : '') + '>' + esc(o.t) + '</option>').join('') +
      '</select>';
  }
  function pager(total, page, size, key) {
    const pages = Math.max(1, Math.ceil(total / size));
    return '<div class="pager"><button data-act="page" data-ui="' + key + '" data-v="' + (page - 1) + '"' + (page <= 0 ? ' disabled' : '') + '>← 上一页</button>' +
      '<span>第 ' + (page + 1) + ' / ' + pages + ' 页 · 共 ' + total + ' 条</span>' +
      '<button data-act="page" data-ui="' + key + '" data-v="' + (page + 1) + '"' + (page + 1 >= pages ? ' disabled' : '') + '>下一页 →</button></div>';
  }
  function parseOptions(s) {
    return String(s || '').split(/\n+/).map(x => x.trim()).filter(Boolean).map(x => {
      const m = x.match(/^([A-D])[.．、:：]\s*(.*)$/);
      return m ? { k: m[1], t: m[2] } : { k: '', t: x };
    });
  }
  function answerBlock(q, show) {
    if (!show) return '';
    return '<div class="q-answer"><span class="lbl">参考答案 / 达标口径</span>' + esc(q.answer) +
      (q.rubric ? '<div class="meta"><b>评分要点：</b>' + esc(q.rubric) : '') +
      (q.kaodian ? '　<b>考点：</b>' + esc(q.kaodian) : '') +
      (q.score ? '　<b>分值：</b>' + esc(q.score) : '') + '</div></div>';
  }

  /* ---------------- 总览 ---------------- */
  function viewDashboard() {
    const p = progress(), st = D.meta.stats;
    const today = currentDayId(), next = nextDayId(), focusId = today || next;
    const focusWE = focusId.endsWith('-WE');
    const fi = focusWE ? null : dayInfo(focusId);
    const quick = [
      { i: '▤', n: '40 讲在线课件', d: '按讲直达 · 612 页幻灯片', u: D.meta.kitUrl + 'PPT%E5%9C%A8%E7%BA%BF%E7%89%88/index.html' },
      { i: '✎', n: '40 天测评提交', d: '飞书表单 · 讲师在线批改', u: D.meta.kitUrl + '%E6%B5%8B%E8%AF%84%E5%85%A5%E5%8F%A3.html' },
      { i: '◆', n: '面试备考平台', d: '775 真题 · 进度同步', u: D.meta.prepUrl },
      { i: '◉', n: 'AI 术语词库', d: '115 词条 · 必背高频', u: D.meta.prepUrl + 'glossary/' },
      { i: '⚙', n: '4 个课堂交互工具', d: 'RAG / 提示词 / 打分', u: D.meta.kitUrl + '02-%E4%BA%A4%E4%BA%92%E5%B7%A5%E5%85%B7/index.html' },
      { i: '▣', n: '课程资源总库', d: '320 件物料 · 8 周全套', u: D.meta.kitUrl }
    ];
    const lines = [
      { l: '课程完成（' + S.dayDone.length + '/' + st.days + ' 天）', v: p.course },
      { l: '习题掌握（' + p.right + '/' + st.quiz + ' 题）', v: p.quiz },
      { l: '面试真题（' + Object.keys(S.qbankStatus).length + '/' + st.qbank + ' 题）', v: p.interview },
      { l: '作品集里程碑（' + S.milestones.length + '/' + st.milestones + '）', v: p.portfolio }
    ];
    return '' +
      '<section class="hero"><div class="hero-main">' +
      '<div class="eyebrow">8 WEEKS · AI PRODUCT MANAGER</div>' +
      '<h1>把 8 周，学成一份能拿 Offer 的作品集</h1>' +
      '<p>理论看懂 → 动手做出 → 验收过关。平台把课程资源包的 40 天物料、352 道分层习题，与面试备考平台的 775 道真题、115 条术语串成一条学习主线。</p>' +
      '<div class="hero-btns"><button class="btn" data-act="go" data-to="#/learn/' + focusId + '">继续学习 · ' + esc(focusWE ? '本周综合输出' : (fi ? fi.d.id : focusId)) + ' →</button>' +
      '<button class="btn outline" data-act="go" data-to="#/map">查看 8 周课程地图</button></div></div>' +
      '<div style="position:relative;z-index:2;text-align:center;min-width:120px">' +
      '<div style="font-size:10.5px;letter-spacing:1.6px;color:#C4B5FD">LEARNING PATH</div>' +
      '<div style="font-size:40px;font-weight:800;line-height:1.3">8<span style="font-size:16px;opacity:.7"> 周</span></div>' +
      '<div style="font-size:11.5px;color:rgba(255,255,255,.75)">4 阶段 · 40 次正课<br>5 个里程碑</div></div></section>' +

      '<div class="kpi-grid">' + [
        [st.days, '次正课', '周一至周五'], [st.quiz, '道自测题', '4 个难度层'],
        [st.qbank, '道面试真题', '7 大题库'], [st.terms, '条核心术语', '10 大分类']
      ].map(x => '<div class="kpi"><b>' + x[0] + '<em> 项</em></b><span>' + x[1] + ' · ' + x[2] + '</span></div>').join('') + '</div>' +

      '<div class="sec" style="margin-top:22px"><div class="card stat-card">' + ring(p.total, '综合进度') +
      '<div class="stat-detail">' + lines.map(x => '<div><div class="stat-line"><span>' + esc(x.l) + '</span><b>' + pct(x.v) + '</b></div><div class="bar"><div class="bar-fill" style="width:' + (x.v * 100) + '%"></div></div></div>').join('') + '</div>' +
      '<div class="stat-badges"><div class="stat-badge"><b>' + S.dayDone.length + '</b><span>已完成天数</span></div>' +
      '<div class="stat-badge"><b>' + Object.keys(S.qbankStatus).length + '</b><span>已练面试题</span></div>' +
      '<div class="stat-badge"><b>' + S.milestones.length + '</b><span>里程碑达成</span></div></div></div></div>' +

      '<div class="sec"><div class="sec-head"><h2>四阶段递进</h2><span class="sub">认知筑基 → AI 核心能力 → 产品硬功 → 实战与就业</span></div>' +
      '<div class="stage-grid">' + D.stages.map((s, i) => '<div class="stage-card"><div class="no">STAGE 0' + (i + 1) + ' · ' + esc(s.range) + '</div><h4>' + esc(s.name) + '</h4><p>' + esc(s.desc) + '</p></div>').join('') + '</div></div>' +

      '<div class="sec"><div class="sec-head"><h2>' + (today ? '今天学什么' : '下一步学习') + '</h2><span class="sub">' + (today ? '按开课日期推算' : '从第一个未完成的学习日开始') + '</span>' +
      '<span class="right">' + (S.startDate ? '开课日 ' + esc(S.startDate) : '可在「学习进度」设置开课日期') + '</span></div>' +
      (focusWE ? '<div class="card next-card"><div class="left"><span class="chip">WEEK ' + esc(weekOf(focusId).slice(1)) + ' · 周末</span><h3 style="font-size:16px;margin:9px 0">本周综合输出与验收</h3><p class="small muted">' + esc((D.weeks.find(w => w.id === weekOf(focusId)) || {}).weekend) + '</p></div><button class="btn" data-act="go" data-to="#/learn/' + focusId + '">进入 →</button></div>' :
        '<div class="card next-card"><div class="left"><span class="chip">' + esc(fi.d.id) + ' · ' + esc(fi.d.label) + '</span><h3 style="font-size:16px;margin:9px 0">' + esc(fi.d.title) + '</h3>' +
        '<div class="points">' + fi.d.points.slice(0, 3).map(x => '<span>' + esc(x.length > 30 ? x.slice(0, 30) + '…' : x) + '</span>').join('') + '</div>' +
        '<p class="small muted" style="margin-top:10px">🎯 实操：' + esc(fi.d.deliverable) + ' · 配套 ' + fi.d.quizCount + ' 道随堂自测</p></div>' +
        '<button class="btn" data-act="go" data-to="#/learn/' + focusId + '">开始学习 →</button></div>') + '</div>' +

      '<div class="sec"><div class="sec-head"><h2>8 周课程</h2><span class="sub">每周 5 天正课 + 周末综合输出</span><a class="right" href="#/map">完整地图 →</a></div>' +
      '<div class="grid g4">' + D.weeks.map(w => {
        const done = w.days.filter(d => S.dayDone.includes(d.id)).length;
        return '<div class="week-mini"><div class="top"><div class="wk">W' + esc(w.no) + '</div><h4>' + esc(w.title) + '</h4></div>' +
          '<p>' + esc(w.weekendOutput) + '</p>' +
          '<div class="progress-line"><div class="bar"><div class="bar-fill" style="width:' + (done / 5 * 100) + '%"></div></div><b>' + done + '/5</b></div>' +
          '<button class="btn ghost sm" style="margin-top:11px" data-act="go" data-to="#/learn/' + w.days[0].id + '">进入本周 →</button></div>';
      }).join('') + '</div></div>' +

      '<div class="sec"><div class="sec-head"><h2>快捷入口</h2><span class="sub">全部资源来自课程资源包与面试备考平台</span></div>' +
      '<div class="quick-grid">' + quick.map(q => '<a class="quick" href="' + esc(q.u) + '" target="_blank" rel="noopener"><i>' + q.i + '</i><span><b>' + esc(q.n) + '</b><small>' + esc(q.d) + '</small></span></a>').join('') + '</div></div>' +
      '<div class="notice"><b>学习闭环：</b>每天按「理论地图 → 实操任务 → 随堂自测 → 测评提交 → 交付物归档」推进；每周对照验收标准自检；W7–W8 用面试备考平台把项目加工成面试弹药。所有进度保存在本机浏览器。</div>';
  }

  /* ---------------- 课程地图 ---------------- */
  function viewMap() {
    const f = UI.map.stage;
    const list = D.weeks.filter(w => f === 'all' || D.stages[Number(f)].weeks.includes(w.id));
    return '<div class="sec"><div class="sec-head"><h2>8 周课程地图</h2><span class="sub">4 阶段 · 40 次正课 · 1 个贯穿式主项目 · 5 个里程碑</span></div>' +
      '<div class="row" style="margin-bottom:16px"><span class="chip click' + (f === 'all' ? ' on' : '') + '" data-act="map-stage" data-v="all">全部 8 周</span>' +
      D.stages.map((s, i) => '<span class="chip click' + (f === String(i) ? ' on' : '') + '" data-act="map-stage" data-v="' + i + '">' + esc(s.name) + ' · ' + esc(s.range) + '</span>').join('') + '</div>' +
      list.map(w => {
        const done = w.days.filter(d => S.dayDone.includes(d.id)).length;
        return '<div class="week-card"><div class="head"><div class="num"><small>WEEK</small><b>' + esc(w.no) + '</b></div>' +
          '<div class="h-main"><h3>' + esc(w.title) + '</h3><div class="meta">' + esc(w.stage) + ' ｜ ' + esc(w.keywords) + '</div></div>' +
          '<div style="text-align:right;min-width:110px"><div class="tiny muted">本周完成</div><div class="strong" style="color:var(--purple);font-size:18px">' + done + ' / 5 天</div>' +
          '<div class="bar" style="margin-top:6px;width:110px"><div class="bar-fill" style="width:' + (done / 5 * 100) + '%"></div></div></div></div>' +
          '<div class="body"><div><div class="block-title">每日正课</div><div class="day-list">' +
          w.days.map(d => '<a class="day-link" href="#/learn/' + d.id + '"><span class="id">' + esc(d.id) + '</span><span class="tt">' + esc(d.label + ' · ' + d.title) + '</span>' +
            (S.dayDone.includes(d.id) ? '<span class="done">✓</span>' : '') + '<span class="tiny muted">' + d.quizCount + ' 题</span></a>').join('') +
          '<a class="day-link" href="#/learn/' + w.id + '-WE" style="background:var(--purple-ghost)"><span class="id">周末</span><span class="tt">综合输出与验收</span></a>' +
          '</div></div><div><div class="block-title">周末核心产出</div><p class="small" style="line-height:1.8">' + esc(w.weekendOutput) + '</p>' +
          '<div class="block-title" style="margin-top:16px">验收标准</div><ul class="small" style="margin-left:17px;line-height:1.9;color:var(--ink2)">' +
          w.acceptance.map(a => '<li>' + esc(a) + '</li>').join('') + '</ul>' +
          '<div class="tags">' + chips(w.abilityTags, 'blue') + '</div>' +
          '<button class="btn sm" style="margin-top:14px" data-act="go" data-to="#/learn/' + w.days[0].id + '">进入 ' + esc(w.id) + ' →</button></div></div></div>';
      }).join('') + '</div>';
  }

  /* ---------------- 每日学习 ---------------- */
  function quizCard(q, opts) {
    const o = opts || {};
    const key = q._i, state = S.quizStatus[key];
    const show = o.show || UI.learn.openAns[key];
    const isChoice = q.qtype === '选择题' && q.options;
    const optsArr = isChoice ? parseOptions(q.options) : [];
    const picked = o.picked;
    return '<div class="q-card"><div class="q-head"><span class="qid">' + esc(q.day + ' · #' + q.qno) + '</span>' +
      '<span class="chip gray">' + esc(q.layer) + '</span><span class="chip blue">' + esc(q.qtype) + '</span>' +
      (state === 'right' || state === 'mastered' ? '<span class="chip green">已掌握</span>' : '') +
      '<span class="tiny muted" style="margin-left:auto">' + esc(q.score) + ' 分</span></div>' +
      '<div class="q-stem">' + esc(q.stem) + '</div>' +
      (isChoice ? '<div class="q-options">' + optsArr.map(op => {
        let cls = '';
        if (picked) {
          if (String(q.answer).includes(op.k)) cls = ' right';
          else if (picked === op.k) cls = ' wrong';
        }
        return '<button class="q-opt ' + cls + '" data-act="quiz-opt" data-i="' + key + '" data-opt="' + esc(op.k) + '"><span class="k">' + esc(op.k) + '</span><span>' + esc(op.t) + '</span></button>';
      }).join('') + '</div>' : '') +
      (show ? answerBlock(q, true) : '') +
      '<div class="q-foot">' +
      (isChoice ? '' : '<button class="btn ghost sm" data-act="quiz-show" data-i="' + key + '">' + (show ? '收起答案' : '查看参考答案') + '</button>') +
      '<button class="btn gray sm" data-act="quiz-master" data-i="' + key + '">' + (state === 'right' || state === 'mastered' ? '✓ 已掌握' : '标记掌握') + '</button>' +
      '<span class="sp"></span><span class="tiny muted">' + esc(q.kaodian) + '</span></div></div>';
  }

  function viewLearn(arg) {
    const id = arg || 'W1D1';
    UI.learn.day = id;
    const isWE = id.endsWith('-WE');
    const wid = weekOf(id);
    const w = D.weeks.find(x => x.id === wid) || D.weeks[0];
    const d = isWE ? null : (dayInfo(id) || { d: w.days[0] }).d;
    const seqIdx = LEARN_SEQ.indexOf(id);
    const prev = LEARN_SEQ[seqIdx - 1], next = LEARN_SEQ[seqIdx + 1];

    const head = '<div class="week-tabs">' + D.weeks.map(x => '<button class="wt' + (x.id === w.id ? ' on' : '') + '" data-act="go" data-to="#/learn/' + x.days[0].id + '">W' + esc(x.no) + '</button>').join('') + '</div>' +
      '<div class="week-banner"><div class="eyebrow" style="color:#C4B5FD">WEEK ' + esc(w.no) + ' · ' + esc(w.stage) + '</div>' +
      '<h2>' + esc(w.title) + '</h2><div class="sub">关键词：' + esc(w.keywords) + '</div>' +
      '<div class="chips">' + w.abilityTags.map(t => '<span>' + esc(t) + '</span>').join('') + '</div></div>' +
      '<div class="week-facts"><div class="fact"><div class="t">周末核心产出</div><p>' + esc(w.weekendOutput) + '</p></div>' +
      '<div class="fact"><div class="t">验收标准</div><ul>' + w.acceptance.map(a => '<li>' + esc(a) + '</li>').join('') + '</ul></div>' +
      '<div class="fact"><div class="t">讲师提示</div><p>' + esc(w.coach) + '</p></div></div>' +
      '<div class="day-tabs">' + w.days.map(x => '<button class="' + (!isWE && x.id === d.id ? 'on' : '') + '" data-act="go" data-to="#/learn/' + x.id + '">' + esc(x.label) + (S.dayDone.includes(x.id) ? '<span class="dot"></span>' : '') + '</button>').join('') +
      '<button class="' + (isWE ? 'on' : '') + '" data-act="go" data-to="#/learn/' + w.id + '-WE">周末 · 综合输出</button></div>';

    if (isWE) {
      const deliveries = w.days.map(x => x.deliverable);
      return head + '<div class="card pad"><div class="card-title"><span class="ico">◇</span>本周综合输出</div>' +
        '<p style="font-size:13px;line-height:1.9">' + esc(w.weekend) + '</p><div class="divider"></div>' +
        '<div class="card-title"><span class="ico">✓</span>交付物归档清单</div><div class="check-list">' +
        deliveries.map((t, i) => { const k = w.id + '-WE-' + i; const on = S.tasks[k]; return '<div class="check' + (on ? ' on' : '') + '" data-act="toggle-task" data-key="' + k + '"><span class="box">' + (on ? '✓' : '') + '</span><span class="txt">' + esc(t) + '</span></div>'; }).join('') +
        '</div><div class="link-row"><button class="btn ghost sm" data-act="go" data-to="#/portfolio">查看作品集里程碑 →</button>' +
        '<a class="btn gray sm" href="' + esc(D.meta.kitUrl) + '" target="_blank" rel="noopener">打开资源包首页 ↗</a></div></div>' +
        '<div class="card pad" style="margin-top:14px"><div class="card-title"><span class="ico">▤</span>本周 5 天资料包</div>' +
        w.days.map(x => '<div class="acc-day"><span class="id">' + esc(x.id) + '</span><span class="small">' + esc(x.title) + '</span><span style="flex:1"></span>' +
          x.files.slice(0, 4).map(f => '<a href="' + esc(f.url) + '" target="_blank" rel="noopener">' + esc(f.name) + '</a>').join('') + '</div>').join('') + '</div>';
    }

    // 相关术语
    const hay = (d.title + ' ' + d.theory + ' ' + d.highlight).toLowerCase();
    const rel = TERMS.filter(t => {
      const names = [t.name].concat(t.aliases || []).filter(Boolean);
      return names.some(n => n.length > 1 && hay.includes(String(n).toLowerCase()));
    }).slice(0, 8);
    // 当天习题 / 验收项
    const dayQuiz = QUIZ.filter(q => q.day === d.id);
    const acceptItems = dayQuiz.filter(q => q.layer === '验收清单');
    const shownQuiz = UI.learn.showAllQuiz ? dayQuiz : dayQuiz.slice(0, 3);
    // 学习清单
    const tasks = [
      '阅读《导学案》与《教案》，明确今日目标',
      '观看在线课件（' + d.deckPages + ' 页）并整理知识卡',
      '完成 ' + d.quizCount + ' 道随堂自测，标记错题',
      '完成实操：' + d.deliverable,
      '提交当日测评表单，归档交付物'
    ];
    // 面试视角
    const rec = (w.suggestedQ || []).slice(0, 4).map(x => QB_BY_ID[x]).filter(Boolean);

    return head +
      '<div class="day-head"><span class="did">' + esc(d.id) + ' · ' + esc(d.label) + '</span><h3>' + esc(d.title) + '</h3>' +
      '<div class="nav-btns">' + (prev ? '<a class="btn gray sm" href="#/learn/' + prev + '">← 上一天</a>' : '') +
      (next ? '<a class="btn gray sm" href="#/learn/' + next + '">下一天 →</a>' : '') + '</div>' +
      '<button class="btn' + (S.dayDone.includes(d.id) ? ' gray' : '') + ' sm" data-act="toggle-day" data-id="' + d.id + '">' + (S.dayDone.includes(d.id) ? '✓ 已完成' : '标记今日完成') + '</button></div>' +

      '<div class="learn-grid">' +
      '<div class="card pad"><div class="card-title"><span class="ico">◈</span>理论知识地图</div>' +
      '<div class="point-list">' + d.points.map((x, i) => '<div class="point"><span class="n">' + (i + 1) + '</span><span>' + esc(x) + '</span></div>').join('') + '</div>' +
      '<div class="theory-text">' + esc(d.theory) + '</div>' +
      (d.highlight ? '<p class="tiny muted" style="margin-top:10px">资源包标注：' + esc(d.highlight) + '</p>' : '') +
      (rel.length ? '<div class="divider"></div><div class="card-title" style="margin-bottom:4px"><span class="ico">◉</span>今日相关术语</div><div class="term-chips">' +
        rel.map(t => '<button data-act="term-open" data-id="' + esc(t.id) + '">' + esc(t.name) + ' ›</button>').join('') + '</div>' : '') +
      '</div>' +

      '<div class="card pad"><div class="card-title"><span class="ico">✎</span>实操技能与产出</div>' +
      '<div class="practice-box">' + esc(d.practice).replace(esc(d.deliverable), '<b>' + esc(d.deliverable) + '</b>') + '</div>' +
      '<div class="divider"></div><div class="card-title" style="margin-bottom:4px"><span class="ico">✓</span>今日学习清单</div>' +
      '<div class="check-list">' + tasks.map((t, i) => { const k = d.id + '-' + i; const on = S.tasks[k]; return '<div class="check' + (on ? ' on' : '') + '" data-act="toggle-task" data-key="' + esc(k) + '"><span class="box">' + (on ? '✓' : '') + '</span><span class="txt">' + esc(t) + '</span></div>'; }).join('') + '</div>' +
      (acceptItems.length ? '<div class="divider"></div><div class="card-title" style="margin-bottom:6px"><span class="ico">◎</span>当日验收口径</div><ul class="small" style="margin-left:17px;line-height:1.85;color:var(--ink2)">' +
        acceptItems.slice(0, 5).map(q => '<li>' + esc(q.stem) + '</li>').join('') + '</ul>' : '') +
      '</div></div>' +

      '<div class="card pad" style="margin-bottom:14px"><div class="card-title"><span class="ico">▣</span>今日资料包 · 八件套</div>' +
      '<div class="file-grid">' + d.files.map(f => '<a class="file-btn" href="' + esc(f.url) + '" target="_blank" rel="noopener"><i>' + (FILE_ICONS[f.name] || '▤') + '</i><span>' + esc(f.name) + '</span></a>').join('') + '</div>' +
      '<div class="link-row"><a class="btn sm" href="' + esc(d.deckUrl) + '" target="_blank" rel="noopener">▤ 在线课件 · ' + d.deckPages + ' 页 ↗</a>' +
      (d.formUrl ? '<a class="btn blue sm" href="' + esc(d.formUrl) + '" target="_blank" rel="noopener">✎ 提交当日测评 ↗</a>' : '') +
      '<a class="btn ghost sm" href="' + esc(D.meta.kitUrl + 'index.html') + '" target="_blank" rel="noopener">资源包首页 ↗</a></div></div>' +

      '<div class="sec-head"><h2>随堂自测</h2><span class="sub">共 ' + dayQuiz.length + ' 题 · ' + esc(d.id) + ' · 答案与评分要点来自课程资源包</span>' +
      '<span class="right"><button class="btn link" data-act="go" data-to="#/quiz">进入自测中心 →</button></span></div>' +
      (shownQuiz.length ? shownQuiz.map(q => quizCard(q)).join('') : '<div class="card empty">当天暂无习题</div>') +
      (dayQuiz.length > 3 ? '<button class="btn ghost" style="width:100%" data-act="quiz-more">' + (UI.learn.showAllQuiz ? '收起习题' : '展开全部 ' + dayQuiz.length + ' 道题') + '</button>' : '') +

      '<div class="sec-head" style="margin-top:26px"><h2>面试视角</h2><span class="sub">本周主题在真实面试中的考法 · 摘自 775 道真题</span></div>' +
      '<div class="grid g2">' + rec.map(q => '<div class="card pad"><div class="q-head"><span class="chip gray">' + esc(q.srcName) + '</span><span class="chip blue">' + esc(q.type) + '</span><span class="chip gray">' + esc(q.level) + '</span></div>' +
        '<div class="q-stem">' + esc(q.q) + '</div>' +
        '<button class="btn ghost sm" data-act="qb-flip" data-id="' + esc(q.id) + '" data-inline="1">' + (UI.interview.open[q.id] ? '收起参考答案' : '查看参考答案') + '</button>' +
        (UI.interview.open[q.id] ? '<div class="q-answer ans-long">' + esc(q.a) + '</div>' : '') + '</div>').join('') + '</div>' +
      '<div class="notice" style="margin-top:14px"><b>提示：</b>完整的 775 道真题、模拟面试、面经与进度同步，请到 <a href="' + esc(D.meta.prepUrl) + '" target="_blank" rel="noopener">面试备考平台</a>；本平台也提供 <a href="#/interview">内置刷题</a>。</div>';
  }

  /* ---------------- 自测中心 ---------------- */
  function filteredQuiz() {
    const f = UI.quiz;
    return QUIZ.filter(q => {
      if (f.week !== 'all' && q.week !== f.week) return false;
      if (f.day !== 'all' && q.day !== f.day) return false;
      if (f.layer !== 'all' && q.layer !== f.layer) return false;
      if (f.type !== 'all' && q.qtype !== f.type) return false;
      if (f.onlyWrong && !(S.quizStatus[q._i] === 'wrong')) return false;
      if (f.q && !(q.stem + q.kaodian + (q.answer || '')).toLowerCase().includes(f.q.toLowerCase())) return false;
      return true;
    });
  }
  function quizListHtml() {
    const f = UI.quiz, list = filteredQuiz(), size = 8;
    const pages = Math.max(1, Math.ceil(list.length / size));
    if (f.page >= pages) f.page = pages - 1;
    const slice = list.slice(f.page * size, f.page * size + size);
    if (!slice.length) return '<div class="card empty">没有符合条件的题目，换个筛选试试</div>';
    return slice.map(q => quizCard(q)).join('') + pager(list.length, f.page, size, 'quiz');
  }
  function viewQuiz() {
    const f = UI.quiz;
    const done = Object.keys(S.quizStatus).length, right = Object.values(S.quizStatus).filter(v => v === 'right' || v === 'mastered').length;
    const days = f.week === 'all' ? ALLDAYS.map(d => ({ v: d.id, t: d.id + ' ' + d.title.slice(0, 12) })) : D.weeks.find(w => w.id === f.week).days.map(d => ({ v: d.id, t: d.id + ' ' + d.title.slice(0, 12) }));
    return '<div class="sec-head"><h2>随堂自测中心</h2><span class="sub">352 道分层习题 · 基础巩固 / 进阶实操 / 求职挑战 / 验收清单</span></div>' +
      statTiles([{ v: done, l: '已作答题目' }, { v: right, l: '已掌握题目' }, { v: (done ? Math.round(right / done * 100) : 0) + '%', l: '掌握率' }, { v: Object.values(S.quizStatus).filter(v => v === 'wrong').length, l: '待复习错题' }]) +
      '<div class="filter-bar">' +
      selectHtml('quiz', 'week', '周次', [{ v: 'all', t: '全部周次' }].concat(D.weeks.map(w => ({ v: w.id, t: 'W' + w.no + ' · ' + w.title.slice(0, 14) }))), f.week) +
      selectHtml('quiz', 'day', '天数', [{ v: 'all', t: '全部天数' }].concat(days), f.day) +
      selectHtml('quiz', 'layer', '难度层', [{ v: 'all', t: '全部层级' }, { v: '基础巩固', t: '基础巩固' }, { v: '进阶实操', t: '进阶实操' }, { v: '求职挑战', t: '求职挑战' }, { v: '验收清单', t: '验收清单' }], f.layer) +
      selectHtml('quiz', 'type', '题型', [{ v: 'all', t: '全部题型' }].concat(QUIZ_TYPES.map(t => ({ v: t, t }))), f.type) +
      '<input type="search" class="grow" placeholder="搜索题干 / 考点…" value="' + esc(f.q) + '" data-input="quiz" data-key="q">' +
      '<span class="chip click' + (f.onlyWrong ? ' on red' : '') + '" data-act="quiz-wrong">只看错题</span></div>' +
      '<div id="quizList">' + quizListHtml() + '</div>' +
      '<div class="notice" style="margin-top:16px"><b>作答说明：</b>选择题点选项即时判分；简答 / 方案设计题先看参考答案与评分要点，再自评「标记掌握」。提交给讲师批改请使用每日测评表单（在「每日学习」页）。</div>';
  }

  /* ---------------- 面试备考 ---------------- */
  function filteredQbank() {
    const f = UI.interview;
    return QBANK.filter(q => {
      if (f.src !== 'all' && q.srcName !== f.src) return false;
      if (f.level !== 'all' && q.level !== f.level) return false;
      if (f.type !== 'all' && q.type !== f.type) return false;
      if (f.onlyFav && !S.qbankFav.includes(q.id)) return false;
      if (f.rec !== 'all') {
        const w = D.weeks.find(x => x.id === f.rec);
        if (!w || !(w.suggestedQ || []).includes(q.id)) return false;
      }
      if (f.q && !(q.q + (q.a || '') + (q.tags || []).join(' ') + String(q.topic || '')).toLowerCase().includes(f.q.toLowerCase())) return false;
      return true;
    });
  }
  function qbCard(q) {
    const open = UI.interview.open[q.id], st = S.qbankStatus[q.id], fav = S.qbankFav.includes(q.id);
    return '<div class="q-card"><div class="q-head"><span class="qid">#' + esc(q.no) + ' · ' + esc(q.id) + '</span>' +
      '<span class="chip gray">' + esc(q.srcName) + '</span><span class="chip blue">' + esc(q.type) + '</span>' +
      '<span class="chip ' + (q.level === '高级' ? 'amber' : q.level === '中级' ? 'gray' : 'green') + '">' + esc(q.level) + '</span>' +
      (st ? '<span class="chip ' + (st === 'mastered' ? 'green' : st === 'fuzzy' ? 'amber' : 'red') + '">' + ({ mastered: '已掌握', fuzzy: '模糊', review: '待重学' }[st] || st) + '</span>' : '') +
      (fav ? '<span class="chip red">★ 已收藏</span>' : '') +
      (q.topic ? '<span class="tag" style="margin-left:auto">' + esc(q.topic) + '</span>' : '') + '</div>' +
      '<div class="q-stem">' + esc(q.q) + '</div>' +
      (open ? '<div class="q-answer ans-long"><span class="lbl">参考要点</span>' + esc(q.a) + (q.origin ? '<div class="meta">来源：' + esc(q.origin) + '</div>' : '') + '</div>' : '') +
      '<div class="q-foot"><button class="btn ghost sm" data-act="qb-flip" data-id="' + esc(q.id) + '">' + (open ? '收起答案' : '显示参考答案') + '</button>' +
      '<button class="btn gray sm" data-act="qb-status" data-id="' + esc(q.id) + '" data-v="mastered">✓ 掌握</button>' +
      '<button class="btn gray sm" data-act="qb-status" data-id="' + esc(q.id) + '" data-v="fuzzy">≈ 模糊</button>' +
      '<button class="btn gray sm" data-act="qb-status" data-id="' + esc(q.id) + '" data-v="review">↻ 重学</button>' +
      '<button class="btn gray sm" data-act="qb-fav" data-id="' + esc(q.id) + '">' + (fav ? '★ 取消' : '☆ 收藏') + '</button></div></div>';
  }
  function qbListHtml() {
    const f = UI.interview, list = filteredQbank(), size = 6;
    const pages = Math.max(1, Math.ceil(list.length / size));
    if (f.page >= pages) f.page = pages - 1;
    const slice = list.slice(f.page * size, f.page * size + size);
    if (!slice.length) return '<div class="card empty">没有符合条件的题目，换个筛选试试</div>';
    return slice.map(qbCard).join('') + pager(list.length, f.page, size, 'interview');
  }
  function viewInterview() {
    const f = UI.interview;
    const stVals = Object.values(S.qbankStatus);
    const recs = D.weeks.map(w => '<span class="chip click' + (f.rec === w.id ? ' on' : '') + '" data-act="qb-rec" data-v="' + w.id + '">' + w.id + ' 相关</span>').join('');
    return '<div class="sec-head"><h2>面试备考 · 775 道真题</h2><span class="sub">7 大题库 · 9 类题型 · 与 8 周课程对齐</span></div>' +
      statTiles([{ v: Object.keys(S.qbankStatus).length, l: '已标记题目' }, { v: stVals.filter(v => v === 'mastered').length, l: '已掌握' }, { v: stVals.filter(v => v === 'review' || v === 'fuzzy').length, l: '薄弱待强化' }, { v: S.qbankFav.length, l: '收藏题' }]) +
      '<div class="rec-bar"><span class="lbl">按周对齐：</span><span class="chip click' + (f.rec === 'all' ? ' on' : '') + '" data-act="qb-rec" data-v="all">全部</span>' + recs + '</div>' +
      '<div class="filter-bar">' +
      selectHtml('interview', 'src', '题库', [{ v: 'all', t: '全部题库' }].concat(D.qbankSources.map(s => ({ v: s, t: s }))), f.src) +
      selectHtml('interview', 'level', '难度', [{ v: 'all', t: '全部难度' }].concat(QB_LEVELS.map(s => ({ v: s, t: s }))), f.level) +
      selectHtml('interview', 'type', '题型', [{ v: 'all', t: '全部题型' }].concat(Array.from(new Set(QBANK.map(q => q.type))).filter(Boolean).sort().map(s => ({ v: s, t: s }))), f.type) +
      '<input type="search" class="grow" placeholder="搜索真题 / 答案关键词…" value="' + esc(f.q) + '" data-input="interview" data-key="q">' +
      '<span class="chip click' + (f.onlyFav ? ' on red' : '') + '" data-act="qb-onlyfav">★ 只看收藏</span></div>' +
      '<div id="qbList">' + qbListHtml() + '</div>' +
      '<div class="sec-head" style="margin-top:26px"><h2>原平台入口</h2><span class="sub">登录、模拟面试、面经与飞书进度同步</span></div>' +
      '<div class="ext-grid">' + [
        { n: 'AI PM 面试备考平台', d: '775 题浏览 · 翻卡练习 · 限时模拟面试 · 10 套真实面经 · 8 周课程地图，登记账号登录并同步进度', u: D.meta.prepUrl },
        { n: 'AI 术语概念词库', d: '115 个核心词条 × 10 大分类，频次来自真题，支持搜索 / 必背 / 随机自测', u: D.meta.prepUrl + 'glossary/' },
        { n: '面试平台源码与题库', d: '查看 7 张飞书数据表、构建脚本与二次开发说明', u: D.meta.repoPrep }
      ].map(x => '<div class="ext-card"><b>' + esc(x.n) + '</b><p>' + esc(x.d) + '</p><a class="btn ghost sm" href="' + esc(x.u) + '" target="_blank" rel="noopener">打开 ↗</a></div>').join('') + '</div>' +
      '<div class="notice" style="margin-top:14px"><b>进度说明：</b>本页的掌握 / 收藏标记保存在本机浏览器；跨设备同步与限时模拟面试请使用上方原平台（学员账号登录后自动同步到飞书）。</div>';
  }

  /* ---------------- 术语速查 ---------------- */
  function filteredTerms() {
    const f = UI.glossary;
    return TERMS.filter(t => {
      if (f.cat !== 'all' && t.cat !== f.cat) return false;
      if (f.hot && t.tier < 2) return false;
      if (f.q) {
        const hay = [t.name, t.en, t.one, t.plain, (t.aliases || []).join(' '), (t.interview || []).join(' ')].join(' ').toLowerCase();
        if (!hay.includes(f.q.toLowerCase())) return false;
      }
      return true;
    });
  }
  function termListHtml() {
    const list = filteredTerms();
    if (!list.length) return '<div class="card empty">没有匹配的术语</div>';
    return '<div class="term-grid">' + list.map(t => {
      const c = CATS.find(x => x.id === t.cat);
      return '<div class="term-card" data-act="term-open" data-id="' + esc(t.id) + '"><div class="top"><h4>' + esc(t.name) + '</h4><span class="tier t' + (t.tier || 0) + '">' + (['拓展', '常考', '高频', '必背'][t.tier] || '拓展') + '</span></div>' +
        '<div class="en">' + esc(t.en || '') + (c ? ' · ' + esc(c.name) : '') + '</div>' +
        '<div class="one">' + esc(t.one || t.plain || '') + '</div></div>';
    }).join('') + '</div>';
  }
  function viewGlossary() {
    const f = UI.glossary;
    const counts = {}; TERMS.forEach(t => counts[t.cat] = (counts[t.cat] || 0) + 1);
    const flash = f.flash ? TERM_BY_ID[f.flash] : null;
    return '<div class="sec-head"><h2>AI 术语速查</h2><span class="sub">115 个核心词条 × 10 大分类 · 频次标注来自 775 道面试真题</span></div>' +
      '<div class="grid g2" style="margin-bottom:18px"><div class="card pad"><div class="card-title"><span class="ico">◉</span>随机自测卡</div>' +
      (flash ? '<div class="flash" data-act="flash-flip"><div class="eyebrow" style="color:#C4B5FD">' + esc((CATS.find(c => c.id === flash.cat) || {}).name || '') + '</div><h3>' + esc(flash.name) + '</h3>' +
        (f.flipped ? '<p>' + esc(flash.plain || flash.one || '') + '</p>' : '<p>先用自己的话说出定义，再点击显示答案</p>') +
        '<div class="hintline">' + (f.flipped ? '点击卡片收起 · 下方按钮换一张' : '点击卡片显示答案') + '</div></div>' :
        '<div class="flash" data-act="flash-start"><h3>点这里抽一张</h3><p>用 115 条术语做间隔自测，面试前把高频词过一遍</p></div>') +
      '<div class="row" style="margin-top:11px"><button class="btn sm" data-act="flash-start">换一张 →</button><a class="btn ghost sm" href="' + esc(D.meta.prepUrl + 'glossary/') + '" target="_blank" rel="noopener">打开完整词库 ↗</a></div></div>' +
      '<div class="card pad"><div class="card-title"><span class="ico">◇</span>怎么用这份词库</div>' +
      '<ul class="small" style="margin-left:17px;line-height:2;color:var(--ink2)"><li>W1–W3 技术课：每天课前过 3–5 个相关术语，先建立直觉再听原理</li><li>W4–W6 做项目：把术语写进 PRD 与评审话术，能和工程师对齐</li><li>W7–W8 面试：只看「必背 / 高频」，用随机自测卡检验能否脱口而出</li></ul>' +
      '<div class="divider"></div><p class="tiny muted">词库由面试备考平台维护，分类与频次来自题库真题统计；本页为内置离线版，点击词条可看一句话解释、通俗类比与面试说法。</p></div></div>' +
      '<div class="filter-bar"><span class="chip click' + (f.cat === 'all' ? ' on' : '') + '" data-act="term-cat" data-v="all">全部 ' + TERMS.length + '</span>' +
      CATS.map(c => '<span class="chip click' + (f.cat === c.id ? ' on' : '') + '" data-act="term-cat" data-v="' + esc(c.id) + '">' + esc(c.name) + ' ' + (counts[c.id] || 0) + '</span>').join('') +
      '<span class="chip click' + (f.hot ? ' on red' : '') + '" data-act="term-hot">只看必背 / 高频</span>' +
      '<input type="search" class="grow" placeholder="搜索术语 / 英文 / 解释…" value="' + esc(f.q) + '" data-input="glossary" data-key="q"></div>' +
      '<div id="termList">' + termListHtml() + '</div>';
  }

  /* ---------------- 资源库 ---------------- */
  function resListHtml() {
    const f = UI.resources, g = D.resources.find(x => x.id === f.cat) || D.resources[0];
    const items = g.items.filter(x => !f.q || (x.name + x.desc).toLowerCase().includes(f.q.toLowerCase()));
    if (!items.length) return '<div class="card empty">没有匹配的资源</div>';
    return '<div class="res-grid">' + items.map(x => '<a class="res-card" href="' + esc(x.url) + '" target="_blank" rel="noopener"><b>' + esc(x.name) + '</b><p>' + esc(x.desc) + '</p><span class="go">打开资源 ↗</span></a>').join('') + '</div>';
  }
  function viewResources() {
    const f = UI.resources;
    return '<div class="sec-head"><h2>课程资源库</h2><span class="sub">8 周 40 天 · 320 件八件套物料 · 40 讲课件 · 交互工具 · 面试平台</span></div>' +
      '<div class="row" style="margin-bottom:14px">' + D.resources.map(g => '<span class="chip click' + (f.cat === g.id ? ' on' : '') + '" data-act="res-cat" data-v="' + esc(g.id) + '">' + g.icon + ' ' + esc(g.name) + ' · ' + g.items.length + '</span>').join('') + '</div>' +
      '<div class="filter-bar"><input type="search" class="grow" placeholder="搜索当前分类内的资源…" value="' + esc(f.q) + '" data-input="resources" data-key="q">' +
      '<span class="tiny muted">所有链接在新窗口打开，指向课程资源包 / 面试备考平台的在线页面</span></div>' +
      '<div id="resList">' + resListHtml() + '</div>' +
      '<div class="sec-head" style="margin-top:26px"><h2>8 周物料速查</h2><span class="sub">40 天 × 八件套，按目录直接取用（教案为入口）</span></div>' +
      D.weeks.map(w => '<details class="acc-week"><summary>▦ WEEK ' + esc(w.no) + ' · ' + esc(w.title) + ' <span class="chip gray" style="margin-left:6px">' + w.days.length * 8 + '+ 件</span></summary><div class="acc-body">' +
        w.days.map(d => '<div class="acc-day"><span class="id">' + esc(d.id) + '</span><span class="small" style="min-width:150px">' + esc(d.title.slice(0, 16)) + '</span>' +
          d.files.map(x => '<a href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(x.name) + '</a>').join('') + '</div>').join('') + '</div></details>').join('') +
      '<div class="notice" style="margin-top:16px"><b>资源来源：</b><a href="' + esc(D.meta.repoKit) + '" target="_blank" rel="noopener">课程资源包仓库</a>（1,763 个文件）与 <a href="' + esc(D.meta.repoPrep) + '" target="_blank" rel="noopener">面试备考平台仓库</a>；平台只做索引与学习编排，不复制课件内容。</div>';
  }

  /* ---------------- 作品集里程碑 ---------------- */
  function viewPortfolio() {
    const doneM = S.milestones.length, totalD = ALLDAYS.length, doneD = S.deliverables.length;
    return '<div class="sec-head"><h2>作品集与里程碑</h2><span class="sub">1 个贯穿式主项目 · 5 个里程碑 · 每周 1 组核心交付物</span></div>' +
      statTiles([{ v: doneM + '/5', l: '里程碑达成' }, { v: doneD + '/' + totalD, l: '交付物归档' }, { v: S.dayDone.length + '/40', l: '课程完成' }, { v: D.meta.rubric.length, l: 'Rubric 档位' }]) +
      '<div class="card pad" style="margin-bottom:20px"><div class="card-title"><span class="ico">◇</span>主线项目：「我的第一个 AI 产品」从 0 到 1</div>' +
      '<p class="small muted">整个训练营只做一个项目，但做透 5 轮：它同时是作品集核心件、简历第一行、面试 20 分钟的谈资。题目按「行业 × 场景 × 人群」三维自选，W2 周五锁定后不再更换。W7–W8 不再开发新功能，而是把项目加工成就业资产。</p></div>' +
      '<div class="mile-grid" style="margin-bottom:22px">' + D.milestones.map((m, i) => {
        const on = S.milestones.includes(m.id);
        return '<div class="mile' + (on ? ' done' : '') + '"><div class="no">MILESTONE 0' + (i + 1) + '</div><h4>' + esc(m.name) + '</h4><div class="when">' + esc(m.when) + '</div>' +
          '<p>' + esc(m.desc) + '</p><div class="tiny muted" style="margin-bottom:9px">交付：' + esc(m.deliverable) + '</div>' +
          '<button class="btn ' + (on ? 'gray' : 'ghost') + ' sm" style="width:100%" data-act="toggle-mile" data-id="' + esc(m.id) + '">' + (on ? '✓ 已达成' : '标记达成') + '</button></div>';
      }).join('') + '</div>' +
      '<div class="sec-head"><h2>每周交付物归档</h2><span class="sub">勾选后自动计入进度；产出物全部可检查</span></div>' +
      D.weeks.map(w => '<div class="deliver-group card pad" style="margin-bottom:10px"><h4>W' + esc(w.no) + ' · ' + esc(w.title) + '　<span class="chip gray">' + esc(w.weekendOutput.slice(0, 22)) + '</span></h4>' +
        '<div class="deliver-grid">' + w.days.map((d, i) => { const k = w.id + '-DL-' + i, on = S.deliverables.includes(k); return '<div class="check' + (on ? ' on' : '') + '" data-act="toggle-deliver" data-key="' + esc(k) + '"><span class="box">' + (on ? '✓' : '') + '</span><span class="txt"><b style="color:var(--purple)">' + esc(d.id) + '</b> · ' + esc(d.deliverable) + '</span></div>'; }).join('') + '</div></div>').join('') +
      '<div class="sec-head" style="margin-top:24px"><h2>验收与考核</h2><span class="sub">每周 Rubric 三档 + 综合评定</span></div>' +
      '<div class="rubric-grid">' + D.meta.rubric.map(r => '<div class="rubric"><b>' + esc(r) + '</b><p>产出物按三档描述检查，优秀档要求可对外展示</p></div>').join('') + '</div>' +
      '<div class="notice" style="margin-top:12px"><b>综合评定：</b>' + esc(D.meta.grading) + '；结业产出＝结业证书 + 在线作品集 + 主项目演示链接。主项目未过验收者可免费跟下一期重做。</div>';
  }

  /* ---------------- 学习进度 / 设置 ---------------- */
  function viewProgress() {
    const p = progress();
    const cur = currentDayId();
    const lines = [
      { l: '课程完成（权重 50%）', v: p.course }, { l: '习题掌握（权重 20%）', v: p.quiz },
      { l: '面试真题（权重 15%）', v: p.interview }, { l: '作品集里程碑（权重 15%）', v: p.portfolio }
    ];
    return '<div class="sec-head"><h2>我的学习进度</h2><span class="sub">数据保存在本机浏览器（localStorage），可导出备份</span></div>' +
      '<div class="card stat-card" style="margin-bottom:20px">' + ring(p.total, '综合进度') + '<div class="stat-detail">' +
      lines.map(x => '<div><div class="stat-line"><span>' + esc(x.l) + '</span><b>' + pct(x.v) + '</b></div><div class="bar"><div class="bar-fill" style="width:' + (x.v * 100) + '%"></div></div></div>').join('') + '</div>' +
      '<div class="stat-badges"><div class="stat-badge"><b>' + S.dayDone.length + '</b><span>完成天数</span></div><div class="stat-badge"><b>' + p.right + '</b><span>掌握习题</span></div>' +
      '<div class="stat-badge"><b>' + Object.keys(S.qbankStatus).length + '</b><span>练过真题</span></div></div></div>' +
      '<div class="grid g2" style="margin-bottom:20px"><div class="card pad"><div class="card-title"><span class="ico">▦</span>40 天完成热力图</div>' +
      '<div class="heatmap"><div></div>' + ['周一', '周二', '周三', '周四', '周五'].map(x => '<div class="heat-label" style="text-align:center">' + x + '</div>').join('') +
      D.weeks.map(w => '<div class="heat-label">W' + esc(w.no) + '</div>' + w.days.map(d => '<a class="heat-cell' + (S.dayDone.includes(d.id) ? ' done' : '') + (cur === d.id ? ' current' : '') + '" href="#/learn/' + d.id + '" title="' + esc(d.id + ' ' + d.title) + '">' + esc(d.id.slice(-2)) + '</a>').join('')).join('') + '</div>' +
      '<p class="tiny muted" style="margin-top:12px">紫色＝已完成，蓝色描边＝按开课日期推算的今天；点击格子直达当天学习。</p></div>' +
      '<div class="card pad"><div class="card-title"><span class="ico">◎</span>每周完成度</div>' +
      D.weeks.map(w => { const n = w.days.filter(d => S.dayDone.includes(d.id)).length; return '<div style="margin-bottom:11px"><div class="stat-line"><span>W' + esc(w.no) + ' · ' + esc(w.title.slice(0, 20)) + '</span><b>' + n + ' / 5</b></div><div class="bar"><div class="bar-fill" style="width:' + (n / 5 * 100) + '%"></div></div></div>'; }).join('') + '</div></div>' +
      '<div class="card pad"><div class="card-title"><span class="ico">⚙</span>学习设置与数据</div>' +
      '<div class="settings-grid"><label class="fld">学员称呼<input type="text" id="setName" value="' + esc(S.name) + '" placeholder="例如：张同学"></label>' +
      '<label class="fld">开课日期（周一）<input type="date" id="setStart" value="' + esc(S.startDate) + '"></label>' +
      '<div style="display:flex;align-items:flex-end;gap:8px;flex-wrap:wrap"><button class="btn sm" data-act="save-settings">保存设置</button>' +
      '<button class="btn ghost sm" data-act="export">导出进度 JSON</button><button class="btn gray sm" data-act="reset">重置进度</button></div></div>' +
      '<div class="divider"></div><p class="tiny muted">设置开课日期后，「学习总览」会按 8 周节奏推算当天该学的课程；不填则始终推荐第一个未完成的学习日。导出文件可用于换设备时恢复学习记录。</p></div>' +
      '<div class="notice" style="margin-top:16px"><b>跨平台说明：</b>本平台进度存本机；面试备考平台的刷题进度由学员账号 + 飞书多维表格跨设备同步。两者互补，不互相覆盖。</div>';
  }

  /* ---------------- 术语详情弹窗 ---------------- */
  function showTerm(id) {
    const t = TERM_BY_ID[id]; if (!t) return;
    const c = CATS.find(x => x.id === t.cat);
    const sec = (title, body) => body ? '<div class="m-sec"><b>' + title + '</b><p>' + esc(Array.isArray(body) ? body.join('\n') : body) + '</p></div>' : '';
    return '<button class="m-close" data-act="close-modal">×</button>' +
      '<div class="eyebrow">' + esc((c && c.name) || '') + ' · ' + (['拓展', '常考', '高频', '必背'][t.tier] || '') + '</div>' +
      '<h3>' + esc(t.name) + '</h3><div class="m-sub">' + esc(t.en || '') + (t.level ? ' · 难度 ' + ['', '初级', '中级', '高级'][t.level] : '') + ' · 真题出现 ' + esc(t.freq || 0) + ' 次</div>' +
      sec('一句话定义', t.one) + sec('通俗解释', t.plain) + sec('面试怎么说', t.interview) +
      (t.related && t.related.length ? '<div class="m-sec"><b>相关术语</b><p>' + t.related.map(r => (TERM_BY_ID[r] || {}).name || r).join(' · ') + '</p></div>' : '') +
      '<div class="m-sec"><button class="btn ghost sm" data-act="go" data-to="#/glossary">在术语库中查看 →</button></div>';
  }
  function showModal(html) { $('#modalBox').innerHTML = html; $('#modalOverlay').hidden = false; }
  function closeModal() { $('#modalOverlay').hidden = true; }

  /* ---------------- 全局搜索 ---------------- */
  function searchHtml(kw) {
    if (!kw.trim()) return '<div class="search-hint">输入关键词开始搜索 · 试试「RAG」「评测」「PRD」「Agent」</div>';
    const q = kw.trim().toLowerCase(), limit = 6, out = [];
    const days = ALLDAYS.filter(d => (d.title + d.theory + d.highlight).toLowerCase().includes(q)).slice(0, limit);
    const quiz = QUIZ.filter(x => (x.stem + x.kaodian).toLowerCase().includes(q)).slice(0, limit);
    const qb = QBANK.filter(x => x.q.toLowerCase().includes(q)).slice(0, limit);
    const terms = TERMS.filter(t => (t.name + (t.en || '') + (t.one || '') + (t.aliases || []).join('')).toLowerCase().includes(q)).slice(0, limit);
    const res = D.resources.flatMap(g => g.items.filter(x => (x.name + x.desc).toLowerCase().includes(q)).slice(0, 3)).slice(0, limit);
    const group = (name, items, fn) => items.length ? '<div class="sr-group">' + name + '</div>' + items.map(fn).join('') : '';
    out.push(group('课程', days, d => '<div class="sr-item" data-act="sr-day" data-id="' + esc(d.id) + '"><span class="k">' + esc(d.id) + '</span><span class="t">' + esc(d.title) + '</span><span class="tiny muted">进入学习</span></div>'));
    out.push(group('随堂自测', quiz, x => '<div class="sr-item" data-act="sr-quiz" data-q="' + esc(q) + '"><span class="k">' + esc(x.day) + '</span><span class="t">' + esc(x.stem.slice(0, 60)) + '</span><span class="tiny muted">自测中心</span></div>'));
    out.push(group('面试真题', qb, x => '<div class="sr-item" data-act="sr-qb" data-q="' + esc(q) + '"><span class="k">#' + esc(x.no) + '</span><span class="t">' + esc(x.q.slice(0, 60)) + '</span><span class="tiny muted">面试备考</span></div>'));
    out.push(group('术语', terms, t => '<div class="sr-item" data-act="term-open" data-id="' + esc(t.id) + '"><span class="k">' + esc(t.name) + '</span><span class="t">' + esc((t.one || '').slice(0, 60)) + '</span><span class="tiny muted">查看词条</span></div>'));
    out.push(group('资源', res, x => '<a class="sr-item" href="' + esc(x.url) + '" target="_blank" rel="noopener" data-act="close-search"><span class="k">资源</span><span class="t">' + esc(x.name) + '</span><span class="tiny muted">打开 ↗</span></a>'));
    return out.join('') || '<div class="search-hint">没有找到相关内容</div>';
  }
  function openSearch() {
    $('#searchOverlay').hidden = false;
    $('#globalSearch').value = '';
    $('#searchResults').innerHTML = searchHtml('');
    setTimeout(() => $('#globalSearch').focus(), 30);
  }
  function closeSearch() { $('#searchOverlay').hidden = true; }

  /* ---------------- 渲染 ---------------- */
  const VIEWS = { dashboard: viewDashboard, map: viewMap, learn: viewLearn, quiz: viewQuiz, interview: viewInterview, glossary: viewGlossary, resources: viewResources, portfolio: viewPortfolio, progress: viewProgress };
  const CRUMBS = { dashboard: '学习总览', map: '8 周课程地图', learn: '每日学习', quiz: '随堂自测中心', interview: '面试备考', glossary: '术语速查', resources: '课程资源库', portfolio: '作品集里程碑', progress: '学习进度与设置' };
  function parseHash() {
    const h = location.hash.replace(/^#\/?/, '') || 'dashboard';
    const parts = h.split('/');
    return { route: VIEWS[parts[0]] ? parts[0] : 'dashboard', arg: parts[1] || '' };
  }
  function render() {
    const { route, arg } = parseHash();
    $('#view').innerHTML = VIEWS[route](arg);
    $('#crumb').textContent = CRUMBS[route];
    $$('.nav-item').forEach(a => a.classList.toggle('active', a.dataset.route === route));
    const p = progress();
    $('#sidePct').textContent = pct(p.total);
    $('#sideBar').style.width = (p.total * 100) + '%';
    $('#topMini').innerHTML = '<span>已完成</span><b>' + S.dayDone.length + '/' + D.meta.stats.days + '</b><span>天</span>';
    $('#avatarBtn').textContent = (S.name || '学').slice(0, 1);
    if (window.scrollY > 100) window.scrollTo({ top: 0, behavior: 'instant' });
    $('#sidebar').classList.remove('open');
  }

  /* ---------------- 列表局部刷新 ---------------- */
  function refresh(which) {
    const map = { quiz: ['#quizList', quizListHtml], interview: ['#qbList', qbListHtml], glossary: ['#termList', termListHtml], resources: ['#resList', resListHtml] };
    if (map[which]) { const el = $(map[which][0]); if (el) el.innerHTML = map[which][1](); }
  }

  /* ---------------- 事件 ---------------- */
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act, v = t.dataset.v, id = t.dataset.id;
    switch (act) {
      case 'go': location.hash = t.dataset.to; break;
      case 'toggle-day': toggleIn(S.dayDone, id); save(); render(); toast(S.dayDone.includes(id) ? '已完成 ' + id : '已取消完成标记'); break;
      case 'toggle-task': S.tasks[t.dataset.key] = !S.tasks[t.dataset.key]; save(); render(); break;
      case 'toggle-deliver': toggleIn(S.deliverables, t.dataset.key); save(); render(); break;
      case 'toggle-mile': toggleIn(S.milestones, id); save(); render(); toast('里程碑已更新'); break;
      case 'quiz-opt': {
        const i = Number(t.dataset.i), q = QUIZ[i], pick = t.dataset.opt;
        const ok = String(q.answer || '').toUpperCase().includes(pick);
        S.quizStatus[i] = ok ? 'right' : 'wrong'; save();
        // 局部替换卡片
        const card = t.closest('.q-card');
        if (card) card.outerHTML = quizCard(q, { picked: pick, show: !ok });
        break;
      }
      case 'quiz-show': {
        const i = Number(t.dataset.i); UI.learn.openAns[i] = !UI.learn.openAns[i];
        const card = t.closest('.q-card'); if (card) card.outerHTML = quizCard(QUIZ[i]);
        break;
      }
      case 'quiz-master': {
        const i = Number(t.dataset.i); S.quizStatus[i] = S.quizStatus[i] === 'mastered' ? '' : 'mastered'; save();
        const card = t.closest('.q-card'); if (card) card.outerHTML = quizCard(QUIZ[i]);
        break;
      }
      case 'quiz-more': UI.learn.showAllQuiz = !UI.learn.showAllQuiz; render(); break;
      case 'quiz-wrong': UI.quiz.onlyWrong = !UI.quiz.onlyWrong; UI.quiz.page = 0; render(); break;
      case 'page': { const u = t.dataset.ui; UI[u].page = Number(v); refresh(u); window.scrollTo({ top: 0, behavior: 'smooth' }); break; }
      case 'map-stage': UI.map.stage = v; render(); break;
      case 'qb-flip': {
        UI.interview.open[id] = !UI.interview.open[id];
        if (t.dataset.inline) render(); else { const card = t.closest('.q-card'); if (card) card.outerHTML = qbCard(QB_BY_ID[id]); }
        break;
      }
      case 'qb-status': S.qbankStatus[id] = v; save(); { const card = t.closest('.q-card'); if (card) card.outerHTML = qbCard(QB_BY_ID[id]); } break;
      case 'qb-fav': toggleIn(S.qbankFav, id); save(); { const card = t.closest('.q-card'); if (card) card.outerHTML = qbCard(QB_BY_ID[id]); } break;
      case 'qb-rec': UI.interview.rec = v; UI.interview.page = 0; render(); break;
      case 'qb-onlyfav': UI.interview.onlyFav = !UI.interview.onlyFav; UI.interview.page = 0; render(); break;
      case 'term-open': showModal(showTerm(id)); closeSearch(); break;
      case 'term-cat': UI.glossary.cat = v; render(); break;
      case 'term-hot': UI.glossary.hot = !UI.glossary.hot; render(); break;
      case 'flash-start': {
        const pool = filteredTerms().length ? filteredTerms() : TERMS;
        UI.glossary.flash = pool[Math.floor(Math.random() * pool.length)].id;
        UI.glossary.flipped = false; render(); break;
      }
      case 'flash-flip': UI.glossary.flipped = !UI.glossary.flipped; render(); break;
      case 'res-cat': UI.resources.cat = v; UI.resources.q = ''; render(); break;
      case 'save-settings': {
        S.name = ($('#setName').value || '同学').trim(); S.startDate = $('#setStart').value || ''; save(); render(); toast('设置已保存');
        break;
      }
      case 'export': {
        const blob = new Blob([JSON.stringify({ app: 'ai-pm-learning-platform', exportedAt: new Date().toISOString(), state: S }, null, 2)], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'aipm-progress-' + new Date().toISOString().slice(0, 10) + '.json'; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000); toast('进度已导出'); break;
      }
      case 'reset': {
        showModal('<button class="m-close" data-act="close-modal">×</button><h3>重置学习进度？</h3><div class="m-sub">将清除本机的打卡、习题掌握、面试标记、里程碑与交付物归档，操作不可撤销。</div>' +
          '<div class="row" style="margin-top:18px"><button class="btn gray" data-act="close-modal">取消</button><button class="btn" data-act="reset-confirm">确认重置</button></div>'); break;
      }
      case 'reset-confirm': S = Object.assign({}, DEFAULT, { dayDone: [], tasks: {}, quizStatus: {}, qbankStatus: {}, qbankFav: [], milestones: [], deliverables: [] }); save(); closeModal(); render(); toast('进度已重置'); break;
      case 'close-modal': closeModal(); break;
      case 'open-search': openSearch(); break;
      case 'close-search': closeSearch(); break;
      case 'sr-day': closeSearch(); location.hash = '#/learn/' + id; break;
      case 'sr-quiz': closeSearch(); UI.quiz.q = t.dataset.q; UI.quiz.page = 0; location.hash = '#/quiz'; break;
      case 'sr-qb': closeSearch(); UI.interview.q = t.dataset.q; UI.interview.page = 0; location.hash = '#/interview'; break;
    }
  });

  document.addEventListener('change', (e) => {
    const t = e.target.closest('[data-change]'); if (!t) return;
    const u = t.dataset.ui, k = t.dataset.change;
    UI[u][k] = t.value; UI[u].page = 0;
    if (k === 'week' && u === 'quiz') UI.quiz.day = 'all';
    if (k === 'week' && u === 'interview') UI.interview.rec = 'all';
    render();
  });
  document.addEventListener('input', (e) => {
    const t = e.target.closest('[data-input]');
    if (t) {
      const u = t.dataset.ui; UI[u][t.dataset.key] = t.value; UI[u].page = 0; refresh(u); return;
    }
    if (e.target.id === 'globalSearch') $('#searchResults').innerHTML = searchHtml(e.target.value);
  });
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); }
    if (e.key === 'Escape') { closeSearch(); closeModal(); $('#sidebar').classList.remove('open'); }
  });
  $('#searchTrigger').addEventListener('click', openSearch);
  $('#searchOverlay').addEventListener('click', (e) => { if (e.target.id === 'searchOverlay') closeSearch(); });
  $('#modalOverlay').addEventListener('click', (e) => { if (e.target.id === 'modalOverlay') closeModal(); });
  $('#menuBtn').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  $('#avatarBtn').addEventListener('click', () => { location.hash = '#/progress'; });
  window.addEventListener('hashchange', render);

  if (!location.hash) location.hash = '#/dashboard';
  render();
})();
