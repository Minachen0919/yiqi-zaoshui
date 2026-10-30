/* 一起早睡 · app logic */
const sb = supabase.createClient(window.CONFIG.SUPABASE_URL, window.CONFIG.SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
const $ = (id) => document.getElementById(id);
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
const SHIFT = 15 * 3600e3; // a "night" runs 15:00 -> 15:00 next day
const STAKES = ["输的人请一杯奶茶", "输的人包一周早餐", "输的人答应对方一个愿望", "输的人负责周末洗碗", "输的人请看一场电影"];

let me = null, partner = null, couple = null, checkins = [], channel = null, calMonth = null;

/* ---------- time helpers ---------- */
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const nightOf = (d = new Date()) => ymd(new Date(d.getTime() - SHIFT));
const addDays = (key, n) => { const d = new Date(key + "T12:00:00"); d.setDate(d.getDate() + n); return ymd(d); };
const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const fmtMin = (m) => `${pad(Math.floor(((m % 1440) + 1440) % 1440 / 60))}:${pad(((m % 60) + 60) % 60)}`;
const sinceNoon = (m) => (m - 720 + 1440) % 1440;
const hhmm = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const isNightPhase = (d = new Date()) => d.getHours() >= 15 || d.getHours() < 4;

// pick the time-of-day palette right away, before any screen renders
document.documentElement.classList.toggle("pm", isNightPhase());
document.documentElement.classList.toggle("am", !isNightPhase());

/* ---------- ui helpers ---------- */
function toast(t) { const e = $("toast"); e.textContent = t; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (e.hidden = true), 2200); }
function show(view) {
  for (const v of ["v-boot", "v-auth", "v-reset", "v-pair", "v-main"]) $(v).hidden = v !== view;
  $("tabs").hidden = view !== "v-main";
}
function setChip(el, cls, txt) { el.className = "chip " + cls; el.textContent = txt; }
(() => { const s = $("stars"); for (let i = 0; i < 28; i++) { const e = document.createElement("i"); e.style.left = Math.random() * 100 + "%"; e.style.top = Math.random() * 70 + "%"; e.style.opacity = 0.3 + Math.random() * 0.6; s.appendChild(e); } })();

/* ---------- scoring ---------- */
function rec(userId, night) {
  const list = checkins.filter((c) => c.user_id === userId && c.night === night);
  const get = (k) => list.find((c) => c.kind === k);
  return { sleep: get("sleep"), wake: get("wake"), leave: get("leave") };
}
function sleepOk(c) { return c && sinceNoon(c.local_min) <= sinceNoon(toMin(couple.bed_target)) + couple.grace_min; }
function wakeOk(c) { return c && c.local_min <= toMin(couple.wake_target) + couple.grace_min; }
// status of one person for one night: ok | miss | leave | pending
function status(userId, night) {
  const r = rec(userId, night);
  if (r.leave) return "leave";
  const today = night === nightOf();
  if (r.sleep && r.wake) return sleepOk(r.sleep) && wakeOk(r.wake) ? "ok" : "miss";
  if (r.sleep && !sleepOk(r.sleep)) return "miss";
  if (today) return "pending";
  return "miss";
}
function streak() {
  if (!partner) return 0;
  let n = 0, key = nightOf();
  for (let i = 0; i < 400; i++, key = addDays(key, -1)) {
    const a = status(me.id, key), b = status(partner.id, key);
    if (i === 0 && (a === "pending" || b === "pending")) continue;
    if (a === "ok" && b === "ok") n++;
    else if ((a === "ok" || a === "leave") && (b === "ok" || b === "leave")) continue;
    else break;
  }
  return n;
}

/* ---------- data ---------- */
async function loadAll() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return show("v-auth");
  const { data: prof } = await sb.from("profiles").select("*").eq("id", user.id).single();
  me = prof;
  if (!me) return show("v-auth");
  if (me.tz !== TZ) { sb.from("profiles").update({ tz: TZ }).eq("id", me.id).then(() => {}); me.tz = TZ; }
  if (!me.couple_id) return show("v-pair");
  const [{ data: c }, { data: people }] = await Promise.all([
    sb.from("couples").select("*").eq("id", me.couple_id).single(),
    sb.from("profiles").select("*").eq("couple_id", me.couple_id),
  ]);
  couple = c;
  partner = (people || []).find((p) => p.id !== me.id) || null;
  await loadCheckins();
  subscribe();
  show("v-main");
  renderAll();
}
async function loadCheckins() {
  const since = addDays(nightOf(), -70);
  const { data } = await sb.from("checkins").select("*").eq("couple_id", me.couple_id).gte("night", since).order("at");
  checkins = data || [];
}
function subscribe() {
  if (channel) return;
  channel = sb.channel("couple-" + me.couple_id)
    .on("postgres_changes", { event: "*", schema: "public", table: "checkins", filter: `couple_id=eq.${me.couple_id}` }, async () => { await loadCheckins(); renderAll(); })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "couples", filter: `id=eq.${me.couple_id}` }, (p) => { couple = p.new; renderAll(); })
    .subscribe();
}
async function refreshPartner() {
  const { data: people } = await sb.from("profiles").select("*").eq("couple_id", me.couple_id);
  partner = (people || []).find((p) => p.id !== me.id) || null;
}

async function checkIn(kind, extra = {}) {
  const now = new Date();
  const row = { couple_id: me.couple_id, kind, night: nightOf(now), local_min: now.getHours() * 60 + now.getMinutes(), ...extra };
  const { data, error } = await sb.from("checkins").insert(row).select().single();
  if (error) { toast(error.code === "23505" ? "今天已经打过卡了" : "打卡失败，请检查网络后重试"); return null; }
  checkins.push(data);
  sb.functions.invoke("push", { body: { type: "event", id: data.id } }).catch(() => {});
  return data;
}

/* ---------- render: today ---------- */
function renderToday() {
  const now = new Date();
  const night = isNightPhase(now);
  document.documentElement.classList.toggle("pm", night);
  document.documentElement.classList.toggle("am", !night);
  document.querySelector('meta[name="theme-color"]').content = night ? "#0e0b0c" : "#fff4f1";

  const key = nightOf(now);
  const mine = rec(me.id, key), theirs = partner ? rec(partner.id, key) : {};
  const bed = couple.bed_target.slice(0, 5), wake = couple.wake_target.slice(0, 5);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  $("clock").textContent = fmtMin(nowMin);
  $("streakN").textContent = streak();
  $("meName").textContent = me.name || "我";
  $("taName").textContent = partner?.name || "TA";
  $("waitTip").hidden = !!partner;
  $("waitCode").textContent = couple.code;

  const done = [mine.sleep || mine.leave, mine.wake || mine.leave, theirs.sleep || theirs.leave, theirs.wake || theirs.leave].filter(Boolean).length;
  $("progTxt").textContent = `${done} / 4`;
  $("progFill").style.width = done * 25 + "%";

  const personChip = (r, chipEl, timeEl, isMe) => {
    if (r.leave) { timeEl.textContent = "--:--"; return setChip(chipEl, "off", "请假中"); }
    if (night) {
      if (r.sleep) { timeEl.textContent = hhmm(r.sleep.at); return sleepOk(r.sleep) ? setChip(chipEl, "ok", "已躺下") : setChip(chipEl, "late", "睡晚了"); }
      timeEl.textContent = "--:--"; return setChip(chipEl, "wait", "还没睡");
    }
    if (r.wake) { timeEl.textContent = hhmm(r.wake.at); return wakeOk(r.wake) ? setChip(chipEl, "ok", "已起床") : setChip(chipEl, "late", "起晚了"); }
    timeEl.textContent = "--:--"; setChip(chipEl, "wait", "还在睡");
  };
  personChip(mine, $("meChip"), $("meTime"), true);
  if (partner) personChip(theirs, $("taChip"), $("taTime"), false);
  else { $("taTime").textContent = "--:--"; setChip($("taChip"), "off", "未绑定"); }

  $("phaseTitle").textContent = night ? "今晚入睡" : "今早起床";
  const iDid = night ? !!mine.sleep : !!mine.wake;

  // headline under the clock
  let sub;
  if (mine.leave) sub = "今天请假了，好好休息";
  else if (night) {
    const until = sinceNoon(toMin(bed)) - sinceNoon(nowMin);
    if (mine.sleep) sub = theirs.sleep ? "你们俩都躺下了，晚安" : "等 TA 也躺下";
    else sub = until > 0 ? `距离约定入睡 ${bed} 还有 ${until >= 60 ? Math.floor(until / 60) + " 小时 " : ""}${until % 60} 分钟` : `已经过了约定的 ${bed}，快睡吧`;
  } else {
    if (mine.wake) sub = theirs.wake ? "今天打卡完成" : "等 TA 起床";
    else sub = theirs.wake ? `TA 已经起来了，约定 ${wake} 起床` : `约定 ${wake} 起床`;
  }
  $("sub").textContent = sub;

  // actions
  $("onLeave").hidden = !mine.leave;
  $("actions").hidden = !!mine.leave;
  if (mine.leave) { $("leaveTitle").textContent = night ? "今晚已请假" : "今天已请假"; $("leaveWhy").textContent = mine.leave.note || "其他"; $("leavePanel").hidden = true; }
  $("gnInput").hidden = !night || iDid;
  $("photoPick").hidden = night || iDid;
  $("leaveBtn").hidden = iDid || !!mine.sleep;
  $("leaveBtn").textContent = night ? "今晚请个假" : "今天请个假";
  $("leaveH").textContent = night ? "今晚请假" : "今天请假";
  const used = checkins.filter((c) => c.user_id === me.id && c.kind === "leave" && c.night.slice(0, 7) === key.slice(0, 7)).length;
  const left = Math.max(0, couple.leaves_per_month - used);
  $("leaveHint").textContent = left > 0 ? `TA 会收到通知，本月还能请 ${left} 次` : "本月请假次数已用完";
  $("leaveOk").dataset.full = left > 0 ? "" : "1";

  const btn = $("mainBtn");
  btn.disabled = iDid;
  btn.textContent = night ? (iDid ? "已打卡，放下手机吧" : "我要睡了") : (iDid ? "今天打卡完成" : "我起床了");

  // goodnight / summary box
  const gn = $("gn");
  let unlocked = false, text = "";
  if (night) {
    const both = (mine.sleep || mine.leave) && (theirs.sleep || theirs.leave);
    unlocked = !!both;
    if (!partner) text = "绑定后，你们都打卡就能看到 TA 的晚安话";
    else if (both) text = theirs.sleep?.note ? `${partner.name}：${theirs.sleep.note}` : `${partner.name} 没写晚安话，晚安`;
    else text = "你们都打卡后，解锁 TA 留给你的晚安话";
  } else {
    unlocked = !!(mine.sleep && mine.wake);
    if (unlocked) { const h = (new Date(mine.wake.at) - new Date(mine.sleep.at)) / 3600e3; text = `昨晚睡了 ${Math.floor(h)} 小时 ${Math.round((h % 1) * 60)} 分钟`; }
    else text = mine.sleep ? "起床打卡后看看昨晚睡了多久" : "昨晚没有入睡打卡";
  }
  gn.classList.toggle("unlocked", unlocked);
  $("shackle").setAttribute("d", unlocked ? "M8 11V8a4 4 0 0 1 7.5-2" : "M8 11V8a4 4 0 0 1 8 0v3");
  $("gnText").textContent = text;

  renderPhotos(key, night);
  renderBet();
}

async function renderPhotos(key, night) {
  const list = checkins.filter((c) => c.night === key && c.kind === "wake" && c.photo_path);
  $("photoCard").hidden = night || list.length === 0;
  if ($("photoCard").hidden) return;
  const sig = list.map((c) => c.photo_path).join();
  if ($("photos").dataset.sig === sig) return;
  $("photos").dataset.sig = sig;
  const { data } = await sb.storage.from("photos").createSignedUrls(list.map((c) => c.photo_path), 3600);
  $("photos").innerHTML = list.map((c, i) => {
    const who = c.user_id === me.id ? (me.name || "我") : (partner?.name || "TA");
    return `<figure><img alt="${who}的早安照片" src="${data?.[i]?.signedUrl || ""}"><figcaption>${who} · ${hhmm(c.at)}</figcaption></figure>`;
  }).join("");
}

function renderBet() {
  $("stake").textContent = couple.stake;
  const today = nightOf();
  const d = new Date(today + "T12:00:00");
  const monday = addDays(today, -((d.getDay() + 6) % 7));
  const days = [...Array(7)].map((_, i) => addDays(monday, i));
  const cls = (uid, k) => k > today ? "" : (({ ok: "ok", miss: "miss", leave: "leave", pending: "now" })[status(uid, k)]);
  const row = (name, color, uid) => {
    const arr = days.map((k) => cls(uid, k));
    const n = arr.filter((x) => x === "ok").length;
    return { n, html: `<div class="nm"><span class="dot" style="background:${color}"></span>${name}</div>
      <div class="days">${arr.map((s) => `<i class="d ${s}" style="${s === "ok" ? "background:" + color : ""}"></i>`).join("")}</div>
      <div class="sc">${n}<span style="color:var(--muted)">/7</span></div>` };
  };
  const a = row(me.name || "我", "var(--me)", me.id);
  const b = partner ? row(partner.name || "TA", "var(--ta)", partner.id) : { n: 0, html: "" };
  $("race").innerHTML = `<span></span><div class="days">${"一二三四五六日".split("").map((x) => `<span class="dh">${x}</span>`).join("")}</div><span></span>` + a.html + b.html;
  const left = days.filter((k) => k > today).length;
  const diff = b.n - a.n;
  $("lead").textContent = !partner ? "绑定后开始比赛" : diff > 0 ? `${partner.name} 暂时领先 ${diff} 天${left ? `，还剩 ${left} 天` : ""}` : diff < 0 ? `你暂时领先 ${-diff} 天${left ? `，还剩 ${left} 天` : ""}` : `目前打平${left ? `，还剩 ${left} 天` : ""}`;
}

/* ---------- watermelon drawing helpers ---------- */
function sector(cx, cy, r0, r1, a0, a1) {
  const p = (r, a) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  const lg = a1 - a0 > Math.PI ? 1 : 0;
  return `M${p(r1, a0)}A${r1} ${r1} 0 ${lg} 1 ${p(r1, a1)}L${p(r0, a1)}A${r0} ${r0} 0 ${lg} 0 ${p(r0, a0)}Z`;
}
// half-disc slice with the flat edge on top, centred on (0,0)
function wmSlice(r, seeds = true) {
  const f = r * 0.78, c = r * 0.88;
  let s = `<path d="M${-r} 0a${r} ${r} 0 0 0 ${2 * r} 0z" fill="var(--rind)"/><path d="M${-c} 0a${c} ${c} 0 0 0 ${2 * c} 0z" fill="var(--cream)"/><path d="M${-f} 0a${f} ${f} 0 0 0 ${2 * f} 0z" fill="var(--accent)"/>`;
  if (seeds) s += [[-0.36, 0.3], [0, 0.48], [0.34, 0.28], [-0.14, 0.62]].map(([x, y]) => `<ellipse class="seed" cx="${x * r}" cy="${y * r}" rx="${r * 0.045}" ry="${r * 0.075}" fill="var(--seed)"/>`).join("");
  return s;
}
function wmWhole(r) {
  let s = `<circle r="${r}" fill="var(--rind)"/><circle r="${r * 0.9}" fill="var(--cream)"/><circle r="${r * 0.8}" fill="var(--accent)"/>`;
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, d = r * (i % 2 ? 0.35 : 0.58), x = Math.cos(a) * d, y = Math.sin(a) * d; s += `<ellipse cx="${x}" cy="${y}" rx="${r * 0.04}" ry="${r * 0.07}" transform="rotate(${a * 180 / Math.PI + 90} ${x} ${y})" fill="var(--seed)"/>`; }
  return s;
}

/* ---------- check-in animations ---------- */
const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const NS = "http://www.w3.org/2000/svg";
const fxQueue = [];
let fxBusy = false;
function fx(fn) { fxQueue.push(fn); if (!fxBusy) fxNext(); }
function fxNext() {
  const fn = fxQueue.shift();
  const st = $("fx");
  // finished animations with fill:"forwards" keep overriding styles, so clear them between plays
  const reset = () => { st.getAnimations().forEach((a) => a.cancel()); st.style.opacity = 0; st.innerHTML = ""; st.style.background = "none"; };
  if (!fn) { fxBusy = false; reset(); return; }
  reset();
  fxBusy = true;
  const ms = fn(st);
  setTimeout(() => {
    const out = () => fxNext();
    if (reduceMotion()) return out();
    st.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 450, fill: "forwards" }).onfinish = out;
  }, ms);
}
const fxMsg = (title, sub, color) => `<div class="msg" style="color:${color}">${esc(title)}${sub ? `<small>${esc(sub)}</small>` : ""}</div>`;
const fadeIn = (el, delay) => setTimeout(() => el.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 600, fill: "forwards" }), delay);

function playSleep(title, sub) {
  fx((st) => {
    st.innerHTML = `<svg width="200" height="200" viewBox="-100 -100 200 200"><g id="fxMoon">${wmSlice(62)}</g><g id="fxStars"></g></svg>${fxMsg(title, sub, "#fff")}`;
    st.style.opacity = 1;
    const m = st.querySelector(".msg");
    if (reduceMotion()) { st.style.background = "#0e0b0c"; m.style.opacity = 1; st.querySelector("#fxMoon").setAttribute("transform", "rotate(-28)"); return 1800; }
    st.animate([{ background: "rgba(14,11,12,0)" }, { background: "rgba(14,11,12,.97)" }], { duration: 900, fill: "forwards", easing: "ease-out" });
    st.querySelector("#fxMoon").animate([{ transform: "translate(0px,260px) rotate(20deg)", opacity: 0 }, { transform: "translate(0px,0px) rotate(-28deg)", opacity: 1 }], { duration: 1100, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" });
    const stars = st.querySelector("#fxStars");
    [...st.querySelectorAll(".seed")].forEach((sd, i) => setTimeout(() => {
      const s = document.createElementNS(NS, "circle"), x = (Math.random() - 0.5) * 150, y = -60 - Math.random() * 40;
      s.setAttribute("r", "2.4"); s.setAttribute("fill", "#fff"); stars.appendChild(s);
      sd.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: "forwards" });
      s.animate([{ transform: "translate(0px,10px) scale(.6)", opacity: 0 }, { transform: `translate(${x}px,${y}px) scale(1)`, opacity: 1, offset: 0.7 }, { transform: `translate(${x}px,${y}px) scale(1.5)`, opacity: 0.6 }], { duration: 1300, easing: "ease-out", fill: "forwards" });
    }, 1000 + i * 180));
    fadeIn(m, 1900);
    return 3400;
  });
}
function playWake(title, sub) {
  fx((st) => {
    let rays = "";
    for (let i = 0; i < 9; i++) { const a = Math.PI + i / 8 * Math.PI; rays += `<line class="ray" x1="${Math.cos(a) * 78}" y1="${Math.sin(a) * 78}" x2="${Math.cos(a) * 102}" y2="${Math.sin(a) * 102}" stroke="var(--accent)" stroke-width="5" stroke-linecap="round" opacity="0"/>`; }
    st.innerHTML = `<svg width="240" height="170" viewBox="-120 -110 240 140"><g>${rays}</g><g id="fxSun"><g transform="scale(1,-1)">${wmSlice(66)}</g></g><line x1="-110" y1="2" x2="110" y2="2" stroke="#141012" stroke-width="3" stroke-linecap="round" opacity=".25"/></svg>${fxMsg(title, sub, "#141012")}`;
    st.style.opacity = 1;
    const m = st.querySelector(".msg");
    if (reduceMotion()) { st.style.background = "#fff4f1"; m.style.opacity = 1; st.querySelectorAll(".ray").forEach((r) => r.setAttribute("opacity", 1)); return 1800; }
    st.animate([{ background: "#0e0b0c" }, { background: "#3a1820", offset: 0.35 }, { background: "#ffd6d0", offset: 0.7 }, { background: "#fff4f1" }], { duration: 1600, fill: "forwards", easing: "ease-in-out" });
    const sun = st.querySelector("#fxSun");
    sun.style.clipPath = "inset(-200px -200px 47% -200px)";
    sun.animate([{ transform: "translateY(80px)" }, { transform: "translateY(0px)" }], { duration: 1400, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" });
    st.querySelectorAll(".ray").forEach((r, i) => r.animate([{ opacity: 0, transform: "scale(.7)" }, { opacity: 1, transform: "scale(1)" }], { duration: 500, delay: 1200 + i * 60, fill: "forwards", easing: "ease-out" }));
    fadeIn(m, 1700);
    return 3400;
  });
}
function playBoth(title, sub) {
  fx((st) => {
    st.innerHTML = `<svg width="220" height="220" viewBox="-110 -110 220 220"><g id="fxL"><g transform="rotate(90)">${wmSlice(70, false)}</g></g><g id="fxR"><g transform="rotate(-90)">${wmSlice(70, false)}</g></g><g id="fxW" opacity="0">${wmWhole(70)}</g></svg>${fxMsg(title, sub, "#fff")}`;
    st.style.background = "rgba(14,11,12,.96)";
    st.style.opacity = 1;
    const L = st.querySelector("#fxL"), R = st.querySelector("#fxR"), W = st.querySelector("#fxW"), m = st.querySelector(".msg");
    if (reduceMotion()) { L.style.opacity = 0; R.style.opacity = 0; W.setAttribute("opacity", 1); m.style.opacity = 1; return 1800; }
    L.animate([{ transform: "translateX(-180px) rotate(-30deg)" }, { transform: "translateX(-6px) rotate(0deg)", offset: 0.85 }, { transform: "translateX(0px)" }], { duration: 900, easing: "cubic-bezier(.3,.9,.3,1)", fill: "forwards" });
    R.animate([{ transform: "translateX(180px) rotate(30deg)" }, { transform: "translateX(6px) rotate(0deg)", offset: 0.85 }, { transform: "translateX(0px)" }], { duration: 900, easing: "cubic-bezier(.3,.9,.3,1)", fill: "forwards" });
    setTimeout(() => {
      L.style.opacity = 0; R.style.opacity = 0; W.setAttribute("opacity", 1);
      W.animate([{ transform: "scale(1)" }, { transform: "scale(1.15)" }, { transform: "scale(.96)" }, { transform: "scale(1)" }], { duration: 600, easing: "ease-out" });
    }, 900);
    fadeIn(m, 900);
    return 3100;
  });
}

/* ---------- render: calendar ---------- */
function renderCal() {
  if (!calMonth) { const t = new Date(nightOf() + "T12:00:00"); calMonth = new Date(t.getFullYear(), t.getMonth(), 1); }
  const y = calMonth.getFullYear(), m = calMonth.getMonth();
  $("calTitle").textContent = `${y} 年 ${m + 1} 月`;
  const today = nightOf();
  const total = new Date(y, m + 1, 0).getDate();
  // the month is one watermelon cross-section: one wedge per day, inner ring = me, outer ring = TA
  const c = 200, gap = 0.012;
  const fillOf = (s) => s === "ok" ? "var(--accent)" : s === "miss" ? "var(--miss)" : s === "pending" ? "var(--line)" : "none";
  const strokeOf = (s) => s === "leave" ? 'stroke="var(--warn)" stroke-dasharray="3 2" stroke-width="1.2"' : "";
  let wedges = "", together = 0;
  for (let d = 1; d <= total; d++) {
    const key = `${y}-${pad(m + 1)}-${pad(d)}`;
    const future = key > today;
    const a = future ? "" : status(me.id, key), b = future || !partner ? "" : status(partner.id, key);
    if (a === "ok" && b === "ok") together++;
    const a0 = -Math.PI / 2 + (d - 1) / total * Math.PI * 2 + gap, a1 = -Math.PI / 2 + d / total * Math.PI * 2 - gap;
    const blank = "color-mix(in srgb, var(--line) 55%, transparent)";
    let g = `<path d="${sector(c, c, 62, 118, a0, a1)}" fill="${future ? blank : fillOf(a)}" ${strokeOf(a)}/>
      <path d="${sector(c, c, 121, 166, a0, a1)}" fill="${future || !partner ? blank : fillOf(b)}" ${strokeOf(b)}/>`;
    if (a === "ok" && b === "ok") {
      const am = (a0 + a1) / 2, r = 142, x = c + r * Math.cos(am), yy = c + r * Math.sin(am);
      g += `<ellipse cx="${x}" cy="${yy}" rx="2.4" ry="4" transform="rotate(${am * 180 / Math.PI + 90} ${x} ${yy})" fill="var(--seed)"/>`;
    }
    if (key === today || key === selDay) g += `<path d="${sector(c, c, 60, 168, a0 - gap, a1 + gap)}" fill="none" stroke="var(--fg)" stroke-width="${key === selDay ? 2.5 : 1.5}" ${key === today && key !== selDay ? 'stroke-dasharray="4 3"' : ""}/>`;
    if (d === 1 || d % 5 === 0) { const am = (a0 + a1) / 2, r = 191; g += `<text x="${c + r * Math.cos(am)}" y="${c + r * Math.sin(am) + 4}" text-anchor="middle" font-size="12" font-weight="800" fill="var(--muted)">${d}</text>`; }
    wedges += future ? `<g aria-hidden="true">${g}</g>` : `<g class="wedge" data-k="${key}" tabindex="0" role="button" aria-label="${m + 1} 月 ${d} 日">${g}</g>`;
  }
  let center = `<text x="${c}" y="${c - 2}" text-anchor="middle" font-size="34" font-weight="900" fill="var(--fg)">${together}</text>
    <text x="${c}" y="${c + 22}" text-anchor="middle" font-size="12" font-weight="700" fill="var(--muted)">天一起达标</text>`;
  if (selDay && selDay.startsWith(`${y}-${pad(m + 1)}`)) {
    const sa = status(me.id, selDay), sb2 = partner ? status(partner.id, selDay) : "";
    const word = sa === "ok" && sb2 === "ok" ? "一起达标" : sa === "leave" || sb2 === "leave" ? "有人请假" : sa === "pending" || sb2 === "pending" ? "进行中" : "有人没达标";
    center = `<text x="${c}" y="${c - 2}" text-anchor="middle" font-size="34" font-weight="900" fill="var(--fg)">${Number(selDay.slice(8))}</text>
      <text x="${c}" y="${c + 22}" text-anchor="middle" font-size="12" font-weight="700" fill="var(--muted)">${word}</text>`;
  }
  $("cal").innerHTML = `<div class="melon"><svg viewBox="0 0 400 400" role="img" aria-label="${m + 1} 月，${together} 天一起达标">
    <circle cx="${c}" cy="${c}" r="181" fill="var(--rind)"/><circle cx="${c}" cy="${c}" r="172.5" fill="var(--cream)"/><circle cx="${c}" cy="${c}" r="169" fill="var(--surface)"/>
    ${wedges}
    <circle cx="${c}" cy="${c}" r="56" fill="var(--surface)"/>${center}</svg></div>`;
  $("cal").querySelectorAll(".wedge").forEach((w) => {
    w.onclick = () => selectDay(w.dataset.k);
    w.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectDay(w.dataset.k); } };
  });
  $("lgMe").textContent = me.name || "我"; $("lgTa").textContent = partner?.name || "TA";
  renderAlbum(y, m);
  if (selDay) renderDay(selDay);
}

/* ---------- album & day detail ---------- */
let selDay = null;
const urlCache = new Map();
const loadedMonths = new Set();
async function ensureMonth(y, m) {
  const k = `${y}-${pad(m + 1)}`;
  if (loadedMonths.has(k)) return false;
  loadedMonths.add(k);
  const from = `${k}-01`, to = ymd(new Date(y, m + 1, 0));
  const { data } = await sb.from("checkins").select("*").eq("couple_id", me.couple_id).gte("night", from).lte("night", to);
  const seen = new Set(checkins.map((c) => c.id));
  const add = (data || []).filter((c) => !seen.has(c.id));
  if (add.length) { checkins.push(...add); return true; }
  return false;
}
async function signed(paths) {
  const need = paths.filter((p) => !urlCache.has(p));
  if (need.length) {
    const { data } = await sb.storage.from("photos").createSignedUrls(need, 3600);
    (data || []).forEach((r, i) => r.signedUrl && urlCache.set(need[i], r.signedUrl));
  }
  return paths.map((p) => urlCache.get(p) || "");
}
const whoName = (uid) => uid === me.id ? (me.name || "我") : (partner?.name || "TA");
async function renderAlbum(y, m) {
  const prefix = `${y}-${pad(m + 1)}`;
  $("albumTitle").textContent = `${m + 1} 月早安相册`;
  const list = checkins.filter((c) => c.kind === "wake" && c.photo_path && c.night.startsWith(prefix)).sort((a, b) => b.at.localeCompare(a.at));
  $("albumEmpty").hidden = list.length > 0;
  if (!list.length) { $("album").innerHTML = ""; return; }
  const urls = await signed(list.map((c) => c.photo_path));
  $("album").innerHTML = list.map((c, i) => {
    const d = new Date(c.at);
    return `<button data-k="${c.night}" aria-label="${whoName(c.user_id)} ${d.getMonth() + 1} 月 ${d.getDate()} 日的早安照片"><img loading="lazy" alt="" src="${urls[i]}"><span>${d.getMonth() + 1}/${d.getDate()} ${whoName(c.user_id)}</span></button>`;
  }).join("");
  $("album").querySelectorAll("button").forEach((b) => (b.onclick = () => selectDay(b.dataset.k)));
}
function selectDay(key) {
  selDay = key;
  renderCal();
  $("dayCard").scrollIntoView({ behavior: "smooth", block: "nearest" });
}
async function renderDay(key) {
  const d = new Date(key + "T12:00:00");
  $("dayCard").hidden = false;
  $("dayTitle").textContent = `${d.getMonth() + 1} 月 ${d.getDate()} 日晚上`;
  const people = [me, partner].filter(Boolean);
  const label = { ok: ["ok", "达标"], miss: ["late", "没达标"], leave: ["off", "请假"], pending: ["wait", "进行中"] };
  $("dayPair").innerHTML = people.map((p) => {
    const r = rec(p.id, key), s = label[status(p.id, key)];
    const t = (c) => (c ? hhmm(c.at) : "--:--");
    // tonight's goodnight note stays locked until both have checked in, same as on the Today page
    const mineIn = rec(me.id, key).sleep || rec(me.id, key).leave;
    const locked = key === nightOf() && p.id !== me.id && !mineIn;
    const note = r.leave ? `请假：${r.leave.note || "其他"}` : r.sleep?.note && !locked ? `晚安话：${r.sleep.note}` : "";
    return `<div class="person"><div class="who"><span class="dot" style="background:var(--${p.id === me.id ? "me" : "ta"})"></span><span>${whoName(p.id)}</span></div>
      <div class="num">睡 ${t(r.sleep)} · 起 ${t(r.wake)}</div><span class="chip ${s[0]}">${s[1]}</span>${note ? `<div class="dnote">${note.replace(/</g, "&lt;")}</div>` : ""}</div>`;
  }).join("");
  const list = checkins.filter((c) => c.night === key && c.kind === "wake" && c.photo_path);
  const urls = await signed(list.map((c) => c.photo_path));
  $("dayPhotos").innerHTML = list.map((c, i) => `<figure><img alt="${whoName(c.user_id)}的早安照片" src="${urls[i]}"><figcaption>${whoName(c.user_id)} · ${hhmm(c.at)}</figcaption></figure>`).join("");
}
$("dayClose").onclick = () => { selDay = null; $("dayCard").hidden = true; renderCal(); };

/* ---------- render: stats ---------- */
function renderStats() {
  const today = nightOf();
  const keys = [...Array(7)].map((_, i) => addDays(today, i - 7)); // last 7 completed nights
  const dur = (uid, k) => { const r = rec(uid, k); return r.sleep && r.wake ? (new Date(r.wake.at) - new Date(r.sleep.at)) / 3600e3 : 0; };
  const mineD = keys.map((k) => dur(me.id, k)), taD = keys.map((k) => partner ? dur(partner.id, k) : 0);
  const avg = (arr) => arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null;
  const beds = keys.map((k) => rec(me.id, k).sleep).filter(Boolean).map((c) => sinceNoon(c.local_min));
  const wakes = keys.map((k) => rec(me.id, k).wake).filter(Boolean).map((c) => c.local_min);
  const ds = mineD.filter((x) => x > 0);
  $("kBed").textContent = beds.length ? fmtMin(Math.round(avg(beds)) + 720) : "--";
  $("kWake").textContent = wakes.length ? fmtMin(Math.round(avg(wakes))) : "--";
  $("kDur").textContent = ds.length ? `${Math.floor(avg(ds))}h${pad(Math.round((avg(ds) % 1) * 60))}` : "--";
  const bars = $("bars");
  bars.innerHTML = [4, 6, 8, 10].map((h) => `<div class="g" style="bottom:${h * 10}%"><span>${h}h</span></div>`).join("") +
    keys.map((k, i) => `<div class="col"><div class="b" style="height:${Math.min(mineD[i], 10) * 10}%;background:var(--me)"></div>${partner ? `<div class="b" style="height:${Math.min(taD[i], 10) * 10}%;background:var(--ta)"></div>` : ""}</div>`).join("");
  $("xl").innerHTML = keys.map((k) => `<span>${"日一二三四五六"[new Date(k + "T12:00:00").getDay()]}</span>`).join("");
  $("lgMe2").textContent = me.name || "我"; $("lgTa2").textContent = partner?.name || "TA";
  const both = partner ? keys.filter((k) => status(me.id, k) === "ok" && status(partner.id, k) === "ok").length : 0;
  const prev = partner ? [...Array(7)].map((_, i) => addDays(today, i - 14)).filter((k) => status(me.id, k) === "ok" && status(partner.id, k) === "ok").length : 0;
  $("summary").textContent = !partner ? "绑定 TA 之后这里会出现你们的小结。" :
    `最近 7 晚你们有 ${both} 晚一起达标` + (both > prev ? `，比之前一周多 ${both - prev} 晚。` : both < prev ? `，比之前一周少 ${prev - both} 晚。` : "，和之前一周一样。");
}

/* ---------- render: diary (tear-off desk calendar + wall of every goodnight) ---------- */
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
let diaryView = "desk", diaryCur = null, diaryWho = "all", diaryQ = "", diaryDrag = null, diaryBusy = false;
let diarySound = true;
try { diarySound = localStorage.getItem("diarySound") !== "0"; } catch { /* storage unavailable */ }
const SPEAKER_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>';
const SPEAKER_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>';

// load every check-in for the couple once per visit, so old nights have their full record
async function loadDiary() {
  const { data } = await sb.from("checkins").select("*").eq("couple_id", me.couple_id).order("night", { ascending: false }).limit(5000);
  const seen = new Set(checkins.map((c) => c.id));
  (data || []).forEach((c) => { if (!seen.has(c.id)) checkins.push(c); });
}
// every night that has any record, plus tonight; newest first
function diaryNights() {
  const today = nightOf();
  const set = new Set(checkins.map((c) => c.night)); set.add(today);
  return [...set].filter((k) => k <= today).sort().reverse();
}
const tonightUnlocked = () => { const r = rec(me.id, nightOf()); return !!(r.sleep || r.leave); };
const bothOk = (k) => !!partner && status(me.id, k) === "ok" && status(partner.id, k) === "ok";

async function renderDiary(refetch = true) {
  if (diaryDrag) return; // never rebuild the page under a finger
  $("dSound").innerHTML = diarySound ? SPEAKER_ON : SPEAKER_OFF;
  document.querySelectorAll("#p-diary .seg button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.dv === diaryView));
  if (refetch && !diaryBusy) { diaryBusy = true; try { await loadDiary(); } finally { diaryBusy = false; } }
  if (diaryDrag) return;
  diaryView === "desk" ? renderDesk() : renderWall();
}

/* --- desk calendar --- */
let audioCtx = null;
function ripSound() {
  if (!diarySound) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const len = 0.32, buf = audioCtx.createBuffer(1, audioCtx.sampleRate * len, audioCtx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) { const t = i / d.length; d[i] = (Math.random() * 2 - 1) * (Math.random() < 0.08 ? 1 : 0.35) * Math.pow(1 - t, 1.6); }
    const src = audioCtx.createBufferSource(); src.buffer = buf;
    const bp = audioCtx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2600; bp.Q.value = 0.8;
    const g = audioCtx.createGain(); g.gain.value = 0.35;
    src.connect(bp).connect(g).connect(audioCtx.destination); src.start();
  } catch { /* audio unavailable */ }
}
function seedSvg(n, seed) {
  let s = "", r = seed;
  const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
  for (let i = 0; i < n; i++) s += `<ellipse cx="${(6 + rnd() * 88).toFixed(1)}%" cy="${(6 + rnd() * 88).toFixed(1)}%" rx="3" ry="5.5" fill="#141012" opacity=".5"/>`;
  return `<svg class="seedbg" aria-hidden="true">${s}</svg>`;
}
function sheetHTML(k, cls, tally) {
  const today = nightOf(), d = new Date(k + "T12:00:00");
  const mine = rec(me.id, k), theirs = partner ? rec(partner.id, k) : {};
  const ok = bothOk(k), isToday = k === today;
  const line = (r, uid) => {
    const name = esc(whoName(uid));
    if (r.leave) return `<div class="msg"><small>${name} · 请假</small>${esc(r.leave.note || "这晚请假了")}</div>`;
    if (r.sleep && r.sleep.note) {
      if (isToday && uid !== me.id && !tonightUnlocked()) return `<div class="msg none">${name} 已经写好了，你也打卡后就能看到</div>`;
      return `<div class="msg"><small>${name} · ${hhmm(r.sleep.at)}</small>${esc(r.sleep.note)}</div>`;
    }
    if (r.sleep) return `<div class="msg none">${name} ${hhmm(r.sleep.at)} 睡了，没写晚安话</div>`;
    return `<div class="msg none">${name} ${isToday ? "还没写" : "这晚没写"}</div>`;
  };
  const photo = checkins.find((c) => c.night === k && c.kind === "wake" && c.photo_path);
  const badge = ok ? "两人都早睡了" : isToday ? "今晚进行中" : "这晚没有一起达标";
  return `<article class="sheet ${ok || isToday ? "" : "miss"} ${cls}" data-k="${k}" aria-label="${d.getMonth() + 1} 月 ${d.getDate()} 日的晚安">
    <div class="flesh">${ok ? seedSvg(14, d.getDate() * 7 + d.getMonth()) : ""}
      <div class="date"><div class="d">${d.getDate()}</div><div class="w">${d.getMonth() + 1} 月<small>周${"日一二三四五六"[d.getDay()]}${isToday ? " · 今晚" : ""}</small></div></div>
      ${partner ? line(theirs, partner.id) : ""}
      ${line(mine, me.id)}
      <div class="foot"><span class="badge">${badge}</span><span>${ok ? "🍉 × " + tally : ""}</span></div>
    </div>${photo ? `<img class="photo" alt="早安照片" data-path="${esc(photo.photo_path)}">` : ""}<div class="curl"></div>
  </article>`;
}
function renderDesk() {
  const nights = diaryNights();
  if (!diaryCur || !nights.includes(diaryCur)) diaryCur = nights[0];
  const i = nights.indexOf(diaryCur);
  const older = nights[i + 1] || null, newer = i > 0 ? nights[i - 1] : null;
  // running count of nights you both made it, up to each page
  const tally = (k) => nights.filter((x) => x <= k && bothOk(x)).length;
  const stack = nights.slice(i, i + 3).reverse();
  $("diaryBody").innerHTML = `
    <div class="desk" id="desk">
      <div class="binding"><span class="ring" style="left:26%"></span><span class="ring" style="right:26%"></span></div>
      <div class="stub" id="stub" style="opacity:${newer ? 1 : 0}"></div>
      ${stack.map((k, j) => sheetHTML(k, j === stack.length - 1 ? "top" : j === stack.length - 2 ? "under1" : "under2", tally(k))).join("")}
    </div>
    <div class="deskbar"><button class="pill" id="dBack" type="button" ${newer ? "" : "disabled"}>‹ 贴回去</button><button class="pill main" id="dTear" type="button" ${older ? "" : "disabled"}>撕一页</button></div>
    <p class="note">${older ? "按住页面往左下或右下拖，拖过一半松手就撕下来了" : "这是第一页，你们开始用的那天"}</p>`;
  $("dTear").onclick = autoTear;
  $("dBack").onclick = putBack;
  const imgs = [...document.querySelectorAll("#desk .photo")];
  if (imgs.length) signed(imgs.map((im) => im.dataset.path)).then((urls) => imgs.forEach((im, j) => { if (urls[j]) im.src = urls[j]; }));
  if (older) bindSheetDrag(document.querySelector(".sheet.top"));
}
const tearProgress = (dx, dy) => Math.min(1, Math.hypot(dx, Math.max(0, dy) * 0.7) / 180);
function sheetTransform(dx, dy) {
  // the sheet hinges on the top corner opposite the pull, like paper peeling off a perforation
  const dir = dx < 0 ? -1 : 1, p = tearProgress(dx, dy);
  const ang = Math.max(-55, Math.min(55, dx * 0.16 + dir * Math.max(0, dy) * 0.05));
  return { origin: dir < 0 ? "100% 0" : "0% 0", t: `translate(${dx * 0.12}px,${Math.max(0, dy) * 0.35}px) rotate(${ang}deg) skewY(${dir * p * -6}deg)`, p, dir };
}
function dragTo(el, dx, dy) {
  const f = sheetTransform(dx, dy);
  el.style.transformOrigin = f.origin; el.style.transform = f.t;
  const curl = el.querySelector(".curl");
  curl.style.opacity = Math.min(1, f.p * 1.4);
  curl.style.background = `linear-gradient(${f.dir < 0 ? "225deg" : "135deg"},transparent ${70 - f.p * 40}%,rgba(255,255,255,.25) ${72 - f.p * 40}%,rgba(0,0,0,.35) ${80 - f.p * 30}%,transparent 100%)`;
  if (f.p > 0.5 && diaryDrag && !diaryDrag.ripped) { diaryDrag.ripped = true; ripSound(); $("stub").style.opacity = 1; if (navigator.vibrate) navigator.vibrate(12); }
  const under = document.querySelector(".sheet.under1");
  if (under) { under.style.transition = "none"; under.style.transform = `translateY(${6 - 6 * f.p}px) scale(${0.975 + 0.025 * f.p})`; under.style.filter = `brightness(${0.8 + 0.2 * f.p})`; }
}
function bindSheetDrag(top) {
  top.addEventListener("pointerdown", (e) => {
    top.setPointerCapture(e.pointerId);
    diaryDrag = { x: e.clientX, y: e.clientY, dx: 0, dy: 0, vx: 0, ripped: false, lx: e.clientX, lt: performance.now() };
  });
  top.addEventListener("pointermove", (e) => {
    if (!diaryDrag) return;
    const now = performance.now();
    diaryDrag.vx = (e.clientX - diaryDrag.lx) / Math.max(1, now - diaryDrag.lt); diaryDrag.lx = e.clientX; diaryDrag.lt = now;
    diaryDrag.dx = e.clientX - diaryDrag.x; diaryDrag.dy = e.clientY - diaryDrag.y;
    dragTo(top, diaryDrag.dx, diaryDrag.dy);
  });
  const end = () => {
    if (!diaryDrag) return;
    const { dx, dy, vx, ripped } = diaryDrag;
    if (tearProgress(dx, dy) > 0.5 || (Math.abs(vx) > 0.9 && Math.abs(dx) > 40)) flyAway(top, dx, dy, ripped);
    else springBack(top, dx, dy);
  };
  top.addEventListener("pointerup", end);
  top.addEventListener("pointercancel", end);
}
function springBack(el, dx, dy) {
  const f = sheetTransform(dx, dy);
  el.style.transform = ""; el.querySelector(".curl").style.opacity = 0;
  const under = document.querySelector(".sheet.under1"); if (under) { under.style.transform = ""; under.style.filter = ""; }
  const finish = () => { diaryDrag = null; renderDesk(); };
  if (reduceMotion() || (Math.abs(dx) < 4 && Math.abs(dy) < 4)) return finish();
  el.animate([{ transform: f.t, transformOrigin: f.origin }, { transform: `rotate(${f.dir * -2}deg)`, transformOrigin: f.origin, offset: 0.7 }, { transform: "none", transformOrigin: f.origin }],
    { duration: 420, easing: "cubic-bezier(.3,1.4,.5,1)" }).onfinish = finish;
}
function flyAway(el, dx, dy, ripped) {
  if (!ripped) { ripSound(); $("stub").style.opacity = 1; }
  const nights = diaryNights(), older = nights[nights.indexOf(diaryCur) + 1];
  const finish = () => { diaryDrag = null; diaryCur = older; renderDesk(); };
  if (reduceMotion()) return finish();
  const f = sheetTransform(dx, dy);
  el.animate([{ transform: f.t, transformOrigin: f.origin, opacity: 1 }, { transform: `translate(${f.dir * 260}px,560px) rotate(${f.dir * 75}deg)`, transformOrigin: f.origin, opacity: 0.2 }],
    { duration: 520, easing: "cubic-bezier(.4,0,.8,.4)", fill: "forwards" }).onfinish = finish;
  const under = document.querySelector(".sheet.under1");
  if (under) { under.style.transition = "transform .35s, filter .35s"; under.style.transform = "none"; under.style.filter = "none"; }
}
function autoTear() {
  const top = document.querySelector(".sheet.top"), btn = $("dTear");
  if (!top || btn.disabled) return;
  btn.disabled = true;
  if (reduceMotion()) { diaryDrag = { ripped: false }; return flyAway(top, -110, 140, false); }
  // a scripted pull: lift the bottom-left corner, cross the tear point, then let go
  const path = [[0, 0], [-30, 40], [-70, 90], [-110, 140]];
  let i = 0; diaryDrag = { ripped: false };
  const step = () => { if (i < path.length) { dragTo(top, ...path[i]); i++; setTimeout(step, 70); } else flyAway(top, -110, 140, diaryDrag.ripped); };
  step();
}
function putBack() {
  const nights = diaryNights(), i = nights.indexOf(diaryCur);
  if (i <= 0) return;
  diaryCur = nights[i - 1]; renderDesk();
  if (reduceMotion()) return;
  document.querySelector(".sheet.top").animate([{ transform: "translate(-140px,-360px) rotate(-35deg)", opacity: 0, transformOrigin: "0 0" }, { transform: "rotate(3deg)", opacity: 1, offset: 0.75, transformOrigin: "0 0" }, { transform: "none", transformOrigin: "0 0" }],
    { duration: 520, easing: "cubic-bezier(.2,.8,.3,1.2)" });
}

/* --- wall of every goodnight --- */
function renderWall() {
  const today = nightOf(), locked = !tonightUnlocked();
  const all = checkins.filter((c) => c.kind === "sleep" && c.note && !(c.night === today && c.user_id !== me.id && locked))
    .sort((a, b) => b.at.localeCompare(a.at));
  const freq = {}; all.forEach((c) => { const t = c.note.trim(); freq[t] = (freq[t] || 0) + 1; });
  const fav = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
  const nightsWritten = new Set(all.map((c) => c.night)).size;
  const qq = diaryQ.toLowerCase();
  const list = all.filter((c) => (diaryWho === "all" || (diaryWho === "me") === (c.user_id === me.id)) && (!qq || c.note.toLowerCase().includes(qq)));
  const hl = (s) => { const e = esc(s); if (!qq) return e; const re = new RegExp(esc(diaryQ).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"); return e.replace(re, (m) => `<mark>${m}</mark>`); };
  // group by month, then within a month drop each card into the shorter column so it still reads top-down in time
  const months = new Map();
  list.forEach((c) => { const m = c.night.slice(0, 7); if (!months.has(m)) months.set(m, []); months.get(m).push(c); });
  let wall = "";
  months.forEach((items, m) => {
    const cols = [[], []], h = [0, 0];
    items.forEach((c) => {
      const len = c.note.length, size = len <= 4 ? "short" : len > 14 ? "long" : "";
      const d = new Date(c.night + "T12:00:00"), mine = c.user_id === me.id;
      const html = `<button class="q ${mine ? "me" : "ta"} ${size}" data-k="${c.night}" type="button"><span class="seedmark"></span><p>${hl(c.note)}</p><small>${esc(whoName(c.user_id))} · ${d.getMonth() + 1}/${d.getDate()} ${hhmm(c.at)}</small></button>`;
      const j = h[0] <= h[1] ? 0 : 1; cols[j].push(html); h[j] += len + 12;
    });
    wall += `<div class="mon">${m.slice(0, 4)} 年 ${Number(m.slice(5))} 月</div><div class="cols"><div class="col">${cols[0].join("")}</div><div class="col">${cols[1].join("")}</div></div>`;
  });
  $("diaryBody").innerHTML = `
    <div class="wall-stats"><div><b>${all.length}</b><span>句晚安</span></div><div><b>${nightsWritten}</b><span>个晚上</span></div><div><b>${fav ? "「" + esc(fav[0].length > 8 ? fav[0].slice(0, 8) + "…" : fav[0]) + "」" : "—"}</b><span>${fav ? "说得最多 · " + fav[1] + " 次" : "说得最多"}</span></div></div>
    <input class="field" id="diaryQ" type="search" placeholder="搜索晚安话" autocomplete="off" value="${esc(diaryQ)}">
    <div class="filters" role="group" aria-label="筛选">
      <button class="fchip" type="button" data-w="all" aria-pressed="${diaryWho === "all"}">全部</button>
      <button class="fchip" type="button" data-w="me" aria-pressed="${diaryWho === "me"}">${esc(me.name || "我")} 说的</button>
      ${partner ? `<button class="fchip" type="button" data-w="ta" aria-pressed="${diaryWho === "ta"}">${esc(partner.name || "TA")} 说的</button>` : ""}
    </div>
    ${list.length ? wall : `<p class="note">${all.length ? "没有找到这句晚安话" : "还没有晚安话。睡前打卡时写一句，就会出现在这里"}</p>`}`;
  $("diaryQ").oninput = (e) => { diaryQ = e.target.value.trim(); const pos = e.target.selectionStart; renderWall(); const inp = $("diaryQ"); inp.focus(); inp.setSelectionRange(pos, pos); };
  document.querySelectorAll("#diaryBody .fchip").forEach((b) => (b.onclick = () => { diaryWho = b.dataset.w; renderWall(); }));
  document.querySelectorAll("#diaryBody .q").forEach((b) => (b.onclick = () => { diaryCur = b.dataset.k; diaryView = "desk"; renderDiary(false); $("p-diary").scrollIntoView(); }));
}
document.querySelectorAll("#p-diary .seg button").forEach((b) => (b.onclick = () => { diaryView = b.dataset.dv; renderDiary(false); }));
$("dSound").onclick = () => {
  diarySound = !diarySound;
  try { localStorage.setItem("diarySound", diarySound ? "1" : "0"); } catch { /* storage unavailable */ }
  $("dSound").innerHTML = diarySound ? SPEAKER_ON : SPEAKER_OFF;
  toast(diarySound ? "撕页声音已打开" : "撕页声音已关闭");
};

/* ---------- render: settings ---------- */
function renderSettings() {
  $("s-bed").value = couple.bed_target.slice(0, 5);
  $("s-wake").value = couple.wake_target.slice(0, 5);
  $("s-grace").value = String(couple.grace_min);
  $("s-leaves").value = String(couple.leaves_per_month);
  $("s-remind").checked = me.remind_bed;
  $("s-partner").checked = me.notify_partner;
  if (document.activeElement !== $("s-name")) $("s-name").value = me.name || "";
  $("s-code").textContent = couple.code;
  sb.auth.getUser().then(({ data }) => { $("s-email").textContent = data?.user?.email || ""; });
  renderPushState();
}
const standalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
async function renderPushState() {
  const st = $("pushState"), b = $("pushBtn");
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    st.textContent = standalone() ? "这台设备不支持推送" : "先添加到主屏幕，再从主屏幕打开"; b.hidden = true; return;
  }
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub && Notification.permission === "granted") { st.textContent = "已开启"; b.hidden = true; }
  else if (Notification.permission === "denied") { st.textContent = "已被拒绝，请到 iPhone 设置 → 通知 里打开"; b.hidden = true; }
  else { st.textContent = "提醒和 TA 的打卡消息"; b.hidden = false; }
}

function renderAll() {
  if (!me || !couple) return;
  renderToday();
  if (!$("p-cal").hidden) renderCal();
  if (!$("p-stats").hidden) renderStats();
  if (!$("p-set").hidden) renderSettings();
  if (!$("p-diary").hidden) renderDiary();
}

/* ---------- events: auth ---------- */
let signup = false;
$("a-switch").onclick = () => {
  signup = !signup;
  $("a-name").hidden = !signup;
  $("a-go").textContent = signup ? "注册" : "登录";
  $("a-switch").textContent = signup ? "已有账号？登录" : "还没有账号？注册";
  $("a-pass").autocomplete = signup ? "new-password" : "current-password";
  $("a-err").textContent = "";
  $("a-forgot").hidden = signup;
};
$("a-forgot").onclick = async () => {
  const email = $("a-email").value.trim();
  if (!email) return ($("a-err").textContent = "先在上面填你注册时用的邮箱");
  $("a-forgot").disabled = true;
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  $("a-forgot").disabled = false;
  $("a-err").textContent = error
    ? (/rate|seconds/i.test(error.message) ? "发得太频繁了，过一会儿再试" : "发送失败：" + error.message)
    : "重置链接已发到这个邮箱（也看看垃圾邮件），点开后设置新密码";
};
let recovering = /type=recovery/.test(location.hash);
$("v-reset").onsubmit = async (e) => {
  e.preventDefault();
  const a = $("r-pass").value, b = $("r-pass2").value;
  if (a.length < 6) return ($("r-err").textContent = "密码至少 6 位");
  if (a !== b) return ($("r-err").textContent = "两次输入的不一样");
  $("r-go").disabled = true;
  const { error } = await sb.auth.updateUser({ password: a });
  $("r-go").disabled = false;
  if (error) return ($("r-err").textContent = /session|expired|token/i.test(error.message) ? "链接已过期，请回到登录页重新点「忘记密码」" : "保存失败：" + error.message);
  recovering = false;
  history.replaceState(null, "", location.pathname);
  toast("新密码已保存");
  loadAll();
};
$("v-auth").onsubmit = async (e) => {
  e.preventDefault();
  const email = $("a-email").value.trim(), password = $("a-pass").value, name = $("a-name").value.trim();
  if (!email || password.length < 6) return ($("a-err").textContent = "请填写邮箱和至少 6 位的密码");
  if (signup && !name) return ($("a-err").textContent = "请填写昵称");
  $("a-go").disabled = true; $("a-err").textContent = "";
  const res = signup
    ? await sb.auth.signUp({ email, password, options: { data: { name, tz: TZ } } })
    : await sb.auth.signInWithPassword({ email, password });
  $("a-go").disabled = false;
  if (res.error) {
    const m = res.error.message || "";
    $("a-err").textContent = /Invalid login/i.test(m) ? "邮箱或密码不对" : /already registered/i.test(m) ? "这个邮箱已经注册过，请直接登录" : /confirm/i.test(m) ? "请先去邮箱点确认链接" : "出错了：" + m;
    return;
  }
  if (signup && !res.data.session) return ($("a-err").textContent = "注册成功，请去邮箱点确认链接后再登录");
  loadAll();
};

/* ---------- events: pairing ---------- */
$("p-create").onclick = async () => {
  $("p-create").disabled = true;
  const { error } = await sb.rpc("create_couple");
  $("p-create").disabled = false;
  if (error) return toast("生成失败，请重试");
  loadAll();
};
$("p-join").onclick = async () => {
  const code = $("p-input").value.trim();
  if (!/^\d{6}$/.test(code)) return ($("p-err").textContent = "配对码是 6 位数字");
  const { data, error } = await sb.rpc("join_couple", { p_code: code });
  if (error || !data) return ($("p-err").textContent = "配对码不对，或者对方已经绑定了别人");
  loadAll();
};
const signOut = async () => { await sb.auth.signOut(); location.reload(); };
$("p-out").onclick = signOut;
$("s-out").onclick = signOut;

/* ---------- events: check-in ---------- */
$("mainBtn").onclick = async () => {
  const btn = $("mainBtn"); btn.disabled = true;
  if (isNightPhase()) {
    const note = $("gnInput").value.trim() || null;
    const r = await checkIn("sleep", { note });
    if (r) {
      $("gnInput").value = "";
      const t = partner ? rec(partner.id, r.night) : {};
      playSleep(`晚安，${me.name || ""}`.trim(), !partner ? "" : (t.sleep || t.leave) ? "TA 也躺下了，晚安话已解锁" : "TA 会收到通知，等 TA 也躺下");
    }
  } else {
    let photo_path = null;
    const f = $("photoInput").files[0];
    if (f) {
      btn.textContent = "上传照片中…";
      try {
        const blob = await shrink(f);
        photo_path = `${me.couple_id}/${me.id}-${Date.now()}.jpg`;
        const { error } = await sb.storage.from("photos").upload(photo_path, blob, { contentType: "image/jpeg" });
        if (error) { photo_path = null; toast("照片上传失败，先只打卡"); }
      } catch { photo_path = null; }
    }
    const r = await checkIn("wake", { photo_path });
    if (r) {
      $("photoInput").value = ""; $("photoLbl").textContent = "附一张早安照片（可选）";
      const mine = rec(me.id, r.night);
      let sub = "";
      if (mine.sleep) { const h = (new Date(r.at) - new Date(mine.sleep.at)) / 3600e3; sub = `昨晚睡了 ${Math.floor(h)} 小时 ${Math.round((h % 1) * 60)} 分钟`; }
      playWake("早上好", sub);
      const t = partner ? rec(partner.id, r.night) : {};
      if (t.wake || t.leave) {
        const n = streak();
        playBoth(n > 0 ? `第 ${n} 天` : "今天完成", n > 0 ? "你们俩都完成了今天的打卡" : "你们俩都起床了");
      }
    }
  }
  renderAll();
};
$("photoInput").onchange = () => { $("photoLbl").textContent = $("photoInput").files[0] ? "已选好照片，打卡时一起上传" : "附一张早安照片（可选）"; };
function shrink(file, max = 1280) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = img.width * s; c.height = img.height * s;
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((b) => (b ? resolve(b) : reject()), "image/jpeg", 0.82);
      URL.revokeObjectURL(img.src);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/* ---------- events: leave ---------- */
let reason = "";
const reasons = [...document.querySelectorAll(".reason")];
function closeLeave() { $("leavePanel").hidden = true; $("leaveBtn").setAttribute("aria-expanded", "false"); reasons.forEach((r) => r.setAttribute("aria-pressed", "false")); reason = ""; $("leaveOk").disabled = true; }
$("leaveBtn").onclick = () => { const open = $("leavePanel").hidden; $("leavePanel").hidden = !open; $("leaveBtn").setAttribute("aria-expanded", open); };
reasons.forEach((r) => (r.onclick = () => { reasons.forEach((x) => x.setAttribute("aria-pressed", x === r)); reason = r.textContent; $("leaveOk").disabled = !!$("leaveOk").dataset.full; }));
$("leaveCancel").onclick = closeLeave;
$("leaveOk").onclick = async () => { const r = await checkIn("leave", { note: reason }); closeLeave(); if (r) toast("已请假，TA 会收到通知"); renderAll(); };
$("undoLeave").onclick = async () => {
  const l = rec(me.id, nightOf()).leave; if (!l) return;
  const { error } = await sb.from("checkins").delete().eq("id", l.id);
  if (error) return toast("撤销失败，请重试");
  checkins = checkins.filter((c) => c.id !== l.id); toast("已撤销请假"); renderAll();
};

/* ---------- events: bet ---------- */
$("stakeBtn").onclick = async () => {
  const next = STAKES[(STAKES.indexOf(couple.stake) + 1) % STAKES.length];
  couple.stake = next; renderBet();
  await sb.from("couples").update({ stake: next }).eq("id", couple.id);
};

/* ---------- events: settings ---------- */
const saveCouple = async (patch) => { Object.assign(couple, patch); const { error } = await sb.from("couples").update(patch).eq("id", couple.id); toast(error ? "保存失败" : "已保存，TA 那边也会更新"); renderAll(); };
const saveMe = async (patch) => { Object.assign(me, patch); const { error } = await sb.from("profiles").update(patch).eq("id", me.id); toast(error ? "保存失败" : "已保存"); renderAll(); };
$("s-bed").onchange = (e) => e.target.value && saveCouple({ bed_target: e.target.value });
$("s-wake").onchange = (e) => e.target.value && saveCouple({ wake_target: e.target.value });
$("s-grace").onchange = (e) => saveCouple({ grace_min: Number(e.target.value) });
$("s-leaves").onchange = (e) => saveCouple({ leaves_per_month: Number(e.target.value) });
$("s-remind").onchange = (e) => saveMe({ remind_bed: e.target.checked });
$("s-partner").onchange = (e) => saveMe({ notify_partner: e.target.checked });
$("s-name").onchange = (e) => { const v = e.target.value.trim(); if (v) saveMe({ name: v }); };

$("pushBtn").onclick = async () => {
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return renderPushState();
    const reg = await navigator.serviceWorker.ready;
    const r = await fetch(`${window.CONFIG.SUPABASE_URL}/functions/v1/push`, { headers: { apikey: window.CONFIG.SUPABASE_ANON_KEY } });
    const { key } = await r.json();
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64(key) });
    const j = sub.toJSON();
    const { error } = await sb.from("push_subs").upsert({ endpoint: j.endpoint, user_id: me.id, p256dh: j.keys.p256dh, auth: j.keys.auth });
    toast(error ? "开启失败，请重试" : "通知已开启");
  } catch (e) { toast("开启失败：" + (e.message || e)); }
  renderPushState();
};
function urlB64(s) { const p = "=".repeat((4 - (s.length % 4)) % 4); const b = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from([...b].map((c) => c.charCodeAt(0))); }

/* ---------- tabs ---------- */
document.querySelectorAll(".tab").forEach((t) => (t.onclick = async () => {
  document.querySelectorAll(".tab").forEach((x) => x.setAttribute("aria-selected", x === t));
  document.querySelectorAll(".page").forEach((p) => { p.hidden = p.id !== t.dataset.p; });
  if (t.dataset.p !== "p-today" && !partner) await refreshPartner();
  renderAll();
  $("scroller").scrollTo(0, 0);
}));
const goMonth = async (n) => {
  calMonth.setMonth(calMonth.getMonth() + n);
  selDay = null; $("dayCard").hidden = true;
  renderCal();
  if (await ensureMonth(calMonth.getFullYear(), calMonth.getMonth())) renderCal();
};
$("calPrev").onclick = () => goMonth(-1);
$("calNext").onclick = () => goMonth(1);

/* ---------- install tip ---------- */
try {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  $("installTip").hidden = !(ios && !standalone() && !localStorage.getItem("installTipX"));
} catch { /* storage unavailable */ }
$("installX").onclick = () => { $("installTip").hidden = true; try { localStorage.setItem("installTipX", "1"); } catch {} };

/* ---------- boot ---------- */
// block pinch-zoom (double-tap zoom is already off via touch-action: manipulation)
document.addEventListener("gesturestart", (e) => e.preventDefault());
document.addEventListener("gesturechange", (e) => e.preventDefault());
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
setInterval(() => { if (!$("v-main").hidden && me && couple) renderToday(); }, 30000);
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible" && me?.couple_id) { if (!partner) await refreshPartner(); await loadCheckins(); renderAll(); }
});
sb.auth.onAuthStateChange((ev) => {
  if (ev === "PASSWORD_RECOVERY") { recovering = true; show("v-reset"); }
  else if (ev === "SIGNED_OUT") show("v-auth");
});
if (recovering) show("v-reset"); else loadAll().catch(() => { show("v-auth"); });
