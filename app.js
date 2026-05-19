// ════════════════════════════════════════════════════════════════════
// app.js — ตรรกะของแอปทั้งหมด
//   ต้องโหลด data.js ก่อน เพื่อให้ MEALS / FEEDERS / ฯลฯ พร้อมใช้
// ════════════════════════════════════════════════════════════════════

// ── Storage helpers ───────────────────────────────────────────────────
function getCfg() {
  const cfg = JSON.parse(localStorage.getItem('cfg')||'null') || { name:'มอคค่า', times:['07:00','12:00','18:00','21:00'] };
  if (!Array.isArray(cfg.times)) cfg.times = [];
  while (cfg.times.length < 4) cfg.times.push('21:00');
  return cfg;
}
function todayKey() { const d=new Date(); return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`; }
function getLog(k) { return (JSON.parse(localStorage.getItem('log')||'{}')||{})[k||todayKey()]||{}; }
function writeLog(id, val) {
  const all = JSON.parse(localStorage.getItem('log')||'{}'), k = todayKey();
  if (!all[k]) all[k]={};
  if (val===null) delete all[k][id]; else all[k][id]=val;
  const ks=Object.keys(all).sort(); while(ks.length>60) delete all[ks.shift()];
  localStorage.setItem('log', JSON.stringify(all));
  if (!window.db) return;
  try {
    const ref = window.db.collection('logs').doc(k);
    if (val===null) {
      const u={}; u[id]=firebase.firestore.FieldValue.delete();
      ref.update(u).catch(()=>{});
    } else {
      const s={}; s[id]=val;
      ref.set(s, { merge:true });
    }
  } catch(e) { console.warn('writeLog Firebase error:', e); }
}
function getNotes(k) { return (JSON.parse(localStorage.getItem('notes')||'{}')||{})[k||todayKey()]||[]; }
function saveNotes(arr, k) {
  const key = k||todayKey();
  const all = JSON.parse(localStorage.getItem('notes')||'{}');
  all[key] = arr;
  const ks=Object.keys(all).sort(); while(ks.length>60) delete all[ks.shift()];
  localStorage.setItem('notes', JSON.stringify(all));
  if (!window.db) return;
  try { window.db.collection('notes').doc(key).set({ items: arr }); }
  catch(e) { console.warn('saveNotes Firebase error:', e); }
}

// meal log อาจเป็น string (legacy) หรือ object — แปลงให้เป็น object เสมอ
function asFed(v) { if (!v) return null; return typeof v==='string' ? {time:v,by:'',food:''} : v; }

// helper เล็ก ๆ
function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ── Header / date card ───────────────────────────────────────────────
function renderHeader() {
  renderDateCard();
  // calendar subtitle "ภาพรวม · MONTH"
  const sub = document.getElementById('calSubtitle');
  if (sub) sub.textContent = `ภาพรวม · ${MONTHS_F[new Date().getMonth()]}`;
}

function renderDateCard() {
  const cfg=getCfg(), log=getLog(), now=new Date();
  const dayEl=document.getElementById('dcDay'), dateEl=document.getElementById('dcDate');
  if (dayEl) dayEl.textContent = `วัน${DAYS_F[now.getDay()]}`;
  if (dateEl) dateEl.textContent = `${now.getDate()} ${MONTHS_S[now.getMonth()]}`;

  let nextMin=Infinity, nextLabel='';
  MEALS.forEach((m,i) => {
    if (log[m.id]) return;
    const [h,mn]=cfg.times[i].split(':').map(Number);
    const t=new Date(now); t.setHours(h,mn,0,0);
    const diff=Math.round((t-now)/60000);
    if (diff>0 && diff<nextMin) { nextMin=diff; nextLabel=m.label; }
  });
  const el=document.getElementById('dcNext');
  if (!el) return;
  el.classList.remove('dc-next','all','soon');
  if (MEALS.every(m=>log[m.id])) {
    el.textContent='✓ ครบทุกมื้อแล้ว';
    el.classList.add('all');
  } else if (nextLabel) {
    const h=Math.floor(nextMin/60), mn=nextMin%60;
    el.textContent=`${nextLabel} · อีก ${h?h+' ชม. ':''}${mn} นาที`;
    if (nextMin<=30) el.classList.add('soon');
  } else {
    el.textContent='';
  }
}

function tickClock() {
  const now=new Date(), el=document.getElementById('dcClock');
  if (el) el.textContent=`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
}

// ── Skip-meal banner (Cozy v3) ───────────────────────────────────────
function renderSkipBanner() {
  const log = getLog();
  const skipped = MEALS.filter(m => {
    const f = asFed(log[m.id]);
    return f && f.skipped && (!f.skipReason || f.skipReason.trim().length < 3);
  });
  const bar = document.getElementById('skipBanner');
  if (!bar) return;
  if (!skipped.length) { bar.style.display='none'; return; }
  const labels = skipped.map(m => m.label).join(', ');
  bar.innerHTML = `
    <div class="banner__icon" aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M12 8v5m0 3v.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
        <path d="M3 19h18L12 3 3 19z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
      </svg>
    </div>
    <div class="banner__body">
      <div class="banner__title">มอคค่าไม่กิน ${escHtml(labels)}</div>
      <p>แตะเพื่อจดเหตุผล — จะได้ดูย้อนหลังได้</p>
    </div>`;
  bar.style.display = '';
  bar.onclick = () => openSkipNote(skipped[0].id, skipped[0].label);
}

// ── Notes (Cozy v3) ──────────────────────────────────────────────────
function renderNotes() {
  const list = document.getElementById('notesList');
  const notes = getNotes();
  const active = notes.filter(n => !n.deleted);
  if (!active.length) { list.innerHTML='<div class="note-empty" style="padding:18px 14px;color:var(--c-muted);font-size:13px;text-align:center">ยังไม่มีบันทึกวันนี้</div>'; return; }
  const PRI = { high:0, mid:1, low:2 };
  const sorted = [...active].sort((a,b) => (PRI[a.priority||'mid']||1) - (PRI[b.priority||'mid']||1));
  const DOT = { high:'rust', mid:'caramel', low:'sage' };
  list.innerHTML = sorted.map((n,i) => {
    const dotColor = DOT[n.priority||'mid'];
    const divider = i > 0 ? '<hr class="notes__divider">' : '';
    return `${divider}
    <div class="note" id="note-${n.id}">
      <span class="note__dot note__dot--${dotColor}" aria-hidden="true"></span>
      <div class="note-check${n.done?' done':''}" onclick="toggleNoteDone(${n.id})">${n.done?'✓':''}</div>
      <div class="flex-1">
        <p class="note__text${n.done?' done':''}" onclick="startEditNote(${n.id})">${escHtml(n.text)}</p>
        <time class="note__time">${n.time}${n.by?' • '+n.by:''}</time>
      </div>
      <button class="note-del-x" onclick="deleteNote(${n.id})" aria-label="ลบ">×</button>
    </div>`;
  }).join('');
}

let notePri = 'mid';
function setPri(p) {
  notePri = p;
  ['high','mid','low'].forEach(x => {
    const el = document.getElementById(`ps-${x}`);
    if (el) el.classList.toggle('active', x===p);
  });
}

function openNoteModal() {
  document.getElementById('noteTextInput').value='';
  document.getElementById('noteTextInput').placeholder = 'เช่น: มอคค่าไม่กินข้าวเช้า, ให้ยาพยาธิแล้ว...';
  notePri = 'mid'; setPri('mid');
  document.getElementById('ovNote').classList.add('open');
  setTimeout(()=>document.getElementById('noteTextInput').focus(),120);
}
function closeNoteModal() {
  document.getElementById('ovNote').classList.remove('open');
  // ถ้าผู้ใช้ปิด modal โดยไม่ save ขณะเป็น skip context → บอกว่า banner ยังเตือนอยู่
  if (_skipNoteCtx) {
    showToast('ไม่ได้จดเหตุผล — แตะแถบส้มเพื่อเพิ่มภายหลัง', 'info', 2400);
    _skipNoteCtx = null;
  }
}

function saveNote() {
  const text = document.getElementById('noteTextInput').value.trim();
  if (!text) return;
  const now=new Date();
  const time=`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const notes=getNotes();
  notes.push({ id:Date.now(), text, time, done:false, priority:notePri });
  saveNotes(notes);

  // ถ้าโน้ตนี้ผูกกับมื้อ skip → บันทึก reason กลับเข้า meal log
  const wasSkipCtx = _skipNoteCtx;
  if (_skipNoteCtx) {
    const fed = asFed(getLog()[_skipNoteCtx.id]);
    if (fed) { fed.skipReason = text; writeLog(_skipNoteCtx.id, fed); }
    _skipNoteCtx = null;
  }
  closeNoteModal(); renderNotes(); renderToday();

  // chain: ถ้ายังมีมื้อ skip ที่ไม่มี reason → เปิด note modal ของมื้อถัดไปอัตโนมัติ
  if (wasSkipCtx) {
    const log = getLog();
    const nextPending = MEALS.find(m => {
      const f = asFed(log[m.id]);
      return f && f.skipped && (!f.skipReason || f.skipReason.trim().length < 3);
    });
    if (nextPending) {
      showToast(`ต่อ: จดเหตุผล${nextPending.label}`, 'info', 2000);
      setTimeout(() => openSkipNote(nextPending.id, nextPending.label), 400);
    }
  }
  renderSkipBanner();
}

function toggleNoteDone(id) {
  const notes=getNotes();
  const n=notes.find(x=>x.id===id); if (n) n.done=!n.done;
  saveNotes(notes); renderNotes();
}

function startEditNote(id) {
  const notes=getNotes(), n=notes.find(x=>x.id===id); if (!n) return;
  const el=document.getElementById(`note-${id}`);
  el.innerHTML=`
    <div class="note-body" style="flex:1">
      <div class="note-edit-row">
        <input class="note-edit-input" id="edit-${id}" value="${escHtml(n.text)}">
        <button class="btn-icon" onclick="saveEditNote(${id})">✓</button>
        <button class="btn-icon" onclick="renderNotes()">✕</button>
      </div>
    </div>`;
  document.getElementById(`edit-${id}`).focus();
}

function saveEditNote(id) {
  const val=document.getElementById(`edit-${id}`).value.trim(); if (!val) return;
  const notes=getNotes(), n=notes.find(x=>x.id===id); if (n) n.text=val;
  saveNotes(notes); renderNotes();
}

function deleteNote(id) {
  showConfirm('ลบบันทึกนี้?\nยังปรากฏในปฏิทิน', () => {
    const notes=getNotes(), n=notes.find(x=>x.id===id);
    if(n) n.deleted=true;
    saveNotes(notes); renderNotes(); showToast('ลบบันทึกแล้ว','ok');
  }, '🗑', 'ลบ', true);
}

// ── Today cards (Cozy v3) ────────────────────────────────────────────
// Map meal id → time-of-day asset key (assumes 4 meals in order)
const TIME_ASSET = ['morning','noon','evening','night'];

function renderToday() {
  const cfg=getCfg(), log=getLog(), now=new Date(), c=document.getElementById('cards');
  if (!c) return;
  const frag=document.createDocumentFragment();
  let fedCount = 0;
  MEALS.forEach((meal,i) => {
    if (log[meal.id]) fedCount++;
    const t=cfg.times?.[i] || '00:00', fed=asFed(log[meal.id]);
    const parts=t.split(':'), h=Number(parts[0])||0, mn=Number(parts[1])||0;
    const mt=new Date(now); mt.setHours(h,mn,0,0);
    const overdue=!fed && now>mt;
    const card=document.createElement('article');
    const timeIcon = `<div class="meal__icon" aria-hidden="true"><img src="img/time-${TIME_ASSET[i]||'morning'}.png" alt="" width="22" height="22"></div>`;

    if (fed && fed.skipped) {
      const reason = fed.skipReason ? `<div class="meal__detail"><div class="meal__foods" style="color:var(--c-rust)">${escHtml(fed.skipReason)}</div></div>` : '';
      const needNote = !fed.skipReason || fed.skipReason.trim().length < 3;
      card.className = 'meal meal--skipped';
      card.innerHTML=`
        <div class="meal__head">
          ${timeIcon}
          <span class="meal__status-empty" style="background:var(--c-rust);color:#fff" aria-label="ไม่กิน">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>
          </span>
        </div>
        <div class="meal__label">${meal.label}</div>
        <div class="meal__time">${t} · ไม่กิน${fed.time?' '+fed.time:''}</div>
        ${reason}
        <div class="meal__actions">
          ${needNote ? `<button class="btn btn--ghost" onclick="openSkipNote('${meal.id}','${meal.label}')">+ เหตุผล</button>` : ''}
          <button class="btn btn--ghost" onclick="event.stopPropagation();undoFeed('${meal.id}')">↩ ยกเลิก</button>
        </div>`;
    } else if (fed) {
      const info = [fed.by, fed.food].filter(Boolean).join(' · ');
      card.className = 'meal meal--done';
      card.onclick = () => openMealDetail(meal.id, meal.label, i);
      card.innerHTML=`
        <div class="meal__head">
          ${timeIcon}
          <span class="meal__status-done" aria-label="กินแล้ว">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>
        </div>
        <div class="meal__label">${meal.label}</div>
        <div class="meal__time">${t}${(fed.time && /^\d{1,2}:\d{2}$/.test(fed.time) && fed.time!==t) ? ' · '+fed.time : ''}</div>
        ${info ? `<div class="meal__detail"><div class="meal__foods">${escHtml(info)}</div></div>` : ''}
        <button class="meal__undo-mini" onclick="event.stopPropagation();undoFeed('${meal.id}')" aria-label="ยกเลิก">↩</button>`;
    } else {
      card.className = `meal${overdue?' meal--overdue':''}`;
      card.innerHTML=`
        <div class="meal__head">
          ${timeIcon}
          <span class="meal__status-empty">
            ${overdue
              ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 9v4m0 3v.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/></svg>`
              : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`}
          </span>
        </div>
        <div class="meal__label">${meal.label}</div>
        <div class="meal__time">${t}</div>
        <div class="meal__actions">
          <button class="btn btn--primary" onclick="openFeed('${meal.id}')" data-action="log-meal">ให้อาหาร</button>
          <button class="btn btn--ghost" onclick="markSkip('${meal.id}','${meal.label}')" data-action="skip-meal">ไม่กิน</button>
        </div>`;
    }
    frag.appendChild(card);
  });
  c.innerHTML='';
  c.appendChild(frag);

  // Update hero count + dots
  const total = MEALS.length;
  const countEl = document.getElementById('dcCount');
  if (countEl) countEl.textContent = fedCount;
  const dotsEl = document.getElementById('dcDots');
  if (dotsEl) dotsEl.innerHTML = Array.from({length: total}, (_,i) =>
    `<i${i < fedCount ? ' class="is-on"' : ''}></i>`
  ).join('');

  // kcalMeta — section header "X / Y kcal"
  const meta = document.getElementById('kcalMeta');
  if (meta) {
    const info = getDogInfo();
    const w = parseFloat(info.weight);
    if (w) {
      const target = Math.round(70 * Math.pow(w, .75) * 1.6);
      const perMeal = Math.round(target / total);
      meta.textContent = `${fedCount * perMeal} / ${target} kcal`;
    } else {
      meta.textContent = '';
    }
  }

  // streak (consecutive complete-day count up to today)
  const allLog = JSON.parse(localStorage.getItem('log')||'{}');
  let streak = 0;
  const cursor = new Date();
  while (true) {
    const k = `${cursor.getFullYear()}-${cursor.getMonth()+1}-${cursor.getDate()}`;
    const dlog = allLog[k] || {};
    const c = MEALS.filter(m => { const f=asFed(dlog[m.id]); return f && !f.skipped; }).length;
    if (c >= total) { streak++; cursor.setDate(cursor.getDate()-1); }
    else break;
  }
  const sd = document.getElementById('streakDays');
  if (sd) sd.textContent = streak;
  const sq = document.getElementById('streakQuote');
  if (sq) sq.textContent = streak === 0
    ? 'เริ่มต้นวันใหม่กันเลย'
    : streak < 3
      ? 'เริ่มต้นดี · มาต่อกันได้'
      : streak < 7
        ? 'กินครบ 4 มื้อ · เก่งมากมอคค่า'
        : 'นี่คือมาตรฐาน · สุดยอด!';
}

function undoFeed(id) { writeLog(id,null); renderToday(); renderHeader(); renderSkipBanner(); }

// ── Skip-meal flow (v2) ──────────────────────────────────────────────
let _skipNoteCtx = null; // { id, label } — เก็บไว้ตอน save note เพื่อ link reason กลับ

function markSkip(id, label) {
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  writeLog(id, { time, by:'', food:'', skipped:true, skipReason:'' });
  if (navigator.vibrate) navigator.vibrate(20);
  renderToday(); renderHeader();
  showToast(`บันทึก: ไม่กิน${label} — จดเหตุผลด้วย`, 'warn', 3200);
  setTimeout(() => openSkipNote(id, label), 320);
}

function openSkipNote(id, label) {
  _skipNoteCtx = { id, label };
  document.getElementById('noteTextInput').value = '';
  document.getElementById('noteTextInput').placeholder = `ทำไมมอคค่าไม่กิน${label}? (เช่น เบื่ออาหาร, ป่วย, อากาศร้อน)`;
  notePri = 'high'; setPri('high'); // skip = สำคัญ → ตั้งเป็นแดงอัตโนมัติ
  document.getElementById('ovNote').classList.add('open');
  setTimeout(()=>document.getElementById('noteTextInput').focus(),120);
}

// ── Meal detail modal ────────────────────────────────────────────────
function openMealDetail(id, label, idx) {
  const fed = asFed(getLog()[id]); if (!fed) return;
  document.getElementById('mdTitle').textContent = label;
  const total = fed.portions?.reduce((s,p)=>s+p.kcal,0) || 0;
  const rows = fed.portions?.length
    ? fed.portions.map(p=>`
        <div class="md-row">
          <div class="md-label">${p.label}</div>
          <div class="md-bar-wrap"><div class="md-bar" style="width:${Math.min(100,Math.round(p.g*1.5))}%"></div></div>
          <div class="md-nums"><strong>${p.g}g</strong><span>${p.kcal} kcal</span></div>
        </div>`).join('')
    : `<div style="font-size:.85rem;color:var(--t2);padding:8px 0">${fed.food||'ไม่มีข้อมูลสัดส่วน'}</div>`;
  document.getElementById('mdBody').innerHTML=`
    <div class="md-meta">${fed.by?'<span>👤 '+fed.by+'</span>':''}<span>🕐 ${fed.time||''}</span></div>
    ${rows}
    ${total?`<div class="md-total">รวม <strong>${total} kcal</strong></div>`:''}
    <button class="btn-undo" style="margin-top:14px" onclick="closeMealDetail();undoFeed('${id}')">↩ ยกเลิกการบันทึก</button>`;
  document.getElementById('ovMealDetail').classList.add('open');
}
function closeMealDetail() { document.getElementById('ovMealDetail').classList.remove('open'); }

// ── Feed Modal (3 steps) ──────────────────────────────────────────────
let pendingId=null, feedStep=1;
let selFeeder=null, customFeederVal='';
let selFoodType=null;
let selMeats=new Set(), selVegs=new Set();
let selPeriod=null, selCustomTime='';

function openFeed(id) {
  pendingId=id; feedStep=1;
  selFeeder=localStorage.getItem('lastFeeder')||null;
  selFoodType=localStorage.getItem('lastFoodType')||null;
  selMeats=new Set(JSON.parse(localStorage.getItem('lastMeats')||'[]'));
  selVegs=new Set(JSON.parse(localStorage.getItem('lastVegs')||'[]'));
  selPeriod=autoDetectPeriod(); selCustomTime='';

  document.getElementById('fmMealLabel').textContent = `บันทึก: ${MEALS.find(m=>m.id===id).label}`;
  buildFeederGrid(); buildFoodList(); buildPeriodGrid(); buildChips();
  setStep(1);
  document.getElementById('ovFeed').classList.add('open');
}

function closeFeed() { document.getElementById('ovFeed').classList.remove('open'); pendingId=null; }

function autoDetectPeriod() {
  const h=new Date().getHours();
  if (h>=5&&h<12) return 'morning';
  if (h>=12&&h<17) return 'noon';
  if (h>=17) return 'evening';
  return 'midnight';
}

function buildFeederGrid() {
  const g=document.getElementById('feederGrid');
  g.innerHTML = FEEDERS.map(f=>`
    <div class="feeder-btn${selFeeder===f.code?' sel':''}" id="fb-${f.code}" onclick="pickFeeder('${f.code}')">
      <div class="fb-code">${f.code}</div>
      <div class="fb-name">${f.name}</div>
    </div>`).join('') +
    `<div class="feeder-btn${selFeeder==='other'?' sel':''}" id="fb-other" onclick="pickFeeder('other')">
      <div class="fb-code" style="font-size:.85rem">อื่นๆ</div>
      <div class="fb-name">ระบุชื่อ</div>
    </div>`;
  document.getElementById('feederOther').style.display = selFeeder==='other'?'block':'none';
}

function pickFeeder(code) {
  selFeeder=code;
  document.querySelectorAll('.feeder-btn').forEach(b=>b.classList.remove('sel'));
  document.getElementById(`fb-${code}`)?.classList.add('sel');
  document.getElementById('feederOther').style.display = code==='other'?'block':'none';
  if (code!=='other') document.getElementById('customFeederTxt').value='';
}

function buildFoodList() {
  document.getElementById('foodList').innerHTML = FOOD_TYPES.map(f=>`
    <div class="food-btn${selFoodType===f.id?' sel':''}" id="ft-${f.id}" onclick="pickFoodType('${f.id}')">
      ${f.label}
    </div>`).join('');
  updateSubOptions();
}

function pickFoodType(id) {
  selFoodType=id;
  document.querySelectorAll('.food-btn').forEach(b=>b.classList.remove('sel'));
  document.getElementById(`ft-${id}`)?.classList.add('sel');
  const ft=FOOD_TYPES.find(f=>f.id===id);
  if (!ft.meat) selMeats=new Set();
  if (!ft.veg)  selVegs=new Set();
  updateSubOptions();
}

function updateSubOptions() {
  const ft=FOOD_TYPES.find(f=>f.id===selFoodType)||{meat:false,veg:false};
  document.getElementById('subMeat').style.display = ft.meat ? 'block' : 'none';
  document.getElementById('subVeg').style.display  = ft.veg  ? 'block' : 'none';
}

function buildChips() {
  document.getElementById('meatChips').innerHTML = MEATS.map(m=>`
    <span class="chip${selMeats.has(m)?' sel':''}" onclick="toggleChip('meat','${m}')">${m}</span>`).join('');
  document.getElementById('vegChips').innerHTML = VEGS.map(v=>`
    <span class="chip${selVegs.has(v)?' sel':''}" onclick="toggleChip('veg','${v}')">${v}</span>`).join('');
}

function toggleChip(type, val) {
  const set = type==='meat' ? selMeats : selVegs;
  set.has(val) ? set.delete(val) : set.add(val);
  buildChips();
}

function buildPeriodGrid() {
  document.getElementById('periodGrid').innerHTML = PERIODS.map(p=>`
    <div class="period-btn${selPeriod===p.id?' sel':''}" id="pp-${p.id}" onclick="pickPeriod('${p.id}')">
      <div class="pico">${p.icon}</div>
      <div class="pname">${p.name}</div>
      <div class="prange">${p.range}</div>
    </div>`).join('');
  const now=new Date();
  document.getElementById('customTime').value =
    `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
}

function pickPeriod(id) {
  selPeriod=id; selCustomTime='';
  document.querySelectorAll('.period-btn').forEach(b=>b.classList.remove('sel'));
  document.getElementById(`pp-${id}`)?.classList.add('sel');
}

function onCustomTime() {
  selCustomTime=document.getElementById('customTime').value;
  selPeriod='custom';
  document.querySelectorAll('.period-btn').forEach(b=>b.classList.remove('sel'));
}

function setStep(n) {
  feedStep=n;
  ['fmS1','fmS2','fmS3'].forEach((id,i) => {
    document.getElementById(id).style.display = i+1===n ? 'block' : 'none';
  });
  ['si1','si2','si3'].forEach((id,i) => {
    const el=document.getElementById(id);
    el.className = i+1<n ? 'si done' : i+1===n ? 'si active' : 'si';
    el.textContent = i+1<n ? '✓' : i+1;
  });
  ['sl1','sl2'].forEach((id,i) => {
    document.getElementById(id).className = n>i+2 ? 'si-line done' : 'si-line';
  });
  document.getElementById('stepLabel').textContent = STEP_LABELS[n-1];
  document.getElementById('btnBack').style.display = n>1 ? 'block' : 'none';
  document.getElementById('btnNext').textContent = n===3 ? '✓ บันทึก' : 'ถัดไป ›';
}

function nextStep() {
  if (feedStep===1) {
    if (!selFeeder) { showToast('เลือกผู้ให้อาหารด้วย','warn'); return; }
    if (selFeeder==='other' && !document.getElementById('customFeederTxt').value.trim()) {
      showToast('พิมพ์ชื่อผู้ให้อาหารด้วย','warn'); return;
    }
    setStep(2);
  } else if (feedStep===2) {
    if (!selFoodType) { showToast('เลือกประเภทอาหารด้วย','warn'); return; }
    setStep(3);
  } else {
    confirmFeed();
  }
}
function prevStep() { if (feedStep>1) setStep(feedStep-1); }

function confirmFeed() {
  const feederName = selFeeder==='other'
    ? (document.getElementById('customFeederTxt').value.trim()||'อื่นๆ')
    : (FEEDERS.find(f=>f.code===selFeeder)?.name||selFeeder);
  const ft=FOOD_TYPES.find(f=>f.id===selFoodType);
  let foodLabel=ft?.label||'';
  if (ft?.meat && selMeats.size) foodLabel+=` (${[...selMeats].map(m=>m.split(' ')[1]).join(', ')})`;
  if (ft?.veg && selVegs.size) foodLabel+=` + ${[...selVegs].map(v=>v.split(' ')[1]).join(', ')}`;

  const timeLabel = selCustomTime
    ? `${selCustomTime} น.`
    : (PERIODS.find(p=>p.id===selPeriod)?.name || '');

  // portions สำหรับ meal detail popup
  const _info=getDogInfo(), _w=parseFloat(_info.weight);
  let portions=[];
  if (_w && ft) {
    const _per=Math.round(Math.round(70*Math.pow(_w,.75))*1.6/getCfg().times.length);
    if (ft.id==='dry') {
      portions=[{label:'อาหารเม็ด',g:Math.round(_per/370*100),kcal:_per}];
    } else {
      const mr=ft.id==='dry+meat'?.25:.20;
      const mk=Math.round(_per*mr), dk=ft.id==='dry+meat'?_per-mk:Math.round(_per*.75);
      const mkey=[...selMeats][0]||'🐔 ไก่', mkc=MEAT_DATA[mkey]?.kcal||165;
      portions=[{label:'อาหารเม็ด',g:Math.round(dk/370*100),kcal:dk},{label:mkey+' (ต้ม/อบ)',g:Math.round(mk/mkc*100),kcal:mk}];
      if (ft.id==='dry+meat+veg'&&selVegs.size) portions.push({label:[...selVegs][0]||'ผัก',g:15,kcal:_per-dk-mk});
    }
  }
  writeLog(pendingId, { time:timeLabel, by:feederName, food:foodLabel, portions });

  localStorage.setItem('lastFeeder', selFeeder);
  localStorage.setItem('lastFoodType', selFoodType);
  localStorage.setItem('lastMeats', JSON.stringify([...selMeats]));
  localStorage.setItem('lastVegs', JSON.stringify([...selVegs]));

  closeFeed();
  if (navigator.vibrate) navigator.vibrate([30,10,30]);
  renderToday(); renderHeader(); renderSkipBanner();
}

// ── Calendar ─────────────────────────────────────────────────────────
let calY=new Date().getFullYear(), calM=new Date().getMonth();

function calPrev() { calM--; if(calM<0){calM=11;calY--;} renderCalendar(); }
function calNext() {
  const n=new Date();
  if (calY>n.getFullYear()||(calY===n.getFullYear()&&calM>=n.getMonth())) return;
  calM++; if(calM>11){calM=0;calY++;} renderCalendar();
}

function renderCalendar() {
  document.getElementById('calTitle').innerHTML =
    `${MONTHS_F[calM]} <span class="year">${calY+543}</span>`;
  const allLog=JSON.parse(localStorage.getItem('log')||'{}');
  const allNotes=JSON.parse(localStorage.getItem('notes')||'{}');
  const today=new Date(), grid=document.getElementById('calGrid');
  grid.innerHTML='';
  const firstDow=new Date(calY,calM,1).getDay();
  const lastDate=new Date(calY,calM+1,0).getDate();
  for(let i=0;i<firstDow;i++){
    grid.insertAdjacentHTML('beforeend', '<div></div>');
  }
  for(let d=1;d<=lastDate;d++){
    const key=`${calY}-${calM+1}-${d}`;
    const dl=allLog[key]||{};
    const cnt=MEALS.filter(m=>{ const f=asFed(dl[m.id]); return f && !f.skipped; }).length;
    const skipCnt=MEALS.filter(m=>{ const f=asFed(dl[m.id]); return f && f.skipped; }).length;
    const notes=(allNotes[key]||[]).length>0;
    const isToday=new Date(calY,calM,d).toDateString()===today.toDateString();
    const isFuture=new Date(calY,calM,d)>new Date(today.getFullYear(),today.getMonth(),today.getDate());

    let dotCls = '';
    if (skipCnt > 0) dotCls = 'day__dot--skip';
    else if (cnt === MEALS.length) dotCls = 'day__dot--complete';
    else if (cnt > 0) dotCls = 'day__dot--partial';
    else if (notes) dotCls = 'day__dot--note';

    const btn = document.createElement('button');
    btn.className = 'day';
    btn.setAttribute('role', 'gridcell');
    if (isToday) { btn.classList.add('day--today'); btn.setAttribute('aria-current','date'); }
    if (isFuture) btn.classList.add('day--faded');
    btn.innerHTML = `
      <span class="day__n">${d}</span>
      <span class="day__dot ${dotCls}" aria-hidden="true"></span>`;
    if (!isFuture) btn.onclick = () => openDay(key, d);
    grid.appendChild(btn);
  }
}

// ── Day detail ────────────────────────────────────────────────────────
function openDay(key, d) {
  const allLog=JSON.parse(localStorage.getItem('log')||'{}');
  const allNotes=JSON.parse(localStorage.getItem('notes')||'{}');
  const dl=allLog[key]||{}, dayNotes=allNotes[key]||[];
  document.getElementById('dayTitle').textContent=`${d} ${MONTHS_S[calM]} ${calY+543}`;
  const body=document.getElementById('dayBody');
  body.innerHTML='';
  MEALS.forEach(meal=>{
    const fed=asFed(dl[meal.id]);
    const el=document.createElement('div'); el.className='dd-item';
    let inner;
    if (fed && fed.skipped) {
      inner = `<div class="dd-info dd-skip"><span class="hi">💤 ไม่กิน</span>${fed.time?` • ${fed.time}`:''}${fed.skipReason?`<br>เหตุผล: ${escHtml(fed.skipReason)}`:''}</div>`;
    } else if (fed) {
      inner = `<div class="dd-info"><span class="hi">${fed.time}</span>${fed.by?` • ${fed.by}`:''}${fed.food?`<br>${fed.food}`:''}</div>`;
    } else {
      inner = `<div class="dd-none">ไม่มีบันทึก</div>`;
    }
    el.innerHTML=`<span class="dd-ico">${meal.icon}</span><div>
      <div class="dd-name">${meal.label}</div>
      ${inner}
    </div>`;
    body.appendChild(el);
  });
  if(dayNotes.length){
    const h=document.createElement('div');
    h.style.cssText='font-size:.72rem;color:var(--t2);font-weight:700;letter-spacing:.5px;text-transform:uppercase;margin-top:14px;margin-bottom:4px';
    h.textContent='📋 บันทึก';
    body.appendChild(h);
    dayNotes.forEach(n=>{
      const el=document.createElement('div');
      el.className=`dd-note-item${n.done?' done':''}${n.deleted?' dd-deleted':''}`;
      el.innerHTML=`<div class="dd-note-text">${escHtml(n.text)}</div><div class="dd-note-time">${n.time}${n.by?' • '+n.by:''}${n.deleted?' · ลบแล้ว':''}</div>`;
      body.appendChild(el);
    });
  }
  if (localStorage.getItem('adminPin')) {
    const editBtn=document.createElement('button');
    editBtn.className='btn-undo'; editBtn.style.marginTop='16px';
    editBtn.textContent='🔐 แก้ไขบันทึก (Admin)';
    editBtn.onclick=()=>adminEditDay(key,d);
    body.appendChild(editBtn);
  }
  document.getElementById('ovDay').classList.add('open');
}
function closeDay() { document.getElementById('ovDay').classList.remove('open'); }

function adminEditDay(key, d) {
  showPin(() => {
    const allLog=JSON.parse(localStorage.getItem('log')||'{}'), dl=allLog[key]||{};
    const checks=MEALS.map(m=>`
      <label style="display:flex;align-items:center;gap:10px;padding:10px 0;border-top:.5px solid var(--sep);font-size:.9rem;cursor:pointer">
        <input type="checkbox" id="ae-${m.id}" ${dl[m.id]?'checked':''} style="width:22px;height:22px;accent-color:var(--tint)">
        ${m.icon} ${m.label}
      </label>`).join('');
    const body=document.getElementById('dayBody');
    body.innerHTML=`<div style="font-size:.78rem;color:var(--warn);margin-bottom:12px;font-weight:700">✏️ โหมดแก้ไข Admin — ${d} ${MONTHS_S[calM]} ${calY+543}</div>
      ${checks}
      <button class="btn-save" style="margin-top:16px" onclick="saveAdminEdit('${key}')">บันทึกการแก้ไข</button>
      <button class="btn-undo" style="margin-top:8px" onclick="openDay('${key}',${d})">ยกเลิก</button>`;
  });
}

function saveAdminEdit(key) {
  const allLog=JSON.parse(localStorage.getItem('log')||'{}');
  if(!allLog[key]) allLog[key]={};
  MEALS.forEach(m=>{
    const checked=document.getElementById(`ae-${m.id}`)?.checked;
    if(checked && !allLog[key][m.id]) allLog[key][m.id]={time:'(Admin)',by:'Admin',food:''};
    if(!checked) delete allLog[key][m.id];
  });
  localStorage.setItem('log',JSON.stringify(allLog));
  if(window.db) try{ window.db.collection('logs').doc(key).set(allLog[key]||{}); }catch(e){}
  closeDay(); renderCalendar(); renderDash();
  showToast('บันทึกการแก้ไขเรียบร้อย','ok');
}

// ── Settings ──────────────────────────────────────────────────────────
function goEditProfile() {
  closeSettings();
  const nutritionBtn = document.querySelector('[data-tab="nutrition"]');
  if (nutritionBtn) showPage('nutrition', nutritionBtn);
  if (!isEditing) toggleEdit();
}

function openSettings() {
  const cfg=getCfg();
  document.getElementById('cfg0').value=cfg.times[0];
  document.getElementById('cfg1').value=cfg.times[1];
  document.getElementById('cfg2').value=cfg.times[2];
  document.getElementById('cfg3').value=cfg.times[3]||'21:00';
  updateNotifBtn();
  document.getElementById('ovSettings').classList.add('open');
}
function closeSettings() { document.getElementById('ovSettings').classList.remove('open'); }
function saveSettings() {
  const prev = getCfg();
  const cfg = {
    name: prev.name,
    times:[document.getElementById('cfg0').value,document.getElementById('cfg1').value,document.getElementById('cfg2').value,document.getElementById('cfg3').value],
  };
  localStorage.setItem('cfg', JSON.stringify(cfg));
  if (window.db) try { window.db.collection('config').doc('dog').set(cfg); } catch(e){}
  closeSettings(); renderHeader(); renderToday();
}

// ── Notifications ─────────────────────────────────────────────────────
async function reqNotif() {
  if (!('Notification' in window)){showToast('เบราว์เซอร์ไม่รองรับการแจ้งเตือน','err');return;}
  await Notification.requestPermission(); updateNotifBtn();
}
function updateNotifBtn() {
  const ok='Notification' in window && Notification.permission==='granted';
  const b=document.getElementById('notifBtn'); if(!b) return;
  b.textContent=ok?'✓ เปิดการแจ้งเตือนแล้ว':'🔔 เปิดการแจ้งเตือน';
  b.className=`btn-notif${ok?' on':''}`;
}
function checkNotif() {
  if(!('Notification' in window)||Notification.permission!=='granted') return;
  const cfg=getCfg(),log=getLog(),now=new Date();
  const nd=JSON.parse(localStorage.getItem('nd')||'{}');
  MEALS.forEach((meal,i)=>{
    if(log[meal.id]) return;
    const [h,mn]=cfg.times[i].split(':').map(Number);
    const mt=new Date(now); mt.setHours(h,mn,0,0);
    const diff=Math.round((mt-now)/60000);
    const k15=`p-${meal.id}-${todayKey()}`, k0=`n-${meal.id}-${todayKey()}`;
    if(diff===15&&!nd[k15]){new Notification(`อีก 15 นาที — ${meal.label} 🐾`,{body:`เตรียมให้อาหาร ${cfg.name}`,icon:'icon.svg',tag:k15});nd[k15]=true;}
    if(diff===0&&!nd[k0]){new Notification(`ถึงเวลา${meal.label}! 🍖`,{body:`ให้อาหาร ${cfg.name} ได้เลย`,icon:'icon.svg',tag:k0});nd[k0]=true;}
  });
  localStorage.setItem('nd',JSON.stringify(nd));
}

// ── Nav ───────────────────────────────────────────────────────────────
function showPage(name, btn) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t=>{ t.classList.remove('tab--active'); t.setAttribute('aria-selected','false'); });
  document.getElementById(`page-${name}`).classList.add('active');
  btn.classList.add('tab--active'); btn.setAttribute('aria-selected','true');
  if(name==='calendar') { renderCalendar(); renderDash(); }
  if(name==='nutrition') { renderInfo(); renderCalc(); renderFoodProducts(); renderCanEat(); renderDanger(); renderTips(); }
  window.scrollTo({ top:0, behavior:'instant' });
}

// ── Overlay dismiss (click outside) ───────────────────────────────────
function bindOverlayDismiss() {
  [['ovFeed',closeFeed],['ovNote',closeNoteModal],['ovDay',closeDay],['ovSettings',closeSettings],['ovMealDetail',closeMealDetail],['ovConfirm',confirmNo],['ovPin',closePin]].forEach(([id,fn])=>{
    document.getElementById(id).addEventListener('click',e=>{if(e.target===e.currentTarget) fn();});
  });
}

// ── Firebase real-time sync ──────────────────────────────────────────
let _syncTimer = null;
function setSyncStatus(state, detail) {
  const bar = document.getElementById('syncBar');
  const dot = document.getElementById('dcDot');
  const txt = document.getElementById('dcSyncTxt');
  const row = document.getElementById('syncRow');
  if (state==='ok') {
    if (bar) bar.style.display='none';
    if (dot) dot.style.background='var(--c-sage,var(--ok))';
    if (txt) txt.textContent='เชื่อมต่อแล้ว';
    if (row) {
      row.hidden = false;
      clearTimeout(_syncTimer);
      _syncTimer = setTimeout(() => { row.hidden = true; }, 1800);
    }
  } else if (state==='off') {
    if (bar) { bar.style.display='block'; bar.style.color='var(--err)'; bar.innerHTML='🔴 ออฟไลน์ — <span style="text-decoration:underline;cursor:pointer" onclick="location.reload()">แตะเพื่อ refresh</span>'; }
    if (dot) dot.style.background='var(--c-rust,var(--err))';
    if (txt) txt.textContent='ออฟไลน์';
    if (row) { clearTimeout(_syncTimer); row.hidden = false; }
  } else {
    if (bar) { bar.style.display='block'; bar.style.color='var(--t3)'; bar.textContent='⏳ กำลังเชื่อมต่อ…'; }
    if (dot) dot.style.background='var(--c-muted,var(--t3))';
    if (txt) txt.textContent='กำลังเชื่อมต่อ…';
    if (row) { clearTimeout(_syncTimer); row.hidden = false; }
  }
  if (detail) console.warn('[Sync]', detail);
}

function startSync() {
  if (!window.db) {
    setSyncStatus('off', 'window.db is null — Firebase SDK not loaded or old cache active');
    return;
  }
  const k = todayKey();

  window.db.collection('logs').doc(k).onSnapshot(snap => {
    setSyncStatus('ok');
    const data = snap.data() || {};
    const all = JSON.parse(localStorage.getItem('log')||'{}');
    if (JSON.stringify(all[k]) === JSON.stringify(data)) return;
    all[k] = data;
    localStorage.setItem('log', JSON.stringify(all));
    renderToday(); renderHeader(); renderSkipBanner();
  }, err => { console.warn('log snapshot error:', err); setSyncStatus('off'); });

  window.db.collection('notes').doc(k).onSnapshot(snap => {
    const items = (snap.data()||{}).items || [];
    const all = JSON.parse(localStorage.getItem('notes')||'{}');
    if (JSON.stringify(all[k]) === JSON.stringify(items)) return;
    all[k] = items;
    localStorage.setItem('notes', JSON.stringify(all));
    renderNotes();
  }, err => console.warn('notes snapshot error:', err));

  window.db.collection('config').doc('profile').onSnapshot(snap => {
    const data = snap.data(); if (!data) return;
    if (localStorage.getItem('dogInfo') === JSON.stringify(data)) return;
    localStorage.setItem('dogInfo', JSON.stringify(data));
    renderInfo();
  }, err => console.warn('profile snapshot error:', err));

  window.db.collection('config').doc('dog').onSnapshot(snap => {
    const data = snap.data();
    if (!data) return;
    const local = JSON.parse(localStorage.getItem('cfg')||'null');
    const merged = { ...(local||{}), ...data };
    if (!Array.isArray(merged.times) || merged.times.length < 3) return;
    if (localStorage.getItem('cfg') === JSON.stringify(merged)) return;
    localStorage.setItem('cfg', JSON.stringify(merged));
    renderHeader(); renderToday();
  }, err => console.warn('config snapshot error:', err));

  window.db.collection('logs').get().then(snap => {
    const all = JSON.parse(localStorage.getItem('log')||'{}');
    snap.forEach(d => { all[d.id] = d.data(); });
    localStorage.setItem('log', JSON.stringify(all));
  });
  window.db.collection('notes').get().then(snap => {
    const all = JSON.parse(localStorage.getItem('notes')||'{}');
    snap.forEach(d => { all[d.id] = (d.data().items||[]); });
    localStorage.setItem('notes', JSON.stringify(all));
  });
}

// ── Dark mode ─────────────────────────────────────────────────────────
function toggleDark() {
  const isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem('darkMode', isDark ? '1' : '0');
  const btn = document.getElementById('darkBtn');
  if (btn) btn.textContent = isDark ? '☀️ โหมดสว่าง' : '🌙 โหมดมืด';
}
function applyDarkMode() {
  const isDark = localStorage.getItem('darkMode') === '1';
  document.documentElement.classList.toggle('dark', isDark);
  const btn = document.getElementById('darkBtn');
  if (btn) btn.textContent = isDark ? '☀️ โหมดสว่าง' : '🌙 โหมดมืด';
}

// ── Nutrition: profile info ───────────────────────────────────────────
let isEditing = false;

function getDogInfo() {
  return JSON.parse(localStorage.getItem('dogInfo')||'null') || { ...INFO_DEFAULTS };
}

function calcKcal(w) {
  w = parseFloat(w);
  if (isNaN(w) || w <= 0 || w > 15) return '';
  return Math.round(70 * Math.pow(w, 0.75) * 1.6);
}

function autoKcal() {
  const kcal = calcKcal(document.getElementById('ei-weight').value);
  const calInput = document.getElementById('ei-cal');
  const hint = document.getElementById('kcal-hint');
  if (kcal) { calInput.value = kcal; if (hint) hint.textContent = 'คำนวณอัตโนมัติ (RER × 1.6)'; }
  else { if (hint) hint.textContent = ''; }
}

function renderInfo() {
  const info = getDogInfo();
  const card = document.getElementById('profileCard');
  if (!card) return;
  const kcalAuto = info.weight ? calcKcal(info.weight) : null;
  const kcalDisplay = info.calories || kcalAuto || '—';
  const quote = info.quote || 'เพื่อนซี้ตัวจิ๋วของบ้าน';

  // Compact age: "1y 1m" English abbreviation per user feedback
  const ageY = info.ageY ? `${info.ageY}y` : '';
  const ageM = info.ageM ? `${info.ageM}m` : '';
  const ageCompact = [ageY, ageM].filter(Boolean).join(' ') || (info.age || '—');

  if (isEditing) {
    card.innerHTML = `
      <div class="profile__head">
        <div class="mascot-frame">
          <img src="img/mocha-sit.png" alt="" class="anim-breath">
        </div>
        <div class="profile__id">
          <div class="profile__breed">TOY POODLE <span class="sym">·&nbsp;♂</span></div>
          <input id="ei-name" value="${escHtml(info.name)}" style="font-family:var(--font-serif);font-size:38px;font-weight:500;color:var(--c-ink);background:transparent;border:none;border-bottom:1px solid var(--rule);padding:2px 0;width:100%;letter-spacing:-.03em;line-height:1.05">
          <input id="ei-quote" value="${escHtml(quote)}" placeholder="ใส่คำพูดน่ารักๆ..." style="font-family:var(--font-serif);font-style:italic;font-size:13px;color:var(--c-mocha);background:var(--c-cream);border:none;outline:none;padding:4px 8px;border-radius:6px;width:100%;margin-top:6px">
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-3);margin-top:var(--sp-4)">
        <div>
          <div class="t-micro">อายุ</div>
          <div style="display:flex;gap:6px;margin-top:4px;align-items:center">
            <input id="ei-age-y" type="number" min="0" max="20" placeholder="0" value="${escHtml(info.ageY||'')}" style="flex:1;min-width:0;font-family:var(--font-num);padding:6px;border:1px solid var(--rule);border-radius:8px;text-align:center">
            <span style="font-size:11px;color:var(--c-muted)">ปี</span>
            <input id="ei-age-m" type="number" min="0" max="11" placeholder="0" value="${escHtml(info.ageM||'')}" style="flex:1;min-width:0;font-family:var(--font-num);padding:6px;border:1px solid var(--rule);border-radius:8px;text-align:center">
            <span style="font-size:11px;color:var(--c-muted)">เดือน</span>
          </div>
        </div>
        <div>
          <div class="t-micro">น้ำหนัก (kg)</div>
          <input id="ei-weight" value="${escHtml(info.weight)}" placeholder="0.0" oninput="autoKcal()" type="number" step="0.1" min="0.5" max="10" style="margin-top:4px;width:100%;font-family:var(--font-num);padding:6px;border:1px solid var(--rule);border-radius:8px;text-align:center">
        </div>
        <div style="grid-column:1/-1">
          <div class="t-micro">พลังงานต่อวัน (kcal)</div>
          <input id="ei-cal" value="${escHtml(info.calories)}" placeholder="auto" type="number" style="margin-top:4px;width:100%;font-family:var(--font-num);padding:6px;border:1px solid var(--rule);border-radius:8px;text-align:center">
          <div id="kcal-hint" style="font-size:10px;color:var(--c-sage-deep);margin-top:4px">${info.weight ? 'คำนวณอัตโนมัติ (RER × 1.6)' : 'ใส่น้ำหนักเพื่อคำนวณ'}</div>
        </div>
      </div>

      <div style="display:flex;gap:8px;margin-top:var(--sp-4)">
        <button class="btn btn--ghost" onclick="toggleEdit()" style="flex:1">ยกเลิก</button>
        <button class="btn btn--primary" onclick="saveDogInfo()" style="flex:1">บันทึก</button>
      </div>`;
  } else {
    card.innerHTML = `
      <div class="profile__head">
        <div class="mascot-frame">
          <img src="img/mocha-sit.png" alt="มอคค่านั่ง" class="anim-breath">
        </div>
        <div class="profile__id">
          <div class="profile__breed">TOY POODLE <span class="sym">·&nbsp;♂</span></div>
          <h1 class="profile__name">${escHtml(info.name)}</h1>
          <div class="profile__quote" id="profileQuote" onclick="editQuote(this)" title="แตะเพื่อแก้ไข">“ ${escHtml(quote)} ”</div>
        </div>
      </div>
      <div class="profile__stats">
        <div class="profile__stat">
          <div class="label">อายุ</div>
          <div class="value">${escHtml(ageCompact)}</div>
        </div>
        <div class="profile__rule"></div>
        <div class="profile__stat">
          <div class="label">น้ำหนัก</div>
          <div class="value">${escHtml(info.weight||'—')}<span class="unit-big">kg</span></div>
        </div>
        <div class="profile__rule"></div>
        <div class="profile__stat profile__stat--accent">
          <div class="label">พลังงานต่อวัน</div>
          <div class="value">${escHtml(kcalDisplay)}<span class="unit-big">kcal</span></div>
        </div>
        <button class="btn btn--edit" style="align-self:center" onclick="toggleEdit()">แก้ไข ›</button>
      </div>`;
  }
}

// Click to edit quote inline
function editQuote(el) {
  if (el.classList.contains('editing')) return;
  const current = (getDogInfo().quote || 'เพื่อนซี้ตัวจิ๋วของบ้าน');
  el.classList.add('editing');
  el.contentEditable = 'true';
  el.textContent = current;
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel.removeAllRanges(); sel.addRange(range);

  const finish = () => {
    el.removeEventListener('blur', finish);
    el.removeEventListener('keydown', onKey);
    el.contentEditable = 'false';
    el.classList.remove('editing');
    const newQuote = el.textContent.trim() || 'เพื่อนซี้ตัวจิ๋วของบ้าน';
    const info = getDogInfo();
    info.quote = newQuote;
    localStorage.setItem('dogInfo', JSON.stringify(info));
    if (window.db) window.db.collection('config').doc('profile').set(info, { merge: true });
    el.innerHTML = `“ ${escHtml(newQuote)} ”`;
    showToast('บันทึกคำพูดแล้ว','ok');
  };
  const onKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
    if (e.key === 'Escape') { e.preventDefault(); el.textContent = current; el.blur(); }
  };
  el.addEventListener('blur', finish);
  el.addEventListener('keydown', onKey);
}

function saveDogInfo() {
  const ageY = document.getElementById('ei-age-y').value.trim();
  const ageM = document.getElementById('ei-age-m').value.trim();
  const ageParts = [];
  if (ageY && ageY!=='0') ageParts.push(`${ageY} ปี`);
  if (ageM && ageM!=='0') ageParts.push(`${ageM} เดือน`);
  const existing = getDogInfo();
  const info = {
    name:     document.getElementById('ei-name').value.trim()   || INFO_DEFAULTS.name,
    age:      ageParts.join(' ') || INFO_DEFAULTS.age,
    ageY, ageM,
    weight:   document.getElementById('ei-weight').value.trim() || '',
    calories: document.getElementById('ei-cal').value.trim()    || '',
    quote:    document.getElementById('ei-quote')?.value.trim() || existing.quote || 'เพื่อนซี้ตัวจิ๋วของบ้าน',
  };
  showConfirm('บันทึกข้อมูลโปรไฟล์?', () => {
    localStorage.setItem('dogInfo', JSON.stringify(info));
    if (window.db) {
      window.db.collection('config').doc('profile').set(info);
      if (info.name) window.db.collection('config').doc('dog').set({ name: info.name }, { merge: true });
    }
    isEditing = false; renderInfo(); renderCalc();
    showToast('บันทึกข้อมูลแล้ว','ok');
  }, '💾', 'บันทึก');
}

function toggleEdit() {
  isEditing = !isEditing;
  renderInfo();
}

// ── Brand carousel (food products) ────────────────────────────────────
function renderFoodProducts() {
  const el = document.getElementById('brandRow'); if (!el) return;
  // Flatten all categories into one scrollable carousel
  const all = FOOD_PRODUCTS.flatMap(cat => cat.items.map(p => ({...p, cat: cat.cat})));
  const cards = all.map(p => {
    const palette = ['var(--c-blush)', 'rgba(169,184,154,.3)', 'var(--c-latte)', 'rgba(201,148,103,.25)'];
    const bg = palette[Math.abs(p.brand.charCodeAt(0)) % palette.length];
    const img = ['food-kibble.png','food-leaf.png','food-paw.png','food-fire.png'][Math.abs(p.brand.charCodeAt(0)) % 4];
    return `
      <article class="brand">
        <div class="brand__icon" style="background:${bg};color:var(--c-mocha)">
          <img src="img/${img}" alt="" width="22" height="22">
        </div>
        <div class="brand__name">${escHtml(p.brand)}</div>
        <div class="brand__plan">${escHtml(p.name)}</div>
        <div class="brand__kcal">${p.kcal} kcal/100g</div>
      </article>`;
  }).join('');
  el.innerHTML = `
    <header class="brand-row__head">
      <h2>อาหารเม็ดแนะนำ</h2>
    </header>
    <div class="brand-row__scroll">${cards}</div>`;
}

// ── Allowed foods · Forbidden foods · Tips (chip rows) ───────────────
const CAN_EAT_LIST = [
  { img:'food-bowl.png',     bg:'var(--c-latte)',          label:'อาหารเม็ด Small Breed Adult', sub:'Royal Canin · ทุกมื้อ' },
  { img:'food-chicken.png',  bg:'var(--c-blush)',          label:'เนื้อไก่ต้ม',                  sub:'165 kcal/100g · ไม่ใส่เกลือ' },
  { img:'food-fish.png',     bg:'rgba(126,146,122,.25)',   label:'ปลาแซลมอน / ปลาทู',           sub:'160 kcal/100g · Omega-3' },
  { img:'food-carrot.png',   bg:'rgba(169,184,154,.4)',    label:'แครอท',                       sub:'ดิบหรือต้ม · ดีต่อฟัน' },
  { img:'food-beef.png',     bg:'var(--c-blush)',          label:'เนื้อวัว / หมูไม่ติดมัน',     sub:'180 kcal/100g · ต้ม/อบ' },
  { img:'food-broccoli.png', bg:'rgba(169,184,154,.4)',    label:'บรอคโคลี / กะหล่ำ',           sub:'ต้มนิ่ม · ไม่เกิน 10% ของมื้อ' },
  { img:'food-apple.png',    bg:'var(--c-blush)',          label:'แอปเปิ้ล (ไม่มีเมล็ด)',       sub:'Treat · เอาเมล็ดออก' },
  { img:'food-rice.png',     bg:'var(--c-latte)',          label:'ข้าวสุก',                     sub:'ส่วนเสริม · ไม่ใส่เครื่องปรุง' },
  { img:'food-egg.png',      bg:'var(--c-latte)',          label:'ไข่ต้ม',                       sub:'1/2 ฟอง · 2-3 ครั้ง/สัปดาห์' },
  { img:'food-bowl.png',     bg:'var(--c-latte)',          label:'น้ำสะอาด',                    sub:'เปลี่ยนทุกวัน · 2 จุดในบ้าน' },
];

const DANGER_LIST = [
  { img:'danger-chocolate.png', label:'ช็อกโกแลต',          sub:'Theobromine · ร้ายแรง',          tag:'ห้าม',   tagCls:'tag--danger', danger:true },
  { img:'danger-grape.png',     label:'องุ่น & ลูกเกด',     sub:'ทำให้ไตวายเฉียบพลัน',           tag:'ห้าม',   tagCls:'tag--danger', danger:true },
  { img:'danger-xylitol.png',   label:'Xylitol (น้ำตาลเทียม)', sub:'หมากฝรั่ง/ขนมไร้น้ำตาล',     tag:'ห้าม',   tagCls:'tag--danger', danger:true },
  { img:'danger-caffeine.png',  label:'คาเฟอีน',            sub:'กาแฟ ชา โกโก้',                  tag:'ห้าม',   tagCls:'tag--danger', danger:true },
  { img:'danger-wine.png',      label:'แอลกอฮอล์',          sub:'ตับสุนัขย่อยไม่ได้',             tag:'ห้าม',   tagCls:'tag--danger', danger:true },
  { img:'danger-onion.png',     label:'หัวหอม กระเทียม',    sub:'Thiosulfate · สุก/ดิบ',          tag:'ห้าม',   tagCls:'tag--danger', danger:true },
  { img:'danger-avocado.png',   label:'อาโวคาโด',           sub:'Persin · ทั้งเนื้อและเมล็ด',     tag:'ห้าม',   tagCls:'tag--danger', danger:true },
  { img:'danger-macadamia.png', label:'แมคคาเดเมียนัท',     sub:'กล้ามเนื้ออ่อนแรง · ตัวสั่น',    tag:'ห้าม',   tagCls:'tag--danger', danger:true },
  { img:'danger-milk.png',      label:'นม / เกลือ',         sub:'แล็กโตส · ระวัง',                tag:'ระวัง', tagCls:'tag--warn',   danger:false },
];

const TIPS_LIST = [
  { label:'เปลี่ยน Puppy → Adult Formula', sub:'ผสม 25%/สัปดาห์ · 4 สัปดาห์' },
  { label:'ระวัง Hypoglycemia',            sub:'ไม่ข้ามมื้อเกิน 12 ชม.' },
  { label:'Body Condition Score',          sub:'คลำซี่โครงได้ · เห็น waist เล็กน้อย' },
  { label:'ดูแลช่องปาก',                   sub:'แปรงฟัน 2-3 ครั้ง/สัปดาห์' },
  { label:'ปรึกษาสัตวแพทย์',                sub:'ตรวจสุขภาพปีละ 1-2 ครั้ง' },
];

function chipRow(item, opts = {}) {
  // per-item .danger flag overrides; falls back to opts.danger default
  const isDanger = (item.danger !== undefined) ? item.danger : !!opts.danger;
  const danger = isDanger ? ' chip--danger' : '';
  const iconBg = opts.iconBg || item.bg || 'var(--c-latte)';
  const iconHtml = item.img
    ? `<img src="img/${item.img}" alt="" width="17" height="17">`
    : `<span style="color:var(--c-mocha);font-size:14px">${item.emoji || '•'}</span>`;
  const tag = item.tag
    ? `<span class="tag ${item.tagCls || ''}">${item.tag}</span>`
    : '';
  return `
    <article class="chip${danger}">
      <div class="chip__icon" style="background:${iconBg}">${iconHtml}</div>
      <div class="chip__body">
        <div class="chip__label">${escHtml(item.label)}</div>
        <div class="chip__sub">${escHtml(item.sub)}</div>
      </div>
      ${tag}
    </article>`;
}

function renderChipList(elId, list, opts) {
  const el = document.getElementById(elId);
  if (el) el.innerHTML = list.map(i => chipRow(i, opts)).join('');
}

function renderCanEat() { renderChipList('canEatList', CAN_EAT_LIST); }
function renderDanger() { renderChipList('dangerList', DANGER_LIST, { iconBg: 'rgba(199,122,90,.13)', danger: true }); }
function renderTips()   { renderChipList('tipsList',   TIPS_LIST.map(t => ({ ...t, emoji: '💡' }))); }

// ── Nutrition search — filter chip rows + brand cards ───────────────
function nutrSearch(q) {
  q = (q||'').trim().toLowerCase();
  const selectors = '#canEatList .chip, #dangerList .chip, #tipsList .chip, #brandRow .brand';
  const items = document.querySelectorAll(selectors);
  let hits = 0;
  items.forEach(it => {
    const txt = it.textContent.toLowerCase();
    const show = !q || txt.includes(q);
    it.style.display = show ? '' : 'none';
    if (show && q) hits++;
  });
  const hint = document.getElementById('searchHint');
  if (hint) hint.textContent = q ? (hits ? `พบ ${hits} รายการ` : 'ไม่พบรายการ — ลองคำอื่น') : '';
}

// ── Toast ────────────────────────────────────────────────────────────
function showToast(msg, type='info', ms=2600) {
  const el=document.getElementById('toast'); if(!el) return;
  clearTimeout(el._t);
  el.textContent=msg;
  el.className=`toast toast-${type}`;
  requestAnimationFrame(()=>{ requestAnimationFrame(()=>{ el.classList.add('show'); }); });
  el._t=setTimeout(()=>el.classList.remove('show'), ms);
}

// ── Confirm sheet ─────────────────────────────────────────────────────
let _confirmCb=null;
function showConfirm(msg, onYes, icon='⚠️', yesLabel='ยืนยัน', yesDanger=false) {
  _confirmCb=onYes;
  document.getElementById('confirmMsg').textContent=msg;
  document.getElementById('confirmIcon').textContent=icon;
  const yBtn=document.getElementById('confirmYesBtn');
  yBtn.textContent=yesLabel;
  yBtn.className=`btn-next confirm-yes${yesDanger?' confirm-danger':''}`;
  document.getElementById('ovConfirm').classList.add('open');
}
function confirmYes() { document.getElementById('ovConfirm').classList.remove('open'); _confirmCb?.(); _confirmCb=null; }
function confirmNo()  { document.getElementById('ovConfirm').classList.remove('open'); _confirmCb=null; }

// ── PIN dialog ────────────────────────────────────────────────────────
let _pinCb=null, _pinVal='';
function showPin(onSuccess) {
  _pinCb=onSuccess; _pinVal='';
  _renderPinDots(); _setPinHint('ใส่รหัส 6 หลัก','');
  document.getElementById('ovPin').classList.add('open');
}
function closePin() { document.getElementById('ovPin').classList.remove('open'); _pinCb=null; }
function pinInput(n) {
  if(_pinVal.length>=6) return;
  _pinVal+=n; _renderPinDots();
  if(_pinVal.length===6) setTimeout(_checkPin,150);
}
function pinBack() { _pinVal=_pinVal.slice(0,-1); _renderPinDots(); _setPinHint('ใส่รหัส 6 หลัก',''); }
function _renderPinDots() {
  document.querySelectorAll('#pinDots .pin-dot').forEach((d,i)=>d.classList.toggle('filled',i<_pinVal.length));
}
function _setPinHint(msg,cls) {
  const h=document.getElementById('pinHint'); if(!h) return;
  h.textContent=msg; h.className=`pin-hint${cls?' '+cls:''}`;
}
function _checkPin() {
  const stored=localStorage.getItem('adminPin')||'000000';
  if(_pinVal===stored){ closePin(); _pinCb?.(); }
  else {
    _pinVal=''; _renderPinDots();
    _setPinHint('รหัสไม่ถูกต้อง','pin-err');
    document.getElementById('pinDots').classList.add('shake');
    setTimeout(()=>{ document.getElementById('pinDots').classList.remove('shake'); _setPinHint('ใส่รหัส 6 หลัก',''); },600);
  }
}

// ── Calorie calculator ────────────────────────────────────────────────
let calcCombo = 'dry';
let calcMeat  = '🐔 ไก่';
let calcGoal  = 'maintain';

function setCalcGoal(g) {
  calcGoal = g;
  ['lose','maintain','gain'].forEach(k => {
    const btn = document.getElementById(`gb-${k}`);
    if (!btn) return;
    btn.classList.toggle('goal--active', k===g);
    btn.setAttribute('aria-checked', k===g ? 'true' : 'false');
  });
  renderCalc();
}

function renderCalc() {
  const info = getDogInfo();
  const w = parseFloat(info.weight);
  const noW = document.getElementById('calcNoWeight');
  const body = document.getElementById('calcBody');
  const formula = document.getElementById('calcFormula');

  if (!w || w <= 0) { if(noW)noW.style.display='block'; if(body)body.style.display='none'; return; }
  if(noW)noW.style.display='none'; if(body)body.style.display='block';

  const goal = GOAL_DATA[calcGoal];
  const rer  = Math.round(70 * Math.pow(w, 0.75));
  const dailyKcal = Math.round(rer * goal.factor);
  const meals = goal.meals || MEALS.length;
  const perKcal = Math.round(dailyKcal / meals);
  const dryG = Math.round(perKcal / DRY_KCAL * 100);

  if (formula) formula.textContent = `RER × ${goal.factor}`;

  // Single result block matching reference: per-meal kcal + dry-food grams + progress bar
  const pct = Math.min(100, Math.round((dryG / 35) * 100)); // 35g ~= typical large portion → full bar
  document.getElementById('calcResult').innerHTML = `
    <div class="result" style="margin-top:var(--sp-3)">
      <div class="result__row">
        <div class="result__group">
          <div class="label">${meals} มื้อ · ต่อมื้อ</div>
          <div class="result__big">${perKcal}<sub>kcal</sub></div>
        </div>
        <div class="result__group" style="text-align:right">
          <div class="label">อาหารเม็ด</div>
          <div class="result__mid">${dryG}<sub>g</sub></div>
        </div>
      </div>
      <div class="bar"><div class="bar__fill" style="width:${pct}%"></div></div>
    </div>
    <div style="margin-top:var(--sp-3);padding:var(--sp-3);background:rgba(126,146,122,.08);border-radius:var(--r-md);font-size:11.5px;color:var(--c-muted);line-height:1.5">
      ${goal.tip}
    </div>
    <div style="margin-top:var(--sp-2);font-size:10.5px;color:var(--c-faint);font-style:italic">
      RER = 70 × น้ำหนัก<sup>0.75</sup> · NRC 2006 · อาหารเม็ด Small Breed Adult ~370 kcal/100g
    </div>`;
}

// ── Dashboard ─────────────────────────────────────────────────────────
let dashMode = 'day';
function setDash(m) {
  dashMode = m;
  ['day','week','month'].forEach(k => {
    const btn = document.getElementById(`dt-${k}`);
    if (!btn) return;
    btn.classList.toggle('period__btn--active', k===m);
    btn.setAttribute('aria-selected', k===m ? 'true' : 'false');
  });
  // dash card content stays — period toggle is decorative (per user feedback v4.1)
}

function renderDash() {
  const dashEl = document.getElementById('dashCard'); if (!dashEl) return;
  const allLog = JSON.parse(localStorage.getItem('log')||'{}');
  const today = new Date();
  const mk = d => `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
  const cnt = log => MEALS.filter(m => { const f=asFed(log[m.id]); return f && !f.skipped; }).length;
  const info = getDogInfo(); const w = parseFloat(info.weight);
  const kcalTarget = w ? Math.round(70*Math.pow(w,.75)*1.6) : 0;
  const perMealKcal = kcalTarget ? Math.round(kcalTarget / MEALS.length) : 0;

  // DAY dash (always)
  const log = allLog[mk(today)] || {};
  const fed = cnt(log), total = MEALS.length;
  const slots = MEALS.map((m,i) => {
    const f = asFed(log[m.id]);
    const doneCls = f && !f.skipped ? ' slot--done' : '';
    const lbl = m.label.replace('มื้อ','');
    const kcal = f && !f.skipped ? (perMealKcal ? perMealKcal : '✓') : '—';
    return `
      <div class="slot${doneCls}">
        <div class="slot__icon"><img src="img/time-${TIME_ASSET[i]||'morning'}.png" alt="" width="22" height="22"></div>
        <span class="slot__label">${lbl}</span>
        <span class="slot__kcal">${kcal}</span>
      </div>`;
  }).join('');
  const kcalDone = fed * perMealKcal;
  const totalBlock = kcalTarget ? `
    <div class="dash__total">
      <div class="dash__total-row">
        <span class="label">แคลอรี่</span>
        <span><span class="num">${kcalDone}</span> <span class="of">/ ${kcalTarget} kcal</span></span>
      </div>
      <div class="dash__progress"><i style="width:${Math.min(100,Math.round(kcalDone/kcalTarget*100))}%"></i></div>
    </div>` : '';
  dashEl.className = 'dash';
  dashEl.innerHTML = `
    <div class="dash__head">
      <div>
        <h3>วันนี้ · <span class="day-ref">${today.getDate()} ${MONTHS_S[today.getMonth()]}</span></h3>
        <div class="dash__sub">${fed === total ? 'ครบทุกมื้อแล้ว' : `กินไปแล้ว ${fed} จาก ${total} มื้อ`}</div>
      </div>
    </div>
    <div class="dash__slots">${slots}</div>
    ${totalBlock}`;

  // WEEK-STREAK (always shown below dash · per user feedback v4.1)
  let weekEl = document.getElementById('weekStreakCard');
  if (!weekEl) {
    weekEl = document.createElement('article');
    weekEl.id = 'weekStreakCard';
    weekEl.className = 'week-streak';
    dashEl.insertAdjacentElement('afterend', weekEl);
  }
  let cells = '';
  let completeCnt = 0;
  for (let i=6; i>=0; i--) {
    const d = new Date(today); d.setDate(d.getDate()-i);
    const dlog = allLog[mk(d)] || {}, c = cnt(dlog);
    const isToday = i === 0;
    let pillCls = '', pillText = '';
    if (isToday) { pillCls = 'week-pill--today'; pillText = 'วันนี้'; }
    else if (c === MEALS.length) { pillCls = 'week-pill--complete'; pillText = '✓'; completeCnt++; }
    else if (c > 0) { pillCls = 'week-pill--partial'; pillText = `${c}/${MEALS.length}`; }
    else { pillText = '—'; }
    cells += `<div class="week-cell"><div class="week-pill ${pillCls}">${pillText}</div><span class="week-cell__lbl">${DAYS_S[d.getDay()]}</span></div>`;
  }
  // running streak ending today
  let streak = 0;
  const cursor = new Date(today);
  while (cnt(allLog[mk(cursor)]||{}) >= MEALS.length) {
    streak++; cursor.setDate(cursor.getDate()-1);
  }
  weekEl.innerHTML = `
    <div class="week-streak__head">
      <div>
        <div class="label">7 วันที่ผ่านมา</div>
        <div><span class="big">${completeCnt}/7</span> <span class="sub">วันครบมื้อ</span></div>
      </div>
      <span class="streak-badge">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
          <path d="M12 3s4 4 4 8a4 4 0 01-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-4-1-5 0-1 1-2 1-2z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
        </svg>
        ${streak} STREAK
      </span>
    </div>
    <div class="week-row">${cells}</div>`;
}

// ── SW update banner ──────────────────────────────────────────────────
let _newSW = null;
function showUpdateBanner() {
  const b=document.getElementById('updateBanner'); if (b) b.style.display='block';
}
function applyUpdate() {
  if (_newSW) { _newSW.postMessage({type:'SKIP_WAITING'}); navigator.serviceWorker.addEventListener('controllerchange',()=>location.reload()); }
  else location.reload();
}

// ── Boot ──────────────────────────────────────────────────────────────
function boot() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        _newSW = reg.installing;
        _newSW.addEventListener('statechange', () => {
          if (_newSW.state==='installed' && navigator.serviceWorker.controller) showUpdateBanner();
        });
      });
    }).catch(()=>{});
  }
  if (!localStorage.getItem('adminPin')) localStorage.setItem('adminPin','000000');
  applyDarkMode();
  bindOverlayDismiss();
  renderHeader(); renderToday(); renderNotes(); renderSkipBanner();
  renderInfo(); renderCalc(); renderFoodProducts();
  renderCanEat(); renderDanger(); renderTips();
  renderCalendar(); renderDash();
  startSync();
  tickClock();
  setInterval(tickClock, 1000);
  setInterval(()=>{renderHeader();renderToday();checkNotif();renderSkipBanner();},30000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
