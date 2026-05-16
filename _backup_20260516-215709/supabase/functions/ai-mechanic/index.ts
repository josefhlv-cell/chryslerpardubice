// Previous AI models used:
// model: "google/gemini-3-flash-preview" (original)
// model: "google/gemini-2.5-flash-lite" (cost optimization attempt - failed with 402/503)
// Changed to: google/gemini-2.5-flash-lite for balance of cost and reliability

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ---- Intent Classification (server-side mirror of client logic) ----

type IntentType = "warning_light" | "sound" | "smell" | "vibration" | "fluid_leak" | "starting_issue" | "brake_issue" | "overheating" | "general_question" | "maintenance" | "unknown";
type RiskLevel = "critical" | "high" | "medium" | "low" | "info";

const intentPatterns: Record<IntentType, { keywords: string[]; riskLevel: RiskLevel }> = {
  warning_light: { keywords: ["kontrolka", "svítí", "bliká", "check engine", "abs", "airbag", "epc", "tpms", "esp"], riskLevel: "medium" },
  sound: { keywords: ["zvuk", "rámus", "klepání", "skřípání", "pískání", "hučení", "klepá", "ťuká", "praská"], riskLevel: "medium" },
  smell: { keywords: ["zápach", "pach", "smrdí", "cítit", "kouř", "spálenina"], riskLevel: "high" },
  vibration: { keywords: ["vibrace", "třesení", "vibruje", "třese", "chvění"], riskLevel: "medium" },
  fluid_leak: { keywords: ["únik", "teče", "kapalina", "olej pod", "skvrna", "louže"], riskLevel: "high" },
  starting_issue: { keywords: ["nestartuje", "nechce nastartovat", "startér", "mrtvá baterie", "baterie", "nenaskočí"], riskLevel: "medium" },
  brake_issue: { keywords: ["brzdy", "brzdí", "brzdový", "pedál brzdy", "brzdová kapalina"], riskLevel: "critical" },
  overheating: { keywords: ["přehřívá", "přehřátí", "teplota", "vařící", "pára", "horký"], riskLevel: "critical" },
  general_question: { keywords: ["jak", "kdy", "kolik", "kde", "co znamená", "poradit"], riskLevel: "info" },
  maintenance: { keywords: ["výměna oleje", "servisní interval", "filtry", "údržba"], riskLevel: "low" },
  unknown: { keywords: [], riskLevel: "info" },
};

const CRITICAL_PATTERNS = [
  /přehřát/i, /motor\s+(zast|přest)/i, /brzdy\s+(nefung|selhá)/i,
  /kouř\s+z/i, /požár/i, /nefunguj.*brzd/i, /únik.*brzd/i,
  /volant\s+(netočí|zablok)/i, /nehod/i,
];

function classifyIntent(message: string): { type: IntentType; riskLevel: RiskLevel; contextHint: string } {
  const lower = message.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  let bestMatch: IntentType = "unknown";
  let bestScore = 0;
  let matched: string[] = [];

  for (const [type, { keywords }] of Object.entries(intentPatterns)) {
    const m = keywords.filter(kw => lower.includes(kw.normalize("NFD").replace(/[\u0300-\u036f]/g, "")));
    if (m.length > bestScore) { bestScore = m.length; bestMatch = type as IntentType; matched = m; }
  }

  const baseRisk = intentPatterns[bestMatch].riskLevel;
  const isCritical = CRITICAL_PATTERNS.some(p => p.test(message));
  const finalRisk: RiskLevel = isCritical ? "critical" : baseRisk;

  const contextHint = bestMatch !== "unknown"
    ? `\n[Klasifikace: ${bestMatch}, riziko: ${finalRisk}, klíčová slova: ${matched.join(", ")}]${finalRisk === "critical" ? "\n[KRITICKÉ RIZIKO – vždy doporuč okamžité zastavení a přivolání odtahu]" : ""}`
    : "";

  return { type: bestMatch, riskLevel: finalRisk, contextHint };
}

// ---- Main Handler ----

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check - require authenticated user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userId = claimsData.claims.sub as string;

    const { messages, vehicle } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');

    // Classify the latest user message
    const lastUserMsg = [...messages].reverse().find((m: any) => m.role === "user");
    const intent = lastUserMsg ? classifyIntent(lastUserMsg.content) : { type: "unknown" as IntentType, riskLevel: "info" as RiskLevel, contextHint: "" };

    console.log(`[AI-Mechanic] Intent: ${intent.type}, Risk: ${intent.riskLevel}`);

    // Log conversation to ai_conversations (fire-and-forget, non-blocking)
    const serviceClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    serviceClient.from('ai_conversations').insert({
      user_id: userId,
      intent_type: intent.type,
      risk_level: intent.riskLevel,
      vehicle_brand: vehicle?.brand || null,
      vehicle_model: vehicle?.model || null,
    }).then(({ error: logErr }) => {
      if (logErr) console.warn('[AI-Mechanic] Failed to log conversation:', logErr.message);
    });

    const vehicleContext = vehicle
      ? `Zákazník vlastní vozidlo: ${vehicle.brand} ${vehicle.model} ${vehicle.year || ''} ${vehicle.engine || ''} (VIN: ${vehicle.vin || 'neznámý'}, km: ${vehicle.mileage || 'neznámé'}).`
      : 'Zákazník nemá uložené vozidlo.';

    const systemPrompt = `Jsi Tonda – AI Mechanik a odborný poradce pro vozidla Chrysler, Dodge a RAM s originálními Mopar díly. Vždy se představ jako Tonda.

${vehicleContext}
${intent.contextHint}

Tvoje role:
- Analyzuj popis problému, zvuk vozidla nebo fotografii a popiš možné příčiny závady
- U každé závady uveď PRAVDĚPODOBNOST v procentech (např. "70% pravděpodobnost")
- Upozorni na rizika pokračování v jízdě
- Pokud existuje riziko poškození motoru nebo bezpečnostní riziko, VŽDY napiš: "⚠️ NEPOKRAČUJTE V JÍZDĚ. MOŽNÉ RIZIKO POŠKOZENÍ MOTORU NEBO NEBEZPEČÍ NEHODY."
- Doporuč kontaktování servisu pro odborné doporučení
- Doporuč konkrétní Mopar díly pokud je to relevantní – uveď číslo dílu pokud ho znáš
- Pomáhej s ovládáním vozu (NE s řízením vozidla!)
- Vždy propaguj servis a originální náhradní díly
- NIKDY nedoporučuj pokračování v jízdě při riziku poškození motoru
- NIKDY nedoporučuj nebezpečné zásahy do vozidla

Formát odpovědi:
1. Stručná analýza problému
2. Možné příčiny s pravděpodobností
3. Rizika pokračování v jízdě (pokud relevantní)
4. Doporučení (servis, díly s OEM čísly)

Vždy odpovídej česky. Buď stručný ale odborný.`;

    let response: Response;
    try {
      response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash-lite',
          temperature: 0.3,
          max_tokens: 300,
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages,
          ],
          stream: true,
        }),
      });
    } catch (fetchErr: unknown) {
      console.error('AI fetch failed:', fetchErr instanceof Error ? fetchErr.message : fetchErr);
      return new Response(JSON.stringify({ error: 'AI mechanik je momentálně nedostupný. Zkuste to prosím později.' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!response.ok) {
      const errText = await response.text();
      console.error('AI gateway error:', response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Příliš mnoho požadavků, zkuste to později.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'AI mechanik je momentálně nedostupný. Zkuste to prosím později.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: 'AI mechanik je momentálně nedostupný. Zkuste to prosím později.' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
    });
  } catch (e) {
    console.error('ai-mechanic error:', e);
    return new Response(JSON.stringify({ error: 'AI mechanik je momentálně nedostupný. Zkuste to prosím později.' }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
