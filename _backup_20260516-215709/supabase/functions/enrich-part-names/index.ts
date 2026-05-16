// enrich-part-names: J+M je autorita podle OEM. Doplní název i popis.
// Pro nematche: vyčistí mismatched popis a přeloží název DE/SK→CZ slovníkem.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Slovník DE/SK/EN → CZ pro názvy bez J+M matche
const DICT: Record<string, string> = {
  "BREMSBELAG SATZ": "Sada brzdových destiček",
  "BREMSBELAG": "Brzdová destička",
  "BREMSSCHEIBE": "Brzdový kotouč",
  "BREMSSATTEL": "Brzdový třmen",
  "BREMSTROMMEL": "Brzdový buben",
  "STOSSDAEMPFER": "Tlumič",
  "STOSSFAENGER": "Nárazník",
  "STOSSFAENGER VORN": "Přední nárazník",
  "STOSSFAENGER HINTEN": "Zadní nárazník",
  "SCHEINWERFER": "Světlomet",
  "SCHEIBE": "Sklo",
  "DICHTUNG": "Těsnění",
  "FILTER OEL": "Olejový filtr",
  "OELFILTER": "Olejový filtr",
  "LUFTFILTER": "Vzduchový filtr",
  "KRAFTSTOFFFILTER": "Palivový filtr",
  "ZUENDKERZE": "Zapalovací svíčka",
  "GLUEHKERZE": "Žhavící svíčka",
  "WASSERPUMPE": "Vodní čerpadlo",
  "OELPUMPE": "Olejové čerpadlo",
  "LICHTMASCHINE": "Alternátor",
  "ANLASSER": "Startér",
  "BATTERIE": "Autobaterie",
  "KUEHLER": "Chladič",
  "THERMOSTAT": "Termostat",
  "ZAHNRIEMEN": "Rozvodový řemen",
  "KEILRIEMEN": "Klínový řemen",
  "RIEMENSCHEIBE": "Řemenice",
  "SPURSTANGE": "Spojovací tyč",
  "QUERLENKER": "Příčné rameno",
  "RADLAGER": "Ložisko kola",
  "ANTRIEBSWELLE": "Hnací hřídel",
  "KARDANWELLE": "Kardanová hřídel",
  "AUSPUFF": "Výfuk",
  "KATALYSATOR": "Katalyzátor",
  "TUERGRIFF": "Klika dveří",
  "TUERVERKLEIDUNG": "Čalounění dveří",
  "AUSSENSPIEGEL": "Vnější zpětné zrcátko",
  "INNENSPIEGEL": "Vnitřní zpětné zrcátko",
  "SCHEIBENWISCHER": "Stěrač",
  "WISCHERBLATT": "Lišta stěrače",
  "ZAHNSTANGE": "Hřebenové řízení",
  "LENKRAD": "Volant",
  "LAMBDASONDE": "Lambda sonda",
  "EINSPRITZDUESE": "Vstřikovač",
  "INJEKTOR": "Vstřikovač",
  "GEBER": "Snímač",
  "SENSOR": "Snímač",
  "STEUERGERAET": "Řídicí jednotka",
  "ZYLINDERKOPF": "Hlava válců",
  "KOLBEN": "Píst",
  "KURBELWELLE": "Klikový hřídel",
  "NOCKENWELLE": "Vačkový hřídel",
  "MOTOR": "Motor",
  "GETRIEBE": "Převodovka",
  "KUPPLUNG": "Spojka",
  "SCHWUNGRAD": "Setrvačník",
  // SK / CZ bez diakritiky
  "KLIESTE": "Třmen",
  "RUKOJET": "Rukojeť",
  "RUKOJET DRZADLO": "Klika dveří",
  "DRZADLO": "Madlo",
  "ZATKA": "Zátka",
  "TLUMIC VYFUKU": "Tlumič výfuku",
  "TLUMIC": "Tlumič",
  "SVETLOMET": "Světlomet",
  "RAM(SASI)": "Rám (šasi)",
  "CALOUNENI DVERI": "Čalounění dveří",
  "CISTIC OLEJE": "Olejový filtr",
  "TRMEN BRZDY": "Brzdový třmen",
  "RID.JEDN.VSTRIK.": "Řídicí jednotka vstřikování",
  "DRZAK SKRT KL.": "Držák škrticí klapky",
  "ANPASSUNGSGERAT": "Adaptér",
  "INKOMPLETTER MOTOR": "Motor (nekompletní)",
};

function translateName(name: string): string | null {
  if (!name) return null;
  const upper = name.toUpperCase().trim();
  if (DICT[upper]) return DICT[upper];
  // částečný match na první slovo
  const first = upper.split(/[\s,()/-]/)[0];
  if (DICT[first]) return DICT[first];
  return null;
}

function descriptionMatchesName(name: string, desc: string): boolean {
  if (!desc || !name) return true;
  const n = name.toLowerCase();
  const d = desc.toLowerCase();
  // klíčové slovo z názvu (>3 znaky) musí být v popisu
  const tokens = n.split(/[\s,()/-]+/).filter(t => t.length > 3);
  if (tokens.length === 0) return true;
  return tokens.some(t => d.includes(t));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Number(body.limit) || 200, 500);

    // Vezmi díly, které ještě neprošly kontrolou (NULL první), pak nejstarší
    const { data: parts } = await supabase
      .from("parts_new")
      .select("id, oem_number, name, description, manufacturer")
      .order("last_name_check_at", { ascending: true, nullsFirst: true })
      .limit(limit);

    if (!parts?.length) return json({ success: true, updated: 0, remaining: 0 });

    let jmMatched = 0, dictTranslated = 0, descCleared = 0, unchanged = 0, failed = 0;
    const nowIso = new Date().toISOString();

    for (const p of parts) {
      const update: Record<string, any> = { last_name_check_at: nowIso };
      try {
        // 1) zkus J+M
        const { data: jm } = await supabase.functions.invoke("jm-proxy", {
          body: { action: "searchByCode", payload: { code: p.oem_number } },
        });
        const items = jm?.data?.items || [];
        const norm = (s: string) => (s || "").toUpperCase().replace(/[\s\-._/]/g, "");
        const target = norm(p.oem_number);
        const match = items.find((it: any) => norm(it.oem_number) === target);

        if (match?.name && match.name.length > 3) {
          // J+M = autorita
          update.name = match.name;
          if (match.description && match.description.length > 5) {
            update.description = match.description;
          } else if (p.description && !descriptionMatchesName(match.name, p.description)) {
            // popis neodpovídá novému názvu → smaž
            update.description = null;
          }
          if (match.brand) update.manufacturer = match.brand;
          jmMatched++;
        } else {
          // 2) bez J+M matche: zkontroluj mismatch popisu
          if (p.description && !descriptionMatchesName(p.name, p.description)) {
            update.description = null;
            descCleared++;
          }
          // 3) přelož název slovníkem
          const translated = translateName(p.name);
          if (translated && translated !== p.name) {
            update.name = translated;
            dictTranslated++;
          } else if (!update.description) {
            unchanged++;
          }
        }

        await supabase.from("parts_new").update(update).eq("id", p.id);
      } catch (_e) {
        failed++;
        // ulož aspoň timestamp ať se posuneme dál
        await supabase.from("parts_new").update({ last_name_check_at: nowIso }).eq("id", p.id);
      }
    }

    const { count: remaining } = await supabase
      .from("parts_new")
      .select("id", { head: true, count: "exact" })
      .or(`last_name_check_at.is.null,last_name_check_at.lt.${new Date(Date.now() - 7*24*3600*1000).toISOString()}`);

    return json({
      success: true,
      processed: parts.length,
      jmMatched, dictTranslated, descCleared, unchanged, failed,
      remaining: remaining ?? 0,
    });
  } catch (e) {
    return json({ success: false, error: String(e) }, 500);
  }
});

function json(o: any, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
