import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bluetooth,
  Car,
  ChevronRight,
  CircleDot,
  ClipboardList,
  Cpu,
  FileCode2,
  Gauge,
  Info,
  Play,
  Search,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  uniqueSorted,
  VEHICLE_PROFILES,
} from "@/lib/delphi";
import type {
  ActiveDiagContext,
  BrandManifestEntry,
  DiagFunction,
  DiagRunResult,
  FunctionKind,
  VehicleProfile,
} from "@/lib/delphi";

type EcuOption = { address: string; name: string; common?: string };
type MainSection = "information" | "faults" | "live" | "tests" | "service";

const sectionKinds: Record<Exclude<MainSection, "information">, FunctionKind[]> = {
  faults: ["dtc_scan"],
  live: ["live_pid", "obd2_pid", "did"],
  tests: ["actuator_test"],
  service: ["routine"],
};

const sectionLabel: Record<MainSection, string> = {
  information: "Informace",
  faults: "Chybové kódy",
  live: "Živá data",
  tests: "Testy akčních členů",
  service: "Servisní funkce",
};

function normalizeText(value?: string) {
  return (value || "").toLocaleLowerCase("cs");
}

function ecuMatchesProfile(ecu: EcuOption, profile: VehicleProfile) {
  const text = normalizeText(`${ecu.name} ${ecu.common || ""}`);
  return profile.ecuHints.some((hint) => text.includes(normalizeText(hint)));
}

function statusClass(status?: string) {
  if (status === "ok") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-400";
  if (status === "pending") return "border-amber-500/40 bg-amber-500/10 text-amber-300";
  return "border-red-500/40 bg-red-500/10 text-red-300";
}

function isWriteFunction(fn: DiagFunction) {
  return fn.kind === "routine" || fn.kind === "actuator_test" || Boolean(fn.destructive);
}

export default function AdminDelphi() {
  const [brands, setBrands] = useState<BrandManifestEntry[]>([]);
  const [brandKey, setBrandKey] = useState("OBD2");
  const [vin, setVin] = useState("");
  const [functions, setFunctions] = useState<DiagFunction[]>([]);
  const [ecus, setEcus] = useState<EcuOption[]>([]);
  const [ecuAddress, setEcuAddress] = useState("__all");
  const [section, setSection] = useState<MainSection>("information");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<DiagFunction | null>(null);
  const [result, setResult] = useState<DiagRunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [bleState, setBleState] = useState(bleManager.getState());

  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [generation, setGeneration] = useState("");
  const [year, setYear] = useState("");
  const [profileId, setProfileId] = useState("");

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
          map.set(ecu.address, {
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

  // Pouze značky, které mají skutečné profily ve stromu.
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
    () => filteredEcus.find((item) => item.address === ecuAddress),
    [filteredEcus, ecuAddress],
  );

  const context: ActiveDiagContext | null = useMemo(() => {
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

  // Všechny katalogové funkce jsou viditelné. Neověřené se pouze označí varováním.
  const visibleFunctions = useMemo(() => {
    if (section === "information") return [];
    const kinds = sectionKinds[section];
    const query = search.trim().toLocaleLowerCase("cs");

    return functions.filter((fn) => {
      if (!kinds.includes(fn.kind)) return false;

      if (
        ecuAddress !== "__all" &&
        fn.ecuAddress &&
        fn.ecuAddress !== ecuAddress &&
        fn.kind !== "dtc_scan"
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
  }, [functions, section, search, ecuAddress]);

  const counts = useMemo(
    () => ({
      faults: functions.filter((item) => item.kind === "dtc_scan").length,
      live: functions.filter((item) =>
        ["live_pid", "obd2_pid", "did"].includes(item.kind),
      ).length,
      tests: functions.filter((item) => item.kind === "actuator_test").length,
      service: functions.filter((item) => item.kind === "routine").length,
    }),
    [functions],
  );

  function clearBelow(level: "make" | "model" | "generation" | "year") {
    if (level === "make") {
      setModel("");
      setGeneration("");
      setYear("");
      setProfileId("");
    }
    if (level === "model") {
      setGeneration("");
      setYear("");
      setProfileId("");
    }
    if (level === "generation") {
      setYear("");
      setProfileId("");
    }
    if (level === "year") {
      setProfileId("");
    }
    setEcuAddress("__all");
    setSelected(null);
    setResult(null);
  }

  async function decodeVin() {
    const found = await findBrandForVin(vin);
    if (!found) {
      toast({
        title: "VIN nebyl rozpoznán",
        description: "Vyber vozidlo ručně ve stromu Delphi.",
        variant: "destructive",
      });
      return;
    }

    setBrandKey(found.key);
    toast({
      title: "Výrobce rozpoznán",
      description: `${found.display_name}. Model, rok a motor vyber ve stromu.`,
    });
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
          "Funkce může být pouze kandidátní pro zvolenou variantu ECU.",
          "Před spuštěním zkontroluj cílovou ECU, zapalování, napětí, diagnostickou relaci a požadované podmínky.",
          "",
          "Opravdu funkci spustit?",
        ].join("\n")
      : selected.destructive
        ? `Pozor: ${selected.safetyWarning || "Tato funkce může měnit stav vozidla."}\n\nOpravdu pokračovat?`
        : null;

    if (warning && !window.confirm(warning)) return;

    setRunning(true);
    try {
      const output = await runDiagFunction(selected, {
        activeContext: context,
        vin: vin || null,
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

  const tabs = [
    { key: "information" as const, label: "Informace", icon: Info },
    { key: "faults" as const, label: "Chyby", icon: AlertTriangle, count: counts.faults },
    { key: "live" as const, label: "Živá data", icon: Gauge, count: counts.live },
    { key: "tests" as const, label: "Akční testy", icon: Activity, count: counts.tests },
    { key: "service" as const, label: "Servisní funkce", icon: Wrench, count: counts.service },
  ];

  return (
    <div className="min-w-0 space-y-3">
      <div className="rounded-lg border border-slate-600 bg-gradient-to-b from-slate-800 to-slate-950 px-4 py-3 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
              Samostatná diagnostika
            </p>
            <h1 className="text-xl font-bold text-slate-100">Delphi Diagnostic</h1>
          </div>
          <Badge
            variant="outline"
            className={
              bleState === "connected"
                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                : "border-red-500/50 bg-red-500/10 text-red-300"
            }
          >
            <Bluetooth className="mr-1 h-3.5 w-3.5" />
            {bleState === "connected" ? "OBD připojeno" : "OBD odpojeno"}
          </Badge>
        </div>
      </div>

      <div className="grid min-w-0 gap-3 xl:grid-cols-[340px_minmax(0,1fr)]">
        {/* Levý Delphi strom */}
        <Card className="h-fit min-w-0 overflow-hidden border-slate-700 bg-slate-950/70">
          <CardHeader className="border-b border-slate-700 bg-slate-900 px-3 py-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Car className="h-4 w-4 text-cyan-400" />
              Výběr vozidla
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-3">
            <div className="grid gap-2 sm:grid-cols-[1fr_auto] xl:grid-cols-1">
              <div>
                <Label className="text-xs">VIN</Label>
                <Input
                  value={vin}
                  maxLength={17}
                  onChange={(event) => setVin(event.target.value.toUpperCase())}
                  placeholder="17 znaků VIN"
                  className="mt-1 h-9 font-mono text-xs"
                />
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={decodeVin}
                disabled={vin.length < 3}
                className="self-end"
              >
                Identifikovat
              </Button>
            </div>

            <div className="space-y-2">
              <div>
                <Label className="text-xs">1. Výrobce</Label>
                <Select
                  value={make}
                  onValueChange={(value) => {
                    setMake(value);
                    clearBelow("make");
                  }}
                >
                  <SelectTrigger className="mt-1 h-9">
                    <SelectValue placeholder="Vyber výrobce" />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    {makes.map((value) => (
                      <SelectItem key={value} value={value}>{value}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">2. Model</Label>
                <Select
                  value={model}
                  onValueChange={(value) => {
                    setModel(value);
                    clearBelow("model");
                  }}
                  disabled={!make}
                >
                  <SelectTrigger className="mt-1 h-9">
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
                <Label className="text-xs">3. Generace / platforma</Label>
                <Select
                  value={generation}
                  onValueChange={(value) => {
                    setGeneration(value);
                    clearBelow("generation");
                  }}
                  disabled={!model}
                >
                  <SelectTrigger className="mt-1 h-9">
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
                <Label className="text-xs">4. Modelový rok</Label>
                <Select
                  value={year}
                  onValueChange={(value) => {
                    setYear(value);
                    clearBelow("year");
                  }}
                  disabled={!generation}
                >
                  <SelectTrigger className="mt-1 h-9">
                    <SelectValue placeholder="Vyber rok" />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    {years.map((value) => (
                      <SelectItem key={value} value={String(value)}>{value}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">5. Motor</Label>
                <Select
                  value={profileId}
                  onValueChange={(value) => {
                    setProfileId(value);
                    setEcuAddress("__all");
                    setSelected(null);
                    setResult(null);
                  }}
                  disabled={!year}
                >
                  <SelectTrigger className="mt-1 h-9">
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

            <div className="border-t border-slate-700 pt-3">
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-300">
                <Cpu className="h-4 w-4 text-cyan-400" />
                Systém / řídicí jednotka
              </p>
              <Select
                value={ecuAddress}
                onValueChange={(value) => {
                  setEcuAddress(value);
                  setSelected(null);
                  setResult(null);
                }}
                disabled={!profile || loadingCatalog}
              >
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Vyber systém" />
                </SelectTrigger>
                <SelectContent className="max-h-96">
                  <SelectItem value="__all">Všechny systémy</SelectItem>
                  {filteredEcus.map((ecu) => (
                    <SelectItem key={ecu.address} value={ecu.address}>
                      {ecu.common || ecu.name} [{ecu.address}]
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-md border border-slate-700 bg-slate-900/80 p-3 text-xs">
              <div className="flex items-start gap-2">
                <CircleDot className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
                <div className="min-w-0">
                  <p className="font-semibold text-slate-200">
                    {profile
                      ? `${profile.make} ${profile.model} ${profile.generation}`
                      : "Vozidlo není vybrané"}
                  </p>
                  <p className="truncate text-slate-400">
                    {profile
                      ? `${year} · ${profile.engine} · ${profile.engineCode}`
                      : "Postupuj stromem shora dolů"}
                  </p>
                  <p className="mt-1 truncate text-slate-400">
                    {selectedEcu?.common || selectedEcu?.name || "ECU není vybraná"}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pravá servisní plocha */}
        <Card className="min-w-0 overflow-hidden border-slate-700 bg-slate-950/40">
          <div className="border-b border-slate-700 bg-slate-900 p-2">
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-5">
              {tabs.map((item) => {
                const Icon = item.icon;
                const active = section === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => {
                      setSection(item.key);
                      setSelected(null);
                      setResult(null);
                    }}
                    className={`flex min-w-0 items-center justify-center gap-1.5 rounded px-2 py-2 text-xs transition ${
                      active
                        ? "bg-cyan-700 text-white shadow-inner"
                        : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                    {typeof item.count === "number" && (
                      <span className="rounded bg-black/30 px-1 text-[10px]">
                        {item.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <CardContent className="min-w-0 p-3 sm:p-4">
            {section === "information" ? (
              <div className="space-y-4">
                <div className="rounded-md border border-cyan-800/50 bg-cyan-950/20 p-4">
                  <h2 className="flex items-center gap-2 text-lg font-semibold">
                    <Info className="h-5 w-5 text-cyan-400" />
                    Informace o diagnostice
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Vyber vozidlo a řídicí systém v levém stromu. Delphi načte
                    diagnostické funkce z katalogu zvoleného výrobce.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {tabs.slice(1).map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.key}
                        onClick={() => setSection(item.key)}
                        className="rounded-md border border-slate-700 bg-slate-900/70 p-4 text-left transition hover:border-cyan-700 hover:bg-slate-800"
                      >
                        <Icon className="mb-3 h-6 w-6 text-cyan-400" />
                        <p className="font-semibold">{item.label}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Dostupných položek: {item.count}
                        </p>
                      </button>
                    );
                  })}
                </div>

                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
                  <div className="flex items-center gap-2 font-semibold text-amber-300">
                    <ShieldAlert className="h-4 w-4" />
                    Odborný režim – všechny katalogové funkce povoleny
                  </div>
                  <p className="mt-1 text-amber-200/80">
                    Neověřené rutiny, adaptace a akční testy nejsou skryté ani
                    blokované. Před jejich spuštěním se zobrazí výrazné varování.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold">{sectionLabel[section]}</h2>
                    <p className="truncate text-xs text-muted-foreground">
                      {selectedEcu?.common ||
                        selectedEcu?.name ||
                        "Všechny systémy z katalogu"}
                    </p>
                  </div>
                  <div className="relative w-full sm:w-72">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Hledat v Delphi katalogu…"
                      className="h-9 pl-9"
                    />
                  </div>
                </div>

                {(section === "tests" || section === "service") && (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                    Všechny nalezené funkce jsou dostupné. Kandidátní nebo
                    neověřená funkce zobrazí varování, ale zůstane spustitelná.
                  </div>
                )}

                {loadingCatalog ? (
                  <p className="py-12 text-center text-muted-foreground">
                    Načítám Delphi katalog…
                  </p>
                ) : (
                  <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
                    <div className="max-h-[650px] min-w-0 space-y-1.5 overflow-y-auto pr-1">
                      {visibleFunctions.length === 0 && (
                        <p className="rounded-md border border-slate-700 p-8 text-center text-sm text-muted-foreground">
                          Pro tento výběr nejsou v katalogu žádné položky.
                        </p>
                      )}

                      {visibleFunctions.map((fn) => (
                        <button
                          key={fn.id}
                          onClick={() => {
                            setSelected(fn);
                            setResult(null);
                          }}
                          className={`w-full min-w-0 rounded-md border p-3 text-left transition ${
                            selected?.id === fn.id
                              ? "border-cyan-600 bg-cyan-950/40"
                              : "border-slate-700 bg-slate-900/60 hover:border-slate-500 hover:bg-slate-800"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="break-words text-sm font-semibold">{fn.name}</p>
                                {isWriteFunction(fn) && (
                                  <Badge
                                    variant="outline"
                                    className="border-amber-500/50 text-[10px] text-amber-300"
                                  >
                                    ODBORNÝ REŽIM
                                  </Badge>
                                )}
                                {fn.destructive && (
                                  <Badge variant="destructive" className="text-[10px]">
                                    ZÁSAH
                                  </Badge>
                                )}
                              </div>
                              <p className="mt-1 break-words text-xs text-muted-foreground">
                                {fn.description || fn.category || "Diagnostická funkce"}
                              </p>
                              <p className="mt-1 truncate text-[11px] text-slate-500">
                                {fn.ecuCommonName || fn.ecu || "Obecná OBD-II funkce"}
                              </p>
                            </div>
                            <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-500" />
                          </div>
                        </button>
                      ))}
                    </div>

                    <div className="min-w-0 rounded-md border border-slate-700 bg-slate-900/70 p-4">
                      {!selected ? (
                        <div className="py-12 text-center text-sm text-muted-foreground">
                          Vyber funkci ze seznamu.
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-slate-500">
                              Vybraná funkce
                            </p>
                            <h3 className="mt-1 break-words text-lg font-semibold">
                              {selected.name}
                            </h3>
                            <p className="mt-1 break-words text-sm text-muted-foreground">
                              {selected.description || "Bez dalšího popisu."}
                            </p>
                          </div>

                          {isWriteFunction(selected) && (
                            <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-xs text-amber-200">
                              <p className="font-semibold">Funkce je povolena v odborném režimu</p>
                              <p className="mt-1">
                                Nemusí být ověřena pro konkrétní SW variantu ECU.
                                Před odesláním zkontroluj cílovou jednotku a podmínky.
                              </p>
                            </div>
                          )}

                          {selected.safetyWarning && (
                            <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
                              {selected.safetyWarning}
                            </div>
                          )}

                          <Button
                            className="w-full bg-cyan-700 hover:bg-cyan-600"
                            onClick={runSelected}
                            disabled={running || bleState !== "connected"}
                          >
                            <Play className="mr-2 h-4 w-4" />
                            {running ? "Provádím…" : "Spustit funkci"}
                          </Button>

                          {bleState !== "connected" && (
                            <p className="text-center text-xs text-red-400">
                              Nejdřív připoj OBD adaptér.
                            </p>
                          )}

                          {result && (
                            <div className="space-y-3 border-t border-slate-700 pt-4">
                              <Badge variant="outline" className={statusClass(result.status)}>
                                {result.status.toUpperCase()}
                              </Badge>

                              {result.decoded.length > 0 && (
                                <div className="space-y-1.5">
                                  {result.decoded.map((value, index) => (
                                    <div
                                      key={`${value.name}-${index}`}
                                      className="flex min-w-0 items-center justify-between gap-3 rounded bg-slate-950/70 p-2.5 text-xs"
                                    >
                                      <span className="min-w-0 break-words text-slate-400">
                                        {value.name}
                                      </span>
                                      <strong className="shrink-0 text-right">
                                        {String(value.value ?? "—")} {value.unit || ""}
                                      </strong>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {result.error && (
                                <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
                                  {result.error}
                                </div>
                              )}

                              <Tabs defaultValue="result">
                                <TabsList className="grid w-full grid-cols-2">
                                  <TabsTrigger value="result">Výsledek</TabsTrigger>
                                  <TabsTrigger value="technical">Technické</TabsTrigger>
                                </TabsList>
                                <TabsContent value="result" className="text-xs text-muted-foreground">
                                  Doba odezvy: {result.durationMs} ms
                                </TabsContent>
                                <TabsContent value="technical" className="min-w-0 space-y-2 text-xs">
                                  <p className="break-all">
                                    <span className="text-muted-foreground">Příkaz:</span>{" "}
                                    <code>{result.command}</code>
                                  </p>
                                  <pre className="max-h-48 max-w-full overflow-auto whitespace-pre-wrap break-all rounded bg-black/50 p-3">
                                    {result.rawResponse || "Bez odpovědi"}
                                  </pre>
                                </TabsContent>
                              </Tabs>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
