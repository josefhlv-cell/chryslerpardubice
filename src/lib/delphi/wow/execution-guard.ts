import { canExecuteWowDefinition, type WowServiceDefinitionCandidate } from "./service-definitions";
export interface WowExecutionDecision { allowed: boolean; reason: string }
export function evaluateWowExecution(def: WowServiceDefinitionCandidate, adapter: "vgate"|"cdp"|"unknown"): WowExecutionDecision {
  if (!canExecuteWowDefinition(def)) return { allowed:false, reason:"Funkce nemá kompletní ověřenou komunikační definici." };
  if (def.adapterSupport === "cdp_required" && adapter !== "cdp") return { allowed:false, reason:"Funkce vyžaduje Delphi CDP+/Snooper." };
  if (def.adapterSupport === "elm_supported" && adapter !== "vgate") return { allowed:false, reason:"Není aktivní kompatibilní ELM/Vgate transport." };
  return { allowed:true, reason:"Ověřená definice a kompatibilní adaptér." };
}
