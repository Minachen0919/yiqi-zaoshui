/* 一起早睡 · app logic */
const sb = supabase.createClient(window.CONFIG.SUPABASE_URL, window.CONFIG.SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
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
  for (const v of ["v-boot", "v-auth", "v-pair", "v-main"]) $(v).hidden = v !== view;
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
  document.querySelector('meta[name="theme-color"]').content = night ? "#14132a" : "#f6f5f2";

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

/* ---------- render: calendar ---------- */
function renderCal() {
  if (!calMonth) { const t = new Date(nightOf() + "T12:00:00"); calMonth = new Date(t.getFullYear(), t.getMonth(), 1); }
  const y = calMonth.getFullYear(), m = calMonth.getMonth();
  $("calTitle").textContent = `${y} 年 ${m + 1} 月`;
  const today = nightOf();
  const first = (new Date(y, m, 1).getDay() + 6) % 7;
  const total = new Date(y, m + 1, 0).getDate();
  let html = "一二三四五六日".split("").map((d) => `<div class="h">${d}</div>`).join("") + "<div></div>".repeat(first);
  for (let d = 1; d <= total; d++) {
    const key = `${y}-${pad(m + 1)}-${pad(d)}`;
    const future = key > today;
    const a = future ? "" : status(me.id, key), b = future || !partner ? "" : status(partner.id, key);
    const dot = (s, color) => s === "ok" ? `<i style="background:${color}"></i>` : s === "leave" ? `<i class="lv"></i>` : s ? "<i></i>" : "";
    html += `<div class="day${key === today ? " today" : ""}${future ? " future" : ""}${a === "ok" && b === "ok" ? " full" : ""}"><span>${d}</span><span class="m">${dot(a, "var(--me)")}${partner ? dot(b, "var(--ta)") : ""}</span></div>`;
  }
  $("cal").innerHTML = html;
  $("lgMe").textContent = me.name || "我"; $("lgTa").textContent = partner?.name || "TA";
}

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
    if (r) { $("gnInput").value = ""; toast(partner ? "已打卡，TA 会收到通知" : "已打卡"); }
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
    if (r) { $("photoInput").value = ""; $("photoLbl").textContent = "附一张早安照片（可选）"; toast("早上好"); }
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
  document.querySelectorAll(".page").forEach((p) => { p.hidden = p.id !== t.dataset.p; if (!p.hidden && p.id !== "p-cal") p.style.display = "flex"; });
  if (t.dataset.p !== "p-today" && !partner) await refreshPartner();
  renderAll();
  window.scrollTo(0, 0);
}));
$("calPrev").onclick = () => { calMonth.setMonth(calMonth.getMonth() - 1); renderCal(); };
$("calNext").onclick = () => { calMonth.setMonth(calMonth.getMonth() + 1); renderCal(); };

/* ---------- install tip ---------- */
try {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  $("installTip").hidden = !(ios && !standalone() && !localStorage.getItem("installTipX"));
} catch { /* storage unavailable */ }
$("installX").onclick = () => { $("installTip").hidden = true; try { localStorage.setItem("installTipX", "1"); } catch {} };

/* ---------- boot ---------- */
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
setInterval(() => { if (!$("v-main").hidden) renderToday(); }, 30000);
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible" && me?.couple_id) { if (!partner) await refreshPartner(); await loadCheckins(); renderAll(); }
});
sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_OUT") show("v-auth"); });
loadAll().catch(() => { show("v-auth"); });
