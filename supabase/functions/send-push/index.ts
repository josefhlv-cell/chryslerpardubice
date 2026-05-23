// send-push — odesílá push notifikace na zaregistrované zařízení (FCM v1 + APNs).
// Volá se buď z DB triggeru přes pg_net (po INSERT do notifications),
// nebo přímo z klienta/jiné funkce s payloadem { user_ids, title, body, link, dedupe_key }.
//
// Pokud FCM_SERVICE_ACCOUNT_JSON / APNS_AUTH_KEY nejsou nastavené, funkce
// vrátí 200 s `skipped: true` a důvodem — aby nezhavarovaly triggery.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FCM_SA = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON"); // JSON s private_key + client_email + project_id
const APNS_KEY = Deno.env.get("APNS_AUTH_KEY"); // .p8 obsah
const APNS_KEY_ID = Deno.env.get("APNS_KEY_ID");
const APNS_TEAM_ID = Deno.env.get("APNS_TEAM_ID");
const APNS_BUNDLE_ID = Deno.env.get("APNS_BUNDLE_ID") ?? "app.lovable.c6d932101224420590deeec3ccc6923f";
const APNS_HOST = Deno.env.get("APNS_HOST") ?? "api.push.apple.com"; // prod; sandbox: api.sandbox.push.apple.com

interface Payload {
  user_ids?: string[];      // explicitně cílení
  notification_id?: string; // pokud chceš resolvovat z notifications tabulky
  title?: string;
  body?: string;
  link?: string;
  dedupe_key?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const payload: Payload = await req.json().catch(() => ({}));

    let { user_ids, title, body, link, dedupe_key, notification_id } = payload;

    // Resolve z notifications tabulky (typické volání z triggeru)
    if (notification_id && (!title || !body || !user_ids)) {
      const { data: notif } = await admin
        .from("notifications")
        .select("user_id, title, message, link, dedupe_key")
        .eq("id", notification_id)
        .maybeSingle();
      if (notif) {
        user_ids = user_ids ?? [notif.user_id];
        title = title ?? notif.title;
        body = body ?? notif.message;
        link = link ?? notif.link ?? "/notifications";
        dedupe_key = dedupe_key ?? notif.dedupe_key ?? undefined;
      }
    }

    if (!user_ids?.length || !title) {
      return json({ ok: false, error: "Missing user_ids or title" }, 400);
    }

    const { data: tokens } = await admin
      .from("device_tokens")
      .select("token, platform")
      .in("user_id", user_ids);

    if (!tokens?.length) {
      return json({ ok: true, sent: 0, skipped: "no_tokens" });
    }

    const fcmTokens = tokens.filter((t) => t.platform === "android" || t.platform === "web").map((t) => t.token);
    const apnsTokens = tokens.filter((t) => t.platform === "ios").map((t) => t.token);

    const results = { fcm: 0, apns: 0, errors: [] as string[] };

    if (fcmTokens.length) {
      if (FCM_SA) {
        try {
          results.fcm = await sendFCM(fcmTokens, { title, body: body ?? "", link: link ?? "/" });
        } catch (e) {
          results.errors.push(`fcm: ${e instanceof Error ? e.message : String(e)}`);
        }
      } else {
        results.errors.push("fcm: FCM_SERVICE_ACCOUNT_JSON not configured");
      }
    }

    if (apnsTokens.length) {
      if (APNS_KEY && APNS_KEY_ID && APNS_TEAM_ID) {
        try {
          results.apns = await sendAPNS(apnsTokens, { title, body: body ?? "", link: link ?? "/" });
        } catch (e) {
          results.errors.push(`apns: ${e instanceof Error ? e.message : String(e)}`);
        }
      } else {
        results.errors.push("apns: APNS_AUTH_KEY/KEY_ID/TEAM_ID not configured");
      }
    }

    return json({ ok: true, ...results, total_tokens: tokens.length });
  } catch (e) {
    console.error("send-push error:", e);
    return json({ ok: false, error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─────── FCM v1 ───────
async function getFCMAccessToken(): Promise<{ token: string; projectId: string }> {
  const sa = JSON.parse(FCM_SA!);
  const now = Math.floor(Date.now() / 1000);
  const jwtHeader = { alg: "RS256", typ: "JWT" };
  const jwtClaim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const enc = (o: unknown) => btoa(JSON.stringify(o)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const unsigned = `${enc(jwtHeader)}.${enc(jwtClaim)}`;

  // Import RSA private key
  const pemBody = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuf))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${unsigned}.${sig}`,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`FCM token: ${JSON.stringify(data)}`);
  return { token: data.access_token, projectId: sa.project_id };
}

async function sendFCM(tokens: string[], msg: { title: string; body: string; link: string }): Promise<number> {
  const { token, projectId } = await getFCMAccessToken();
  let ok = 0;
  for (const t of tokens) {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          token: t,
          notification: { title: msg.title, body: msg.body },
          data: { link: msg.link },
          android: { priority: "HIGH", notification: { channel_id: "default" } },
          webpush: { fcm_options: { link: msg.link } },
        },
      }),
    });
    if (res.ok) ok++;
    else console.warn("FCM send fail", t.slice(0, 10), await res.text());
  }
  return ok;
}

// ─────── APNs (HTTP/2 via fetch, JWT-signed ES256) ───────
async function getAPNSJWT(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: APNS_KEY_ID! };
  const claim = { iss: APNS_TEAM_ID!, iat: now };
  const enc = (o: unknown) => btoa(JSON.stringify(o)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const unsigned = `${enc(header)}.${enc(claim)}`;

  const pemBody = APNS_KEY!.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(unsigned));
  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuf))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${unsigned}.${sig}`;
}

async function sendAPNS(tokens: string[], msg: { title: string; body: string; link: string }): Promise<number> {
  const jwt = await getAPNSJWT();
  let ok = 0;
  for (const t of tokens) {
    const res = await fetch(`https://${APNS_HOST}/3/device/${t}`, {
      method: "POST",
      headers: {
        Authorization: `bearer ${jwt}`,
        "apns-topic": APNS_BUNDLE_ID,
        "apns-push-type": "alert",
        "apns-priority": "10",
      },
      body: JSON.stringify({
        aps: { alert: { title: msg.title, body: msg.body }, sound: "default", badge: 1 },
        link: msg.link,
      }),
    });
    if (res.ok) ok++;
    else console.warn("APNs send fail", t.slice(0, 10), res.status, await res.text());
  }
  return ok;
}
