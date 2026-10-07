// 一起早睡 · push function
// GET  ?vapid=1                     -> { key } public VAPID key (generated and stored on first use)
// POST { type: "event", id }        -> notify partner about a check-in (caller's JWT required)
// POST { type: "tick" }             -> bedtime reminders, called by pg_cron every 5 minutes
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });

async function vapid() {
  const { data } = await db.from("app_secrets").select("value").eq("name", "vapid").maybeSingle();
  if (data) return data.value as { publicKey: string; privateKey: string };
  const keys = webpush.generateVAPIDKeys();
  await db.from("app_secrets").insert({ name: "vapid", value: keys });
  return keys;
}

async function sendTo(userId: string, title: string, body: string) {
  const keys = await vapid();
  webpush.setVapidDetails("mailto:noreply@example.com", keys.publicKey, keys.privateKey);
  const { data: subs } = await db.from("push_subs").select("*").eq("user_id", userId);
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title, body }),
      );
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await db.from("push_subs").delete().eq("endpoint", s.endpoint);
    }
  }
}

function localParts(tz: string, d = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d).map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) };
}
// a "night" runs 15:00 -> 15:00 next day (same rule as the app)
const nightOf = (tz: string, d = new Date()) => localParts(tz, new Date(d.getTime() - 15 * 3600e3)).date;
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

async function handleEvent(req: Request, id: string) {
  const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "");
  const { data: u } = await db.auth.getUser(token);
  if (!u?.user) return json({ error: "unauthorized" }, 401);
  const { data: c } = await db.from("checkins").select("*").eq("id", id).maybeSingle();
  if (!c || c.user_id !== u.user.id) return json({ error: "not found" }, 404);
  const { data: people } = await db.from("profiles").select("*").eq("couple_id", c.couple_id);
  const me = people?.find((p) => p.id === c.user_id);
  const partner = people?.find((p) => p.id !== c.user_id);
  if (!partner || !partner.notify_partner) return json({ ok: true });
  const { data: theirs } = await db.from("checkins").select("kind").eq("user_id", partner.id).eq("night", c.night);
  const has = (k: string) => theirs?.some((x) => x.kind === k);
  const name = me?.name || "TA";
  if (c.kind === "sleep") {
    if (has("sleep") || has("leave")) await sendTo(partner.id, "晚安", `${name} 也躺下了，晚安话已解锁`);
    else await sendTo(partner.id, `${name} 已经躺下了`, "就差你了，放下手机吧");
  } else if (c.kind === "wake") {
    if (has("wake")) await sendTo(partner.id, "早上好", `${name} 也起床了，今天打卡完成`);
    else await sendTo(partner.id, `${name} 起床了`, "该你了，起来打个卡");
  } else if (c.kind === "leave") {
    await sendTo(partner.id, `${name} 请假了`, c.note ? `原因：${c.note}` : "这次不打卡，也不断签");
  }
  return json({ ok: true });
}

async function handleTick() {
  const { data: people } = await db.from("profiles").select("*, couples(*)").not("couple_id", "is", null).eq("remind_bed", true);
  for (const p of people ?? []) {
    const couple = p.couples;
    if (!couple) continue;
    const now = localParts(p.tz);
    const night = nightOf(p.tz);
    const bed = toMin(couple.bed_target);
    // minutes until bedtime, handling midnight wrap
    const until = (bed - now.min + 1440) % 1440;
    if (until > 30 || until <= 25) continue;
    const { data: mine } = await db.from("checkins").select("kind").eq("user_id", p.id).eq("night", night);
    if (mine?.some((x) => x.kind === "sleep" || x.kind === "leave")) continue;
    const { error } = await db.from("reminder_log").insert({ user_id: p.id, night, kind: "bed" });
    if (error) continue; // already sent
    await sendTo(p.id, "还有 30 分钟", `约定 ${couple.bed_target.slice(0, 5)} 睡觉，可以开始准备了`);
  }
  return json({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (req.method === "GET") return json({ key: (await vapid()).publicKey });
    const body = await req.json().catch(() => ({}));
    if (body.type === "event") return await handleEvent(req, body.id);
    if (body.type === "tick") return await handleTick();
    return json({ error: "bad request" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
