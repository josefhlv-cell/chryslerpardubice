/**
 * VINDetailPanel – shows AI-enriched VIN decode data:
 * basic specs, equipment highlights, engine/transmission specs,
 * service intervals, brake info, common issues.
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Cpu, Wrench, AlertTriangle, Settings, Zap, ShieldCheck, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { decodeVINEnriched, type VINDecodeResult } from "@/api/partsAPI";
import { toast } from "sonner";

interface VINDetailPanelProps {
  vin: string;
  /** If provided, skip fetching and display directly */
  data?: VINDecodeResult | null;
  /** Called after successful decode with basic info for form auto-fill */
  onDecoded?: (basic: VINDecodeResult["basic"]) => void;
  compact?: boolean;
}

const SectionTitle = ({ icon: Icon, children }: { icon: any; children: React.ReactNode }) => (
  <div className="flex items-center gap-2 mb-3">
    <Icon className="w-4 h-4 text-primary" />
    <h3 className="text-sm font-display font-semibold">{children}</h3>
  </div>
);

const SpecRow = ({ label, value }: { label: string; value?: string | number | null }) => {
  if (!value) return null;
  return (
    <div className="flex justify-between py-1 border-b border-border/30 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium text-right max-w-[60%]">{String(value)}</span>
    </div>
  );
};

export default function VINDetailPanel({ vin, data: externalData, onDecoded, compact }: VINDetailPanelProps) {
  const [result, setResult] = useState<VINDecodeResult | null>(externalData || null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(!compact);

  const decode = async () => {
    if (!vin || vin.length < 11) {
      toast.error("Zadejte platný VIN (min 11 znaků)");
      return;
    }
    setLoading(true);
    try {
      const res = await decodeVINEnriched(vin);
      setResult(res);
      setExpanded(true);
      onDecoded?.(res.basic);
      toast.success("VIN dekódován s AI obohacením");
    } catch (e: any) {
      toast.error(e.message || "Chyba dekódování VIN");
    }
    setLoading(false);
  };

  if (!result && !loading) {
    return (
      <Button variant="outline" size="sm" onClick={decode} className="w-full">
        <Cpu className="w-4 h-4 mr-2" />AI dekódování VIN
      </Button>
    );
  }

  if (loading) {
    return (
      <Card className="border-primary/20">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Dekóduji VIN a obohacuji AI daty...</span>
          </div>
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!result) return null;

  const { basic, enriched } = result;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="border-primary/20 overflow-hidden">
        <CardContent className="p-0">
          {/* Header */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-primary" />
              <span className="text-sm font-display font-bold">
                {basic.brand} {basic.model} {basic.year}
              </span>
              {basic.trim && <Badge variant="outline" className="text-[10px]">{basic.trim}</Badge>}
              {enriched && <Badge className="text-[10px] bg-primary/15 text-primary border-primary/25">AI</Badge>}
            </div>
            {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>

          {expanded && (
            <div className="px-4 pb-4">
              {/* Basic info row */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                {[
                  { label: "Karoserie", value: basic.body_class },
                  { label: "Pohon", value: basic.drive_type },
                  { label: "Palivo", value: basic.fuel_type },
                  { label: "Motor", value: `${basic.engine_displacement} ${basic.engine_cylinders}V` },
                  { label: "Převodovka", value: basic.transmission },
                  { label: "Vyrobeno", value: [basic.plant_city, basic.plant_country].filter(Boolean).join(", ") },
                ].filter(s => s.value && s.value.trim() && s.value !== "V").map((s, i) => (
                  <div key={i} className="rounded-lg bg-secondary p-2 text-center">
                    <p className="text-[10px] text-muted-foreground">{s.label}</p>
                    <p className="text-xs font-medium mt-0.5 truncate">{s.value}</p>
                  </div>
                ))}
              </div>

              {enriched ? (
                <Tabs defaultValue="specs" className="w-full">
                  <TabsList className="w-full grid grid-cols-4 h-8">
                    <TabsTrigger value="specs" className="text-[10px] px-1">Motor</TabsTrigger>
                    <TabsTrigger value="equipment" className="text-[10px] px-1">Výbava</TabsTrigger>
                    <TabsTrigger value="service" className="text-[10px] px-1">Servis</TabsTrigger>
                    <TabsTrigger value="issues" className="text-[10px] px-1">Problémy</TabsTrigger>
                  </TabsList>

                  {/* Engine & Transmission specs */}
                  <TabsContent value="specs" className="space-y-4 mt-3">
                    {enriched.engine_specs && (
                      <div>
                        <SectionTitle icon={Zap}>Specifikace motoru</SectionTitle>
                        <div className="rounded-lg bg-secondary p-3">
                          <SpecRow label="Výkon" value={enriched.engine_specs.hp ? `${enriched.engine_specs.hp} HP` : undefined} />
                          <SpecRow label="Točivý moment" value={enriched.engine_specs.torque_nm ? `${enriched.engine_specs.torque_nm} Nm` : undefined} />
                          <SpecRow label="Objem oleje" value={enriched.engine_specs.oil_capacity_l ? `${enriched.engine_specs.oil_capacity_l} L` : undefined} />
                          <SpecRow label="Typ oleje" value={enriched.engine_specs.oil_type} />
                          <SpecRow label="Chladicí kapalina" value={enriched.engine_specs.coolant_capacity_l ? `${enriched.engine_specs.coolant_capacity_l} L` : undefined} />
                          <SpecRow label="Olejový filtr OEM" value={enriched.engine_specs.oil_filter_oem} />
                          <SpecRow label="Vzduchový filtr OEM" value={enriched.engine_specs.air_filter_oem} />
                          <SpecRow label="Zapalovací svíčka OEM" value={enriched.engine_specs.spark_plug_oem} />
                        </div>
                      </div>
                    )}
                    {enriched.transmission_specs && (
                      <div>
                        <SectionTitle icon={Settings}>Převodovka</SectionTitle>
                        <div className="rounded-lg bg-secondary p-3">
                          <SpecRow label="Typ" value={enriched.transmission_specs.type} />
                          <SpecRow label="Stupně" value={enriched.transmission_specs.gears} />
                          <SpecRow label="Typ oleje" value={enriched.transmission_specs.fluid_type} />
                          <SpecRow label="Objem oleje" value={enriched.transmission_specs.fluid_capacity_l ? `${enriched.transmission_specs.fluid_capacity_l} L` : undefined} />
                        </div>
                      </div>
                    )}
                    {enriched.brake_info && (
                      <div>
                        <SectionTitle icon={ShieldCheck}>Brzdy</SectionTitle>
                        <div className="rounded-lg bg-secondary p-3">
                          <SpecRow label="Přední typ" value={enriched.brake_info.front_type} />
                          <SpecRow label="Zadní typ" value={enriched.brake_info.rear_type} />
                          <SpecRow label="Přední destičky OEM" value={enriched.brake_info.front_pad_oem} />
                          <SpecRow label="Zadní destičky OEM" value={enriched.brake_info.rear_pad_oem} />
                          <SpecRow label="Přední kotouče OEM" value={enriched.brake_info.front_rotor_oem} />
                          <SpecRow label="Zadní kotouče OEM" value={enriched.brake_info.rear_rotor_oem} />
                        </div>
                      </div>
                    )}
                    {enriched.tire_size && (
                      <div className="rounded-lg bg-secondary p-3">
                        <SpecRow label="Pneumatiky OE" value={enriched.tire_size} />
                      </div>
                    )}
                  </TabsContent>

                  {/* Equipment highlights */}
                  <TabsContent value="equipment" className="mt-3">
                    <SectionTitle icon={Zap}>Standardní výbava</SectionTitle>
                    {enriched.equipment_highlights && enriched.equipment_highlights.length > 0 ? (
                      <div className="space-y-1.5">
                        {enriched.equipment_highlights.map((item, i) => (
                          <div key={i} className="flex items-start gap-2 py-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                            <span className="text-xs">{item}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Informace o výbavě nejsou k dispozici.</p>
                    )}
                  </TabsContent>

                  {/* Service intervals */}
                  <TabsContent value="service" className="mt-3">
                    <SectionTitle icon={Wrench}>Servisní intervaly</SectionTitle>
                    {enriched.service_intervals && enriched.service_intervals.length > 0 ? (
                      <div className="space-y-2">
                        {enriched.service_intervals.map((svc, i) => (
                          <div key={i} className="rounded-lg bg-secondary p-3">
                            <p className="text-xs font-semibold">{svc.service_name}</p>
                            <div className="flex gap-3 mt-1">
                              {svc.interval_km && (
                                <span className="text-[10px] text-muted-foreground">
                                  každých <span className="font-medium text-foreground">{svc.interval_km.toLocaleString("cs")} km</span>
                                </span>
                              )}
                              {svc.interval_months && (
                                <span className="text-[10px] text-muted-foreground">
                                  nebo <span className="font-medium text-foreground">{svc.interval_months} měs.</span>
                                </span>
                              )}
                            </div>
                            {svc.recommended_oem && (
                              <p className="text-[10px] text-primary mt-1 font-mono">OEM: {svc.recommended_oem}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Servisní intervaly nejsou k dispozici.</p>
                    )}
                  </TabsContent>

                  {/* Common issues */}
                  <TabsContent value="issues" className="mt-3">
                    <SectionTitle icon={AlertTriangle}>Známé problémy</SectionTitle>
                    {enriched.common_issues && enriched.common_issues.length > 0 ? (
                      <div className="space-y-2">
                        {enriched.common_issues.map((issue, i) => (
                          <div key={i} className="flex items-start gap-2 rounded-lg bg-destructive/5 border border-destructive/10 p-3">
                            <AlertTriangle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
                            <span className="text-xs">{issue}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Žádné známé problémy.</p>
                    )}
                  </TabsContent>
                </Tabs>
              ) : (
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <p className="text-xs text-muted-foreground">AI obohacení není k dispozici</p>
                </div>
              )}

              {basic.airbags && (
                <div className="mt-3 rounded-lg bg-secondary p-3">
                  <SpecRow label="Airbagy" value={basic.airbags} />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
