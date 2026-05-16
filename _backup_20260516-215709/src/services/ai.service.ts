/**
 * AI Mechanic Service
 * 
 * Provides intent classification and decision-tree logic for common
 * automotive problems BEFORE falling back to the AI model.
 * This reduces AI calls, improves response time, and ensures consistent answers.
 * 
 * IMPORTANT: This does NOT replace the AI — it enriches the prompt with
 * pre-classified context so the AI gives better, faster responses.
 */

// ---- Intent Classification ----

export type IntentType =
  | "warning_light"
  | "sound"
  | "smell"
  | "vibration"
  | "fluid_leak"
  | "starting_issue"
  | "brake_issue"
  | "overheating"
  | "general_question"
  | "maintenance"
  | "unknown";

export type RiskLevel = "critical" | "high" | "medium" | "low" | "info";

export interface ClassifiedIntent {
  type: IntentType;
  confidence: number;
  riskLevel: RiskLevel;
  matchedKeywords: string[];
  /** Pre-built context to inject into AI system prompt */
  contextHint: string;
  /** If true, show danger warning immediately without waiting for AI */
  immediateDanger: boolean;
}

// ---- Keyword Maps ----

const intentPatterns: Record<IntentType, { keywords: string[]; riskLevel: RiskLevel }> = {
  warning_light: {
    keywords: ["kontrolka", "svítí", "bliká", "check engine", "abs", "airbag", "epc", "tpms", "esp"],
    riskLevel: "medium",
  },
  sound: {
    keywords: ["zvuk", "rámus", "klepání", "skřípání", "pískání", "hučení", "klepá", "ťuká", "praská", "kvílení", "dunění"],
    riskLevel: "medium",
  },
  smell: {
    keywords: ["zápach", "pach", "smrdí", "cítit", "kouř", "spálenina", "benzín", "olej voní"],
    riskLevel: "high",
  },
  vibration: {
    keywords: ["vibrace", "třesení", "klepání volantu", "vibruje", "třese", "chvění"],
    riskLevel: "medium",
  },
  fluid_leak: {
    keywords: ["únik", "teče", "kapalina", "olej pod", "skvrna", "louže", "únik oleje", "únik chladiva"],
    riskLevel: "high",
  },
  starting_issue: {
    keywords: ["nestartuje", "nechce nastartovat", "startér", "mrtvá baterie", "baterie", "nenaskočí", "točí ale"],
    riskLevel: "medium",
  },
  brake_issue: {
    keywords: ["brzdy", "brzdí", "brzdový", "pedál brzdy", "brzdová kapalina", "abs", "zabrzdění"],
    riskLevel: "critical",
  },
  overheating: {
    keywords: ["přehřívá", "přehřátí", "teplota", "vařící", "pára", "horký", "teploměr", "coolant"],
    riskLevel: "critical",
  },
  general_question: {
    keywords: ["jak", "kdy", "kolik", "kde", "co znamená", "poradit", "doporučit"],
    riskLevel: "info",
  },
  maintenance: {
    keywords: ["výměna oleje", "servisní interval", "filtry", "údržba", "pravidelný servis", "stk", "emise"],
    riskLevel: "low",
  },
  unknown: {
    keywords: [],
    riskLevel: "info",
  },
};

const CRITICAL_PATTERNS = [
  /přehřát/i, /motor\s+(zast|přest)/i, /brzdy\s+(nefung|selhá)/i,
  /kouř\s+z/i, /požár/i, /nefunguj.*brzd/i, /únik.*brzd/i,
  /volant\s+(netočí|zablok)/i, /nehod/i,
];

// ---- Decision Tree: Common Answers ----

interface DecisionRule {
  intentType: IntentType;
  triggerKeywords: string[];
  quickAnswer: string;
  recommendedParts?: string[];
}

const decisionTree: DecisionRule[] = [
  {
    intentType: "warning_light",
    triggerKeywords: ["check engine"],
    quickAnswer: "Check Engine kontrolka může indikovat problémy od volného víčka nádrže po vážné poruchy motoru. Nejčastější příčiny: sonda lambda, katalyzátor, zapalovací svíčky.",
    recommendedParts: ["sonda lambda", "zapalovací svíčka"],
  },
  {
    intentType: "warning_light",
    triggerKeywords: ["tpms", "tlak pneumatik"],
    quickAnswer: "TPMS kontrolka = nízký tlak v jedné nebo více pneumatikách. Zkontrolujte tlak a dofukujte na doporučenou hodnotu (najdete na štítku ve dveřích řidiče).",
  },
  {
    intentType: "warning_light",
    triggerKeywords: ["olej"],
    quickAnswer: "Kontrolka oleje = nízký tlak oleje. IHNED zastavte a zkontrolujte hladinu oleje. Jízda s nízkým tlakem oleje může způsobit vážné poškození motoru.",
  },
  {
    intentType: "starting_issue",
    triggerKeywords: ["baterie", "mrtvá"],
    quickAnswer: "Mrtvá baterie – zkuste startovací kabely nebo nabíjení. U starších baterií (4+ let) doporučujeme výměnu. Pro Chrysler/Dodge doporučujeme originální Mopar baterii.",
    recommendedParts: ["baterie"],
  },
  {
    intentType: "maintenance",
    triggerKeywords: ["výměna oleje", "olej výměna"],
    quickAnswer: "Interval výměny oleje pro většinu Chrysler/Dodge vozidel: každých 12 000 km nebo 12 měsíců. Doporučujeme originální Mopar olej a filtr.",
    recommendedParts: ["motorový olej", "olejový filtr"],
  },
];

// ---- Public API ----

/**
 * Classify user message into an intent with risk level.
 * This runs BEFORE sending to AI to enrich the context.
 */
export function classifyIntent(message: string): ClassifiedIntent {
  const lower = message.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  let bestMatch: IntentType = "unknown";
  let bestScore = 0;
  let matchedKeywords: string[] = [];

  for (const [type, { keywords }] of Object.entries(intentPatterns) as [IntentType, { keywords: string[]; riskLevel: RiskLevel }][]) {
    const matched = keywords.filter(kw => lower.includes(kw.normalize("NFD").replace(/[\u0300-\u036f]/g, "")));
    if (matched.length > bestScore) {
      bestScore = matched.length;
      bestMatch = type;
      matchedKeywords = matched;
    }
  }

  const baseRisk = intentPatterns[bestMatch].riskLevel;
  const isCritical = CRITICAL_PATTERNS.some(p => p.test(message));
  const finalRisk: RiskLevel = isCritical ? "critical" : baseRisk;

  const contextHint = bestMatch !== "unknown"
    ? `[Klasifikace: ${bestMatch}, riziko: ${finalRisk}, klíčová slova: ${matchedKeywords.join(", ")}]`
    : "";

  return {
    type: bestMatch,
    confidence: bestScore > 0 ? Math.min(1, bestScore / 3) : 0,
    riskLevel: finalRisk,
    matchedKeywords,
    contextHint,
    immediateDanger: finalRisk === "critical",
  };
}

/**
 * Check decision tree for a quick pre-built answer.
 * Returns null if no rule matches — AI fallback should be used.
 */
export function getDecisionTreeAnswer(message: string, intentType: IntentType): DecisionRule | null {
  const lower = message.toLowerCase();
  return decisionTree.find(rule =>
    rule.intentType === intentType &&
    rule.triggerKeywords.some(kw => lower.includes(kw))
  ) || null;
}

/**
 * Build an enriched system prompt suffix based on classified intent.
 * Injected into the AI system prompt for better, faster responses.
 */
export function buildIntentContext(intent: ClassifiedIntent, quickAnswer: DecisionRule | null): string {
  const parts: string[] = [];

  if (intent.contextHint) {
    parts.push(intent.contextHint);
  }

  if (quickAnswer) {
    parts.push(`[Předběžná analýza: ${quickAnswer.quickAnswer}]`);
    if (quickAnswer.recommendedParts?.length) {
      parts.push(`[Doporučené díly k vyhledání: ${quickAnswer.recommendedParts.join(", ")}]`);
    }
  }

  if (intent.riskLevel === "critical") {
    parts.push("[KRITICKÉ RIZIKO – vždy doporuč okamžité zastavení a přivolání odtahu]");
  }

  return parts.join("\n");
}
