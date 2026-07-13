import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bluetooth,
  Car,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleX,
  ClipboardList,
  Cpu,
  Eraser,
  Gauge,
  Info,
  Loader2,
  Play,
  RefreshCw,
  Search,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { bleManager } from "@/lib/obd/ble-manager";
import {
  findBrandForVin,
  listBrands,
  loadBrandFunctions,
  runDiagFunction,
  runRawCommand,
  uniqueSorted,
  VEHICLE_PROFILES,
} from "@/lib/delphi";
import type {
  ActiveDiagContext,
  BrandManifestEntry,
  DiagFunction,
  DiagRunResult,
  VehicleProfile,
} from "@/lib/delphi";

type EcuOption = { address: string; name: string; common?: string };

type PanelKey =
  | "dtc"
  | "live"
  | "actuators"
  | "service"
  | "ecuInfo";

type EcuScanResult = {
  ecu: EcuOption;
  stored: DiagRunResult | null;
  pending: DiagRunResult | null;
  permanent: DiagRunResult | null;
  clear?: DiagRunResult | null;
};

const panelTitles: Record<PanelKey, string> = {
  dtc: "Diagnostika závad",
  live: "Živá data",
  actuators: "Testy akčních členů",
  service: "Servisní funkce",
  ecuInfo: "Informace o ECU",
};

function normalizeText(value?: string) {
  return (value || "").toLocaleLowerCase("cs");
}

function normalizeAddress(value?: string) {
  return (value || "")
    .replace(/^0x/i, "")
    .replace(/\s+/g, "")
    .toUpperCase();
}

function ecuMatchesProfile(ecu: EcuOption, profile: VehicleProfile) {
  const text = normalizeText(`${ecu.name} ${ecu.common || ""}`);
  return profile.ecuHints.some((hint) => text.includes(normalizeText(hint)));
}

function isWriteFunction(fn: DiagFunction) {
  return fn.kind === "routine" || fn.kind === "actuator_test" || Boolean(fn.destructive);
}

function statusClass(status?: string) {
  if (status === "ok") return "border-emerald-600 bg-emerald-50 text-emerald-800";
  if (status === "pending") return "border-amber-500 bg-amber-50 text-amber-800";
  if (status === "nrc") return "border-orange-500 bg-orange-50 text-orange-800";
  return "border-red-500 bg-red-50 text-red-800";
}

function collectCodes(result: DiagRunResult | null): string[] {
  if (!result || result.status !== "ok") return [];
  return result.decoded
    .map((item) => String(item.value ?? item.name ?? "").trim())
    .filter((value) => value && value !== "Žádné DTC" && value !== "no_dtc");
}

function resultText(result: DiagRunResult | null) {
  if (!result) return "Nespouštěno";
  if (result.status === "ok") return "OK";
  if (result.status === "no_data") return "Bez dat";
  if (result.status === "timeout") return "Timeout";
  if (result.status === "nrc") return `NRC ${result.nrc?.code || ""}`.trim();
  return "Chyba";
}

export default function AdminDelphi() {
  const [brands, setBrands] = useState<BrandManifestEntry[]>([]);
  const [brandKey, setBrandKey] = useState("OBD2");
  const [vin, setVin] = useState("");
  const [functions, setFunctions] = useState<DiagFunction[]>([]);
  const [ecus, setEcus] = useState<EcuOption[]>([]);
  const [ecuAddress, setEcuAddress] = useState("__all");
  const [bleState, setBleState] = useState(bleManager.getState());
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [generation, setGeneration] = useState("");
  const [year, setYear] = useState("");
  const [profileId, setProfileId] = useState("");

  const [openPanel, setOpenPanel] = useState<PanelKey | null>("dtc");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<DiagFunction | null>(null);
  const [result, setResult] = useState<DiagRunResult | null>(null);
  const [running, setRunning] = useState(false);

  const [fullScanRunning, setFullScanRunning] = useState(false);
  const [fullClearRunning, setFullClearRunning] = useState(false);
  const [scanProgress, setScanProgress] = useState("");
  const [scanResults, setScanResults] = useState<EcuScanResult[]>([]);

  useEffect(
    () =>
      bleManager.subscribe((event) => {
        if (event.type === "stateChange") setBleState(event.payload);
      }),
    [],
  );

  useEffect(() => {
    listBrands()
      .then(setBrands)
      .catch((error) =>
        toast({
          title: "Katalog Delphi se nepodařilo načíst",
          description: String(error),
          variant: "destructive",
        }),
      );
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingCatalog(true);

    loadBrandFunctions(brandKey)
      .then((data) => {
        if (cancelled) return;

        setFunctions(data.functions);

        const map = new Map<string, EcuOption>();
        for (const ecu of data.catalog.ecus || []) {
          const key = normalizeAddress(ecu.address);
          if (!key) continue;
          map.set(key, {
            address: ecu.address,
            name: ecu.name,
            common: ecu.common_name,
          });
        }

        setEcus(
          Array.from(map.values()).sort((a, b) =>
            (a.common || a.name).localeCompare(b.common || b.name, "cs"),
          ),
        );

        setEcuAddress("__all");
        setSelected(null);
        setResult(null);
        setScanResults([]);
      })
      .catch((error) =>
        toast({
          title: "Chyba katalogu Delphi",
          description: String(error),
          variant: "destructive",
        }),
      )
      .finally(() => {
        if (!cancelled) setLoadingCatalog(false);
      });

    return () => {
      cancelled = true;
    };
  }, [brandKey]);

  const makes = useMemo(
    () => uniqueSorted(VEHICLE_PROFILES.map((item) => item.make)),
    [],
  );

  const models = useMemo(
    () =>
      uniqueSorted(
        VEHICLE_PROFILES.filter((item) => item.make === make).map((item) => item.model),
      ),
    [make],
  );

  const generations = useMemo(
    () =>
      uniqueSorted(
        VEHICLE_PROFILES.filter(
          (item) => item.make === make && item.model === model,
        ).map((item) => item.generation),
      ),
    [make, model],
  );

  const years = useMemo(() => {
    const values = new Set<number>();
    VEHICLE_PROFILES.filter(
      (item) =>
        item.make === make &&
        item.model === model &&
        item.generation === generation,
    ).forEach((item) => {
      for (let current = item.yearFrom; current <= item.yearTo; current += 1) {
        values.add(current);
      }
    });
    return [...values].sort((a, b) => b - a);
  }, [make, model, generation]);

  const matchingProfiles = useMemo(
    () =>
      VEHICLE_PROFILES.filter((item) => {
        const selectedYear = Number(year);
        return (
          item.make === make &&
          item.model === model &&
          item.generation === generation &&
          (!selectedYear ||
            (selectedYear >= item.yearFrom && selectedYear <= item.yearTo))
        );
      }),
    [make, model, generation, year],
  );

  const profile = useMemo(
    () => VEHICLE_PROFILES.find((item) => item.id === profileId) || null,
    [profileId],
  );

  useEffect(() => {
    if (profile && profile.brandKey !== brandKey) {
      setBrandKey(profile.brandKey);
    }
  }, [profile, brandKey]);

  const brand = useMemo(
    () => brands.find((item) => item.key === brandKey),
    [brands, brandKey],
  );

  const filteredEcus = useMemo(() => {
    if (!profile) return ecus;
    const matches = ecus.filter((ecu) => ecuMatchesProfile(ecu, profile));
    return matches.length > 0 ? matches : ecus;
  }, [ecus, profile]);

  const selectedEcu = useMemo(
    () => filteredEcus.find((item) => normalizeAddress(item.address) === normalizeAddress(ecuAddress)),
    [filteredEcus, ecuAddress],
  );

  const activeContext: ActiveDiagContext | null = useMemo(() => {
    if (!brand) return null;
    return {
      brandKey: brand.key,
      brandLabel: brand.display_name,
      isOem: brand.key !== "OBD2",
      vin: vin || null,
      ecuAddress: selectedEcu?.address,
      ecuName: selectedEcu?.common || selectedEcu?.name,
    };
  }, [brand, selectedEcu, vin]);

  const dtcFunctions = useMemo(
    () => functions.filter((fn) => fn.kind === "dtc_scan"),
    [functions],
  );

  const storedDtcFn = dtcFunctions.find((fn) => fn.command.trim() === "03") || null;
  const pendingDtcFn = dtcFunctions.find((fn) => fn.command.trim() === "07") || null;
  const permanentDtcFn = dtcFunctions.find((fn) => fn.command.trim().toUpperCase() === "0A") || null;

  const liveFunctions = useMemo(
    () =>
      functions.filter((fn) =>
        ["live_pid", "obd2_pid", "did"].includes(fn.kind),
      ),
    [functions],
  );

  const actuatorFunctions = useMemo(
    () => functions.filter((fn) => fn.kind === "actuator_test"),
    [functions],
  );

  const serviceFunctions = useMemo(
    () => functions.filter((fn) => fn.kind === "routine"),
    [functions],
  );

  const functionGroups = useMemo(() => {
    const source =
      openPanel === "live"
        ? liveFunctions
        : openPanel === "actuators"
          ? actuatorFunctions
          : openPanel === "service"
            ? serviceFunctions
            : [];

    const query = search.trim().toLocaleLowerCase("cs");
    const filtered = source.filter((fn) => {
      if (
        ecuAddress !== "__all" &&
        fn.ecuAddress &&
        normalizeAddress(fn.ecuAddress) !== normalizeAddress(ecuAddress)
      ) {
        return false;
      }

      if (!query) return true;

      return [
        fn.name,
        fn.description,
        fn.category,
        fn.ecuCommonName,
        fn.ecu,
        fn.routineId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("cs")
        .includes(query);
    });

    const groups = new Map<string, DiagFunction[]>();
    for (const fn of filtered) {
      const key = fn.category || fn.ecuCommonName || fn.ecu || "Ostatní";
      const list = groups.get(key) || [];
      list.push(fn);
      groups.set(key, list);
    }

    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], "cs"));
  }, [
    openPanel,
    liveFunctions,
    actuatorFunctions,
    serviceFunctions,
    search,
    ecuAddress,
  ]);

  const totalDtc = useMemo(
    () =>
      scanResults.reduce(
        (sum, item) =>
          sum +
          collectCodes(item.stored).length +
          collectCodes(item.pending).length +
          collectCodes(item.permanent).length,
        0,
      ),
    [scanResults],
  );

  function resetBelow(level: "make" | "model" | "generation" | "year") {
    if (level === "make") {
      setModel("");
      setGeneration("");
      setYear("");
      setProfileId("");
    } else if (level === "model") {
      setGeneration("");
      setYear("");
      setProfileId("");
    } else if (level === "generation") {
      setYear("");
      setProfileId("");
    } else {
      setProfileId("");
    }

    setEcuAddress("__all");
    setSelected(null);
    setResult(null);
    setScanResults([]);
  }

  async function decodeVin() {
    const found = await findBrandForVin(vin);
    if (!found) {
      toast({
        title: "VIN nebyl rozpoznán",
        description: "Vyber vozidlo ručně.",
        variant: "destructive",
      });
      return;
    }

    setBrandKey(found.key);
    toast({
      title: "Výrobce rozpoznán",
      description: `${found.display_name}. Model, rok a motor vyber ručně.`,
    });
  }

  function contextForEcu(ecu: EcuOption): ActiveDiagContext {
    return {
      brandKey: brand?.key || brandKey,
      brandLabel: brand?.display_name || brandKey,
      isOem: (brand?.key || brandKey) !== "OBD2",
      vin: vin || null,
      ecuAddress: ecu.address,
      ecuName: ecu.common || ecu.name,
    };
  }

  async function scanAllFaults() {
    if (bleState !== "connected") {
      toast({
        title: "OBD adaptér není připojen",
        variant: "destructive",
      });
      return;
    }

    if (!profile) {
      toast({
        title: "Nejdřív vyber vozidlo",
        description: "Vyber značku, model, generaci, rok a motor.",
        variant: "destructive",
      });
      return;
    }

    if (!storedDtcFn) {
      toast({
        title: "V katalogu chybí čtení DTC",
        description: "Nebyla nalezena funkce Mode 03.",
        variant: "destructive",
      });
      return;
    }

    const targets = filteredEcus.length > 0 ? filteredEcus : ecus;
    if (targets.length === 0) {
      toast({
        title: "Pro značku nejsou dostupné ECU",
        variant: "destructive",
      });
      return;
    }

    setFullScanRunning(true);
    setScanResults([]);
    setResult(null);

    const collected: EcuScanResult[] = [];

    try {
      for (let index = 0; index < targets.length; index += 1) {
        const ecu = targets[index];
        setScanProgress(
          `${index + 1}/${targets.length} · ${ecu.common || ecu.name}`,
        );

        const ctx = contextForEcu(ecu);

        const stored = await runDiagFunction(storedDtcFn, {
          activeContext: ctx,
          vin: vin || null,
        });

        const pending = pendingDtcFn
          ? await runDiagFunction(pendingDtcFn, {
              activeContext: ctx,
              vin: vin || null,
            })
          : null;

        const permanent = permanentDtcFn
          ? await runDiagFunction(permanentDtcFn, {
              activeContext: ctx,
              vin: vin || null,
            })
          : null;

        const row = { ecu, stored, pending, permanent };
        collected.push(row);
        setScanResults([...collected]);
      }

      toast({
        title: "Kompletní diagnostika dokončena",
        description: `Zkontrolováno ${targets.length} jednotek, nalezeno ${collected.reduce(
          (sum, item) =>
            sum +
            collectCodes(item.stored).length +
            collectCodes(item.pending).length +
            collectCodes(item.permanent).length,
          0,
        )} DTC.`,
      });
    } finally {
      setFullScanRunning(false);
      setScanProgress("");
    }
  }

  async function clearAllFaults() {
    if (bleState !== "connected") {
      toast({
        title: "OBD adaptér není připojen",
        variant: "destructive",
      });
      return;
    }

    if (!profile) {
      toast({
        title: "Nejdřív vyber vozidlo",
        variant: "destructive",
      });
      return;
    }

    const targets = filteredEcus.length > 0 ? filteredEcus : ecus;
    if (targets.length === 0) return;

    const confirmed = window.confirm(
      [
        "SMAZAT CHYBY VE VŠECH DOSTUPNÝCH JEDNOTKÁCH?",
        "",
        "Zapalování musí být zapnuté a motor podle požadavků výrobce vypnutý.",
        "Po vymazání se automaticky znovu načtou chyby.",
      ].join("\n"),
    );
    if (!confirmed) return;

    setFullClearRunning(true);

    const cleared: EcuScanResult[] = [];

    try {
      for (let index = 0; index < targets.length; index += 1) {
        const ecu = targets[index];
        setScanProgress(
          `${index + 1}/${targets.length} · mazání · ${ecu.common || ecu.name}`,
        );

        const ctx = contextForEcu(ecu);
        const clear = await runRawCommand("04", ctx, {
          activeContext: ctx,
          vin: vin || null,
          serviceMode: true,
        });

        const stored = storedDtcFn
          ? await runDiagFunction(storedDtcFn, {
              activeContext: ctx,
              vin: vin || null,
            })
          : null;

        const pending = pendingDtcFn
          ? await runDiagFunction(pendingDtcFn, {
              activeContext: ctx,
              vin: vin || null,
            })
          : null;

        const permanent = permanentDtcFn
          ? await runDiagFunction(permanentDtcFn, {
              activeContext: ctx,
              vin: vin || null,
            })
          : null;

        const row = { ecu, clear, stored, pending, permanent };
        cleared.push(row);
        setScanResults([...cleared]);
      }

      toast({
        title: "Mazání dokončeno",
        description: "Proběhla následná kontrola chyb.",
      });
    } finally {
      setFullClearRunning(false);
      setScanProgress("");
    }
  }

  async function runSelected() {
    if (!selected) return;

    const warning = isWriteFunction(selected)
      ? [
          "VAROVÁNÍ – ODBORNÝ REŽIM",
          "",
          selected.safetyWarning ||
            "Tato funkce může změnit stav řídicí jednotky nebo vozidla.",
          "",
          "Funkce nemusí být ověřena pro konkrétní SW variantu ECU.",
          "Zkontroluj vybranou ECU, napětí, zapalování a podmínky výrobce.",
          "",
          "Spustit funkci?",
        ].join("\n")
      : selected.destructive
        ? `Pozor: ${selected.safetyWarning || "Tato funkce může změnit stav vozidla."}\n\nPokračovat?`
        : null;

    if (warning && !window.confirm(warning)) return;

    setRunning(true);
    try {
      const output = await runDiagFunction(selected, {
        activeContext,
        vin: vin || null,
        serviceMode: true,
      });
      setResult(output);
    } catch (error) {
      toast({
        title: "Funkci se nepodařilo spustit",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setRunning(false);
    }
  }

  function togglePanel(panel: PanelKey) {
    setOpenPanel((current) => (current === panel ? null : panel));
    setSelected(null);
    setResult(null);
    setSearch("");
  }

  return (
    <div className="min-w-0 space-y-3">
      <div className="overflow-hidden rounded-xl border border-slate-500 bg-gradient-to-b from-slate-100 to-slate-300 text-slate-950 shadow-lg">
        <div className="flex items-center justify-between gap-3 border-b border-slate-500 bg-gradient-to-b from-slate-700 to-slate-950 px-4 py-3 text-white">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-300">
              Samostatná diagnostika
            </p>
            <h1 className="text-xl font-extrabold tracking-tight">
              Delphi Diagnostic
            </h1>
          </div>

          <Badge
            variant="outline"
            className={
              bleState === "connected"
                ? "border-emerald-400 bg-emerald-950/50 text-emerald-200"
                : "border-red-400 bg-red-950/50 text-red-200"
            }
          >
            <Bluetooth className="mr-1 h-3.5 w-3.5" />
            {bleState === "connected" ? "OBD připojeno" : "OBD odpojeno"}
          </Badge>
        </div>

        <div className="space-y-3 p-3 sm:p-4">
          {/* 1. VÝBĚR VOZIDLA */}
          <section className="overflow-hidden rounded-xl border border-slate-500 bg-white">
            <div className="border-b border-slate-400 bg-slate-200 px-3 py-2 text-sm font-bold">
              1. Vyber vozidlo
            </div>

            <div className="space-y-3 p-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <div>
                  <Label className="text-xs font-bold text-slate-700">VIN</Label>
                  <Input
                    value={vin}
                    maxLength={17}
                    onChange={(event) => setVin(event.target.value.toUpperCase())}
                    placeholder="17 znaků VIN"
                    className="mt-1 border-slate-400 bg-white font-mono text-slate-950"
                  />
                </div>
                <Button
                  variant="secondary"
                  onClick={decodeVin}
                  disabled={vin.length < 3}
                  className="self-end border border-slate-500"
                >
                  Identifikovat
                </Button>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <Label className="text-xs font-bold text-slate-700">Značka</Label>
                  <Select
                    value={make}
                    onValueChange={(value) => {
                      setMake(value);
                      resetBelow("make");
                    }}
                  >
                    <SelectTrigger className="mt-1 border-slate-400 bg-white text-slate-950">
                      <SelectValue placeholder="Vyber značku" />
                    </SelectTrigger>
                    <SelectContent className="max-h-80">
                      {makes.map((value) => (
                        <SelectItem key={value} value={value}>{value}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs font-bold text-slate-700">Model</Label>
                  <Select
                    value={model}
                    onValueChange={(value) => {
                      setModel(value);
                      resetBelow("model");
                    }}
                    disabled={!make}
                  >
                    <SelectTrigger className="mt-1 border-slate-400 bg-white text-slate-950">
                      <SelectValue placeholder="Vyber model" />
                    </SelectTrigger>
                    <SelectContent className="max-h-80">
                      {models.map((value) => (
                        <SelectItem key={value} value={value}>{value}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs font-bold text-slate-700">Generace</Label>
                  <Select
                    value={generation}
                    onValueChange={(value) => {
                      setGeneration(value);
                      resetBelow("generation");
                    }}
                    disabled={!model}
                  >
                    <SelectTrigger className="mt-1 border-slate-400 bg-white text-slate-950">
                      <SelectValue placeholder="Vyber generaci" />
                    </SelectTrigger>
                    <SelectContent className="max-h-80">
                      {generations.map((value) => (
                        <SelectItem key={value} value={value}>{value}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs font-bold text-slate-700">Modelový rok</Label>
                  <Select
                    value={year}
                    onValueChange={(value) => {
                      setYear(value);
                      resetBelow("year");
                    }}
                    disabled={!generation}
                  >
                    <SelectTrigger className="mt-1 border-slate-400 bg-white text-slate-950">
                      <SelectValue placeholder="Vyber rok" />
                    </SelectTrigger>
                    <SelectContent className="max-h-80">
                      {years.map((value) => (
                        <SelectItem key={value} value={String(value)}>{value}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="sm:col-span-2">
                  <Label className="text-xs font-bold text-slate-700">Motor</Label>
                  <Select
                    value={profileId}
                    onValueChange={(value) => {
                      setProfileId(value);
                      setEcuAddress("__all");
                      setSelected(null);
                      setResult(null);
                      setScanResults([]);
                    }}
                    disabled={!year}
                  >
                    <SelectTrigger className="mt-1 border-slate-400 bg-white text-slate-950">
                      <SelectValue placeholder="Vyber motor" />
                    </SelectTrigger>
                    <SelectContent className="max-h-80">
                      {matchingProfiles.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.engine} · {item.engineCode}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </section>

          {/* 2. VÝBĚR SYSTÉMU */}
          <section className="overflow-hidden rounded-xl border border-slate-500 bg-white">
            <div className="border-b border-slate-400 bg-slate-200 px-3 py-2 text-sm font-bold">
              2. Vyber systém
            </div>

            <div className="space-y-3 p-3">
              <div>
                <Label className="text-xs font-bold text-slate-700">
                  Řídicí jednotka / systém
                </Label>
                <Select
                  value={ecuAddress}
                  onValueChange={(value) => {
                    setEcuAddress(value);
                    setSelected(null);
                    setResult(null);
                  }}
                  disabled={!profile || loadingCatalog}
                >
                  <SelectTrigger className="mt-1 border-slate-400 bg-white text-slate-950">
                    <SelectValue placeholder="Vyber systém" />
                  </SelectTrigger>
                  <SelectContent className="max-h-96">
                    <SelectItem value="__all">Všechny dostupné systémy</SelectItem>
                    {filteredEcus.map((ecu) => (
                      <SelectItem key={normalizeAddress(ecu.address)} value={ecu.address}>
                        {ecu.common || ecu.name} [{normalizeAddress(ecu.address)}]
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-lg border border-slate-400 bg-slate-100 p-3 text-sm">
                <div className="flex items-start gap-2">
                  <Car className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
                  <div className="min-w-0">
                    <p className="font-bold">
                      {profile
                        ? `${profile.make} ${profile.model} ${profile.generation}`
                        : "Vozidlo není vybrané"}
                    </p>
                    <p className="text-xs text-slate-600">
                      {profile
                        ? `${year} · ${profile.engine} · ${profile.engineCode}`
                        : "Vyber vozidlo shora dolů"}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      {selectedEcu?.common ||
                        selectedEcu?.name ||
                        "Všechny dostupné systémy"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 3. DIAGNOSTICKÉ FUNKCE */}
          <section className="overflow-hidden rounded-xl border border-slate-500 bg-white">
            <div className="border-b border-slate-400 bg-slate-200 px-3 py-2 text-sm font-bold">
              3. Diagnostické funkce
            </div>

            <div className="divide-y divide-slate-300">
              {/* DTC */}
              <div>
                <button
                  type="button"
                  onClick={() => togglePanel("dtc")}
                  className="flex w-full items-center gap-3 px-3 py-4 text-left hover:bg-slate-100"
                >
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-950">Diagnostika závad</p>
                    <p className="text-xs text-slate-600">
                      Načíst nebo vymazat chyby ve všech dostupných jednotkách
                    </p>
                  </div>
                  {openPanel === "dtc" ? (
                    <ChevronDown className="h-5 w-5 text-slate-600" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-slate-600" />
                  )}
                </button>

                {openPanel === "dtc" && (
                  <div className="space-y-3 border-t border-slate-300 bg-slate-50 p-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Button
                        onClick={scanAllFaults}
                        disabled={fullScanRunning || fullClearRunning || bleState !== "connected"}
                        className="bg-blue-700 hover:bg-blue-600"
                      >
                        {fullScanRunning ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="mr-2 h-4 w-4" />
                        )}
                        Načíst všechny chyby
                      </Button>

                      <Button
                        onClick={clearAllFaults}
                        disabled={fullScanRunning || fullClearRunning || bleState !== "connected"}
                        variant="destructive"
                      >
                        {fullClearRunning ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Eraser className="mr-2 h-4 w-4" />
                        )}
                        Smazat všechny chyby
                      </Button>
                    </div>

                    {(fullScanRunning || fullClearRunning) && (
                      <div className="rounded-lg border border-blue-300 bg-blue-50 p-3 text-sm text-blue-900">
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>{scanProgress || "Probíhá diagnostika…"}</span>
                        </div>
                      </div>
                    )}

                    {scanResults.length > 0 && (
                      <div className="space-y-2">
                        <div className="grid grid-cols-3 gap-2 rounded-lg border border-slate-400 bg-white p-3 text-center">
                          <div>
                            <p className="text-lg font-black">{scanResults.length}</p>
                            <p className="text-[10px] uppercase text-slate-500">Jednotek</p>
                          </div>
                          <div>
                            <p className="text-lg font-black text-red-700">{totalDtc}</p>
                            <p className="text-[10px] uppercase text-slate-500">DTC</p>
                          </div>
                          <div>
                            <p className="text-lg font-black text-emerald-700">
                              {
                                scanResults.filter(
                                  (item) =>
                                    collectCodes(item.stored).length +
                                      collectCodes(item.pending).length +
                                      collectCodes(item.permanent).length ===
                                    0,
                                ).length
                              }
                            </p>
                            <p className="text-[10px] uppercase text-slate-500">Bez chyb</p>
                          </div>
                        </div>

                        {scanResults.map((item) => {
                          const storedCodes = collectCodes(item.stored);
                          const pendingCodes = collectCodes(item.pending);
                          const permanentCodes = collectCodes(item.permanent);
                          const allCodes = [
                            ...storedCodes.map((code) => ({ code, type: "Uložená" })),
                            ...pendingCodes.map((code) => ({ code, type: "Čekající" })),
                            ...permanentCodes.map((code) => ({ code, type: "Trvalá" })),
                          ];

                          return (
                            <details
                              key={normalizeAddress(item.ecu.address)}
                              className="overflow-hidden rounded-lg border border-slate-400 bg-white"
                              open={allCodes.length > 0}
                            >
                              <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-3">
                                {allCodes.length > 0 ? (
                                  <CircleX className="h-5 w-5 shrink-0 text-red-600" />
                                ) : (
                                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className="truncate font-bold">
                                    {item.ecu.common || item.ecu.name}
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    ECU {normalizeAddress(item.ecu.address)} · {allCodes.length} DTC
                                  </p>
                                </div>
                                <Badge
                                  variant="outline"
                                  className={
                                    allCodes.length > 0
                                      ? "border-red-400 text-red-700"
                                      : "border-emerald-400 text-emerald-700"
                                  }
                                >
                                  {allCodes.length > 0 ? `${allCodes.length} chyb` : "Bez chyb"}
                                </Badge>
                              </summary>

                              <div className="space-y-2 border-t border-slate-300 bg-slate-50 p-3">
                                {item.clear && (
                                  <p className="text-xs text-slate-600">
                                    Mazání: <strong>{resultText(item.clear)}</strong>
                                  </p>
                                )}

                                {allCodes.length === 0 ? (
                                  <p className="rounded border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
                                    Jednotka nehlásí žádný dekódovaný DTC.
                                  </p>
                                ) : (
                                  allCodes.map((entry, index) => (
                                    <div
                                      key={`${entry.type}-${entry.code}-${index}`}
                                      className="rounded border border-red-300 bg-red-50 p-3"
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <strong className="font-mono text-red-900">
                                          {entry.code}
                                        </strong>
                                        <Badge variant="outline" className="border-red-300 text-red-700">
                                          {entry.type}
                                        </Badge>
                                      </div>
                                    </div>
                                  ))
                                )}

                                <details className="rounded border border-slate-300 bg-white">
                                  <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-slate-600">
                                    Technické výsledky
                                  </summary>
                                  <div className="space-y-1 border-t border-slate-200 p-3 text-xs text-slate-600">
                                    <p>Uložené: {resultText(item.stored)}</p>
                                    <p>Čekající: {resultText(item.pending)}</p>
                                    <p>Trvalé: {resultText(item.permanent)}</p>
                                  </div>
                                </details>
                              </div>
                            </details>
                          );
                        })}
                      </div>
                    )}

                    {scanResults.length === 0 && !fullScanRunning && !fullClearRunning && (
                      <div className="rounded-lg border border-slate-300 bg-white p-4 text-sm text-slate-600">
                        Stiskni <strong>Načíst všechny chyby</strong>. Aplikace projde dostupné
                        řídicí jednotky postupně a zobrazí výsledky podle systému.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* LIVE */}
              <FunctionPanelHeader
                panel="live"
                openPanel={openPanel}
                title="Živá data"
                description={`${liveFunctions.length} položek · rozděleno do skupin`}
                icon={<Gauge className="h-5 w-5 text-blue-700" />}
                onToggle={togglePanel}
              />

              {/* ACTUATORS */}
              <FunctionPanelHeader
                panel="actuators"
                openPanel={openPanel}
                title="Testy akčních členů"
                description={`${actuatorFunctions.length} funkcí · všechny dostupné`}
                icon={<Activity className="h-5 w-5 text-violet-700" />}
                onToggle={togglePanel}
              />

              {/* SERVICE */}
              <FunctionPanelHeader
                panel="service"
                openPanel={openPanel}
                title="Servisní funkce"
                description={`${serviceFunctions.length} funkcí · rozbal, vyber a spusť`}
                icon={<Wrench className="h-5 w-5 text-amber-700" />}
                onToggle={togglePanel}
              />

              {/* ECU INFO */}
              <div>
                <button
                  type="button"
                  onClick={() => togglePanel("ecuInfo")}
                  className="flex w-full items-center gap-3 px-3 py-4 text-left hover:bg-slate-100"
                >
                  <Info className="h-5 w-5 text-slate-700" />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-950">Informace o ECU</p>
                    <p className="text-xs text-slate-600">
                      Vybraná jednotka, adresa, katalog a vozidlo
                    </p>
                  </div>
                  {openPanel === "ecuInfo" ? (
                    <ChevronDown className="h-5 w-5 text-slate-600" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-slate-600" />
                  )}
                </button>

                {openPanel === "ecuInfo" && (
                  <div className="space-y-2 border-t border-slate-300 bg-slate-50 p-3">
                    <InfoRow label="Výrobce" value={brand?.display_name || "—"} />
                    <InfoRow label="Vozidlo" value={profile ? `${profile.make} ${profile.model}` : "—"} />
                    <InfoRow label="Generace" value={profile?.generation || "—"} />
                    <InfoRow label="Rok" value={year || "—"} />
                    <InfoRow label="Motor" value={profile ? `${profile.engine} (${profile.engineCode})` : "—"} />
                    <InfoRow label="ECU" value={selectedEcu?.common || selectedEcu?.name || "Všechny"} />
                    <InfoRow label="TX adresa" value={selectedEcu ? normalizeAddress(selectedEcu.address) : "—"} />
                    <InfoRow label="Katalog" value={brand?.file || "—"} />
                  </div>
                )}
              </div>

              {(openPanel === "live" ||
                openPanel === "actuators" ||
                openPanel === "service") && (
                <div className="space-y-3 border-t border-slate-300 bg-slate-50 p-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder={`Hledat v sekci ${panelTitles[openPanel]}…`}
                      className="border-slate-400 bg-white pl-9 text-slate-950"
                    />
                  </div>

                  {(openPanel === "actuators" || openPanel === "service") && (
                    <div className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-xs text-amber-900">
                      <div className="flex items-start gap-2">
                        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                        <p>
                          Všechny katalogové funkce jsou viditelné a spustitelné.
                          Neověřená funkce před spuštěním zobrazí varování.
                        </p>
                      </div>
                    </div>
                  )}

                  {loadingCatalog ? (
                    <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-600">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Načítám katalog…
                    </div>
                  ) : functionGroups.length === 0 ? (
                    <p className="rounded-lg border border-slate-300 bg-white p-5 text-center text-sm text-slate-600">
                      Pro tento výběr nejsou v katalogu žádné položky.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {functionGroups.map(([groupName, groupFunctions]) => (
                        <details
                          key={groupName}
                          className="overflow-hidden rounded-lg border border-slate-400 bg-white"
                        >
                          <summary className="flex cursor-pointer list-none items-center gap-3 bg-slate-100 px-3 py-3">
                            <ClipboardList className="h-4 w-4 text-blue-700" />
                            <span className="min-w-0 flex-1 truncate font-bold text-slate-950">
                              {groupName}
                            </span>
                            <Badge variant="outline" className="border-slate-400 text-slate-700">
                              {groupFunctions.length}
                            </Badge>
                            <ChevronDown className="h-4 w-4 text-slate-600" />
                          </summary>

                          <div className="divide-y divide-slate-200 border-t border-slate-300">
                            {groupFunctions.map((fn) => (
                              <button
                                type="button"
                                key={fn.id}
                                onClick={() => {
                                  setSelected(fn);
                                  setResult(null);
                                }}
                                className={`flex w-full items-start gap-3 px-3 py-3 text-left ${
                                  selected?.id === fn.id
                                    ? "bg-blue-50"
                                    : "bg-white hover:bg-slate-50"
                                }`}
                              >
                                <Cpu className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" />
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="font-bold text-slate-950">{fn.name}</p>
                                    {isWriteFunction(fn) && (
                                      <Badge
                                        variant="outline"
                                        className="border-amber-400 text-[10px] text-amber-800"
                                      >
                                        ODBORNÝ REŽIM
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="mt-1 text-xs text-slate-600">
                                    {fn.description || fn.category || "Diagnostická funkce"}
                                  </p>
                                </div>
                                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-500" />
                              </button>
                            ))}
                          </div>
                        </details>
                      ))}
                    </div>
                  )}

                  {selected && (
                    <div className="overflow-hidden rounded-xl border border-slate-500 bg-white">
                      <div className="border-b border-slate-400 bg-slate-200 px-4 py-3">
                        <p className="text-xs font-bold uppercase text-slate-500">
                          Vybraná funkce
                        </p>
                        <h3 className="mt-1 text-lg font-black text-slate-950">
                          {selected.name}
                        </h3>
                      </div>

                      <div className="space-y-3 p-4 text-slate-950">
                        <div>
                          <p className="text-xs font-bold uppercase text-slate-500">Popis</p>
                          <p className="mt-1 text-sm">
                            {selected.description || "K funkci není v katalogu další popis."}
                          </p>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2">
                          <InfoRow
                            label="Cílová ECU"
                            value={selected.ecuCommonName || selected.ecu || selectedEcu?.common || selectedEcu?.name || "—"}
                          />
                          <InfoRow
                            label="Adresa"
                            value={normalizeAddress(selected.ecuAddress || selectedEcu?.address) || "—"}
                          />
                          <InfoRow label="Kategorie" value={selected.category || "—"} />
                          <InfoRow label="Příkaz" value={selected.command || "—"} mono />
                        </div>

                        {isWriteFunction(selected) && (
                          <div className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
                            <p className="font-bold">Podmínky před spuštěním</p>
                            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                              <li>Zkontroluj správně vybranou řídicí jednotku.</li>
                              <li>Zapalování a motor nastav podle požadavků funkce.</li>
                              <li>Zajisti stabilní napětí baterie.</li>
                              <li>Neodpojuj adaptér během provádění.</li>
                            </ul>
                          </div>
                        )}

                        {selected.safetyWarning && (
                          <div className="rounded-lg border border-red-400 bg-red-50 p-3 text-sm text-red-900">
                            {selected.safetyWarning}
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            variant="outline"
                            onClick={() => {
                              setSelected(null);
                              setResult(null);
                            }}
                            className="border-slate-500"
                          >
                            Zrušit
                          </Button>
                          <Button
                            onClick={runSelected}
                            disabled={running || bleState !== "connected"}
                            className="bg-blue-700 hover:bg-blue-600"
                          >
                            {running ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Play className="mr-2 h-4 w-4" />
                            )}
                            {running ? "Provádím…" : "Start"}
                          </Button>
                        </div>

                        {bleState !== "connected" && (
                          <p className="text-center text-xs font-bold text-red-700">
                            Nejdřív připoj OBD adaptér.
                          </p>
                        )}

                        {result && (
                          <div className="space-y-3 rounded-xl border border-slate-400 bg-slate-50 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-black">Výsledek</p>
                              <Badge variant="outline" className={statusClass(result.status)}>
                                {result.status.toUpperCase()}
                              </Badge>
                            </div>

                            {result.decoded.length > 0 && (
                              <div className="space-y-1.5">
                                {result.decoded.map((value, index) => (
                                  <div
                                    key={`${value.name}-${index}`}
                                    className="flex items-center justify-between gap-3 rounded border border-slate-300 bg-white p-2 text-sm"
                                  >
                                    <span className="text-slate-600">{value.name}</span>
                                    <strong>
                                      {String(value.value ?? "—")} {value.unit || ""}
                                    </strong>
                                  </div>
                                ))}
                              </div>
                            )}

                            {result.nrc && (
                              <div className="rounded border border-orange-400 bg-orange-50 p-3 text-sm text-orange-900">
                                <p className="font-bold">
                                  NRC {result.nrc.code}: {result.nrc.description || "Negativní odpověď ECU"}
                                </p>
                              </div>
                            )}

                            {result.error && (
                              <div className="rounded border border-red-400 bg-red-50 p-3 text-sm text-red-900">
                                {result.error}
                              </div>
                            )}

                            <Tabs defaultValue="summary">
                              <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="summary">Souhrn</TabsTrigger>
                                <TabsTrigger value="technical">Technické</TabsTrigger>
                              </TabsList>
                              <TabsContent value="summary" className="space-y-1 text-sm">
                                <p>Doba odezvy: {result.durationMs} ms</p>
                                <p>Stav: {result.status}</p>
                              </TabsContent>
                              <TabsContent value="technical" className="space-y-2 text-xs">
                                <p className="break-all">
                                  <strong>Příkaz:</strong> {result.command}
                                </p>
                                <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-950 p-3 text-slate-100">
                                  {result.rawResponse || "Bez odpovědi"}
                                </pre>
                              </TabsContent>
                            </Tabs>

                            <Button
                              variant="outline"
                              className="w-full border-slate-500"
                              onClick={() => setResult(null)}
                            >
                              OK
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function FunctionPanelHeader({
  panel,
  openPanel,
  title,
  description,
  icon,
  onToggle,
}: {
  panel: PanelKey;
  openPanel: PanelKey | null;
  title: string;
  description: string;
  icon: React.ReactNode;
  onToggle: (panel: PanelKey) => void;
}) {
  const open = panel === openPanel;
  return (
    <button
      type="button"
      onClick={() => onToggle(panel)}
      className="flex w-full items-center gap-3 px-3 py-4 text-left hover:bg-slate-100"
    >
      {icon}
      <div className="min-w-0 flex-1">
        <p className="font-bold text-slate-950">{title}</p>
        <p className="text-xs text-slate-600">{description}</p>
      </div>
      {open ? (
        <ChevronDown className="h-5 w-5 text-slate-600" />
      ) : (
        <ChevronRight className="h-5 w-5 text-slate-600" />
      )}
    </button>
  );
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded border border-slate-300 bg-white p-2">
      <p className="text-[10px] font-bold uppercase text-slate-500">{label}</p>
      <p className={`mt-0.5 break-words text-sm text-slate-950 ${mono ? "font-mono" : ""}`}>
        {value}
      </p>
    </div>
  );
}
