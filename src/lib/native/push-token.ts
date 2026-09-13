/**
 * Jediné místo, kde se na nativní platformě registrují APNs/FCM listenery
 * a volá PushNotifications.register().
 *
 * Proč: iOS doručí `registration` event zpravidla jen jednou za běh aplikace.
 * Když se register() zavolal už při startu (initNative), pozdější volání
 * z UI (Účet → Zapnout notifikace) žádný event nedostalo a tlačítko
 * zůstalo viset v loadingu, dokud nevypršel timeout.
 *
 * Řešení: token se cachuje v modulu, listenery se registrují jen jednou a
 * všichni čekající (UI i startup) dostanou stejný výsledek.
 */
import { Capacitor } from "@capacitor/core";

type Waiter = {
  resolve: (token: string) => void;
  reject: (err: Error) => void;
};

let cachedToken: string | null = null;
let listenersReady = false;
let registerCalled = false;
let waiters: Waiter[] = [];
let lastError: string | null = null;

const REGISTRATION_TIMEOUT_MS = 20_000;

export function getCachedPushToken() {
  return cachedToken;
}

function settleSuccess(token: string) {
  cachedToken = token;
  lastError = null;
  const current = waiters;
  waiters = [];
  current.forEach((w) => w.resolve(token));
}

function settleError(message: string) {
  lastError = message;
  const current = waiters;
  waiters = [];
  current.forEach((w) => w.reject(new Error(message)));
}

async function ensureListeners() {
  if (listenersReady) return;
  const { PushNotifications } = await import("@capacitor/push-notifications");

  await PushNotifications.addListener("registration", (t) => {
    const value = String(t?.value || "");
    if (!value) {
      settleError("APNs vrátil prázdný token.");
      return;
    }
    settleSuccess(value);
  });

  await PushNotifications.addListener("registrationError", (err: any) => {
    const message = String(
      err?.error || err?.message || "APNs/FCM registrace selhala.",
    );
    registerCalled = false; // dovol nový pokus po chybě
    settleError(message);
  });

  listenersReady = true;
}

export class PushPermissionDeniedError extends Error {
  constructor() {
    super(
      "Notifikace nejsou povolené. Zapněte je v Nastavení telefonu → CHDP Garage → Oznámení.",
    );
    this.name = "PushPermissionDeniedError";
  }
}

/**
 * Zajistí oprávnění + APNs/FCM token. Vrací token nebo vyhodí chybu.
 * Nikdy nezůstane viset – vždy skončí tokenem, chybou nebo timeoutem.
 */
export async function ensurePushToken(): Promise<string> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error("Push notifikace jsou dostupné jen v mobilní aplikaci.");
  }

  const { PushNotifications } = await import("@capacitor/push-notifications");

  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
    perm = await PushNotifications.requestPermissions();
  }
  if (perm.receive !== "granted") {
    throw new PushPermissionDeniedError();
  }

  await ensureListeners();

  if (Capacitor.getPlatform() === "android") {
    try {
      await PushNotifications.createChannel({
        id: "default",
        name: "CHDP Garage",
        description: "Objednávky, servis, chat a upozornění",
        importance: 5,
        visibility: 1,
      } as any);
    } catch {
      /* kanál už existuje – ignoruj */
    }
  }

  // Token už máme z předchozí registrace v tomto běhu aplikace.
  if (cachedToken) return cachedToken;

  const waiting = new Promise<string>((resolve, reject) => {
    waiters.push({ resolve, reject });
  });

  if (!registerCalled) {
    registerCalled = true;
    try {
      await PushNotifications.register();
    } catch (e: any) {
      registerCalled = false;
      settleError(e?.message || "PushNotifications.register() selhal.");
    }
  }

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(
      () =>
        reject(
          new Error(
            Capacitor.getPlatform() === "ios"
              ? "APNs neodpověděl do 20 s. Zkontrolujte internet a povolená oznámení."
              : "FCM neodpověděl do 20 s. Zkontrolujte internet a konfiguraci Firebase.",
          ),
        ),
      REGISTRATION_TIMEOUT_MS,
    ),
  );

  try {
    return await Promise.race([waiting, timeout]);
  } catch (e) {
    // Umožni nový pokus po timeoutu.
    registerCalled = false;
    throw e;
  }
}

export function getLastPushError() {
  return lastError;
}
