import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bluetooth,
  Car,
  ChevronRight,
  ClipboardList,
  Gauge,
  Play,
  Search,
  Settings2,
  ShieldCheck,
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
  COMMON_VEHICLE_MAKES,
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
type MainSection = "overview" | "faults" | "live" | "tests" | "service";

const sectionKinds: Record<Exclude<MainSection, "overview">, FunctionKind[]> = {
  faults: ["dtc_scan"],
  live: ["live_pid", "obd2_pid", "did"],
  tests: ["actuator_test"],
  service: ["routine"],
};

const sectionLabel: Record<MainSection, string> = {
  overview: "Přehled",
  faults: "Chybové kódy",
  live: "Živá data",
  tests: "Testy akčních členů",
  service: "Servisní funkce",
};

function statusClass(status?: string) {
  if (status === "ok") return "border-green-500/40 bg-green-500/10 text-green-400";
  if (status === "pending") return "border-amber-500/40 bg-amber-500/10 text-amber-400";
  return "border-red-500/40 bg-red-500/10 text-red-400";
}

function normalizeText(value?: string) {
  return (value || "").toLocaleLowerCase("cs");
}

function ecuMatchesProfile(ecu: EcuOption, profile: VehicleProfile) {
  const text = normalizeText(`${ecu.name} ${ecu.common || ""}`);
  return profile.ecuHints.some((hint) => text.includes(normalizeText(hint)));
}

export default function AdminDelphiDiag() {
  const [brands, setBrands] = useState<BrandManifestEntry[]>([]);
  const [brandKey, setBrandKey] = useState("OBD2");
  const [vin, setVin] = useState("");
  const [functions, setFunctions] = useState<DiagFunction[]>([]);
  const [ecus, setEcus] = useState<EcuOption[]>([]);
  const [ecuAddress, setEcuAddress] = useState("__all");
  const [section, setSection] = useState<MainSection>("overview");
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
          title: "Katalog se nepodařilo načíst",
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
        setSection("overview");
      })
      .catch((error) =>
        toast({ title: "Chyba katalogu", description: String(error), variant: "destructive" }),
      )
      .finally(() => {
        if (!cancelled) setLoadingCatalog(false);
      });

    return () => {
      cancelled = true;
    };
  }, [brandKey]);

  const makes = useMemo(
    () => uniqueSorted([...COMMON_VEHICLE_MAKES, ...VEHICLE_PROFILES.map((item) => item.make)]),
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
    const list = new Set<number>();
    VEHICLE_PROFILES.filter(
      (item) =>
        item.make === make &&
        item.model === model &&
        item.generation === generation,
    ).forEach((item) => {
      for (let value = item.yearFrom; value <= item.yearTo; value += 1) list.add(value);
    });
    return [...list].sort((a, b) => b - a);
  }, [make, model, generation]);

  const matchingProfiles = useMemo(
    () =>
      VEHICLE_PROFILES.filter((item) => {
        const selectedYear = Number(year);
        return (
          item.make === make &&
          item.model === model &&
          item.generation === generation &&
          (!selectedYear || (selectedYear >= item.yearFrom && selectedYear <= item.yearTo))
        );
      }),
    [make, model, generation, year],
  );

  const profile = useMemo(
    () => VEHICLE_PROFILES.find((item) => item.id === profileId) || null,
    [profileId],
  );

  useEffect(() => {
    if (!profile) return;
    if (profile.brandKey !== brandKey) setBrandKey(profile.brandKey);
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

  const exactVehicleSelected = Boolean(profile && year);
  const exactEcuSelected = ecuAddress !== "__all" && Boolean(selectedEcu);
  const serviceUnlocked = exactVehicleSelected && exactEcuSelected;
  const verifiedRoutineIds = profile?.verifiedRoutineIds || [];

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

  const visibleFunctions = useMemo(() => {
    if (section === "overview") return [];
    const kinds = sectionKinds[section];
    const query = search.trim().toLowerCase();

    return functions.filter((fn) => {
      if (!kinds.includes(fn.kind)) return false;
      if (ecuAddress !== "__all" && fn.ecuAddress !== ecuAddress && fn.kind !== "dtc_scan") {
        return false;
      }
      if ((fn.kind === "routine" || fn.kind === "actuator_test") && !serviceUnlocked) {
        return false;
      }
      if (
        (fn.kind === "routine" || fn.kind === "actuator_test") &&
        !verifiedRoutineIds.includes((fn.routineId || "").toUpperCase())
      ) {
        return false;
      }
      if (!query) return true;
      return [fn.name, fn.description, fn.category, fn.ecuCommonName, fn.ecu]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [functions, section, search, ecuAddress, serviceUnlocked, verifiedRoutineIds]);

  const counts = useMemo(
    () => ({
      faults: functions.filter((item) => item.kind === "dtc_scan").length,
      live: functions.filter((item) => ["live_pid", "obd2_pid", "did"].includes(item.kind)).length,
      tests: serviceUnlocked
        ? functions.filter(
            (item) =>
              item.kind === "actuator_test" &&
              verifiedRoutineIds.includes((item.routineId || "").toUpperCase()),
          ).length
        : 0,
      service: serviceUnlocked
        ? functions.filter(
            (item) =>
              item.kind === "routine" &&
              verifiedRoutineIds.includes((item.routineId || "").toUpperCase()),
          ).length
        : 0,
    }),
    [functions, serviceUnlocked, verifiedRoutineIds],
  );

  function resetAfterMake(value: string) {
    setMake(value);
    setModel("");
    setGeneration("");
    setYear("");
    setProfileId("");
    setEcuAddress("__all");
  }

  function resetAfterModel(value: string) {
    setModel(value);
    setGeneration("");
    setYear("");
    setProfileId("");
    setEcuAddress("__all");
  }

  function resetAfterGeneration(value: string) {
    setGeneration(value);
    setYear("");
    setProfileId("");
    setEcuAddress("__all");
  }

  async function decodeVin() {
    const found = await findBrandForVin(vin);
    if (!found) {
      toast({ title: "VIN nerozpoznán", description: "Vyber vozidlo ručně.", variant: "destructive" });
      return;
    }
    setBrandKey(found.key);
    toast({
      title: "Výrobce rozpoznán",
      description: "VIN určil výrobce. Model a motor je ještě nutné vybrat přesně.",
    });
  }

  async function runSelected() {
    if (!selected) return;

    if ((selected.kind === "routine" || selected.kind === "actuator_test") && !serviceUnlocked) {
      toast({
        title: "Není vybrané přesné vozidlo",
        description: "Vyber značku, model, generaci, rok, motor a konkrétní řídicí jednotku.",
        variant: "destructive",
      });
      return;
    }

    if (
      (selected.kind === "routine" || selected.kind === "actuator_test") &&
      !verifiedRoutineIds.includes((selected.routineId || "").toUpperCase())
    ) {
      toast({
        title: "Neověřená servisní rutina",
        description: "Tato rutina není pro zvolený motor ověřená a aplikace ji z bezpečnostních důvodů neodešle.",
        variant: "destructive",
      });
      return;
    }

    if (selected.destructive) {
      const ok = window.confirm(
        `Pozor: ${selected.safetyWarning || "Tato funkce může měnit stav vozidla."}\n\nOpravdu pokračovat?`,
      );
      if (!ok) return;
    }

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

  const menu = [
    { key: "overview" as const, label: "Přehled jednotky", icon: Car },
    { key: "faults" as const, label: "Chybové kódy", icon: AlertTriangle, count: counts.faults },
    { key: "live" as const, label: "Živá data", icon: Gauge, count: counts.live },
    { key: "tests" as const, label: "Testy akčních členů", icon: Activity, count: counts.tests },
    { key: "service" as const, label: "Servisní funkce", icon: Wrench, count: counts.service },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Diagnostika vozidla</p>
          <h1 className="text-2xl font-bold">Servisní diagnostika</h1>
        </div>
        <Badge
          variant="outline"
          className={
            bleState === "connected"
              ? "border-green-500/40 text-green-400"
              : "border-red-500/40 text-red-400"
          }
        >
          <Bluetooth className="mr-1 h-3.5 w-3.5" />
          {bleState === "connected" ? "Adaptér připojen" : "Adaptér odpojen"}
        </Badge>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <Label>VIN vozidla</Label>
              <Input
                value={vin}
                maxLength={17}
                onChange={(event) => setVin(event.target.value.toUpperCase())}
                placeholder="17 znaků VIN"
                className="mt-1 font-mono"
              />
            </div>
            <Button onClick={decodeVin} disabled={vin.length < 3}>Rozpoznat VIN</Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
            <div>
              <Label>Značka</Label>
              <Select value={make} onValueChange={resetAfterMake}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Vyber značku" /></SelectTrigger>
                <SelectContent>{makes.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Model</Label>
              <Select value={model} onValueChange={resetAfterModel} disabled={!make}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Vyber model" /></SelectTrigger>
                <SelectContent>{models.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Generace</Label>
              <Select value={generation} onValueChange={resetAfterGeneration} disabled={!model}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Vyber generaci" /></SelectTrigger>
                <SelectContent>{generations.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Rok</Label>
              <Select
                value={year}
                onValueChange={(value) => {
                  setYear(value);
                  setProfileId("");
                  setEcuAddress("__all");
                }}
                disabled={!generation}
              >
                <SelectTrigger className="mt-1"><SelectValue placeholder="Vyber rok" /></SelectTrigger>
                <SelectContent>{years.map((value) => <SelectItem key={value} value={String(value)}>{value}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Motor</Label>
              <Select
                value={profileId}
                onValueChange={(value) => {
                  setProfileId(value);
                  setEcuAddress("__all");
                }}
                disabled={!year}
              >
                <SelectTrigger className="mt-1"><SelectValue placeholder="Vyber motor" /></SelectTrigger>
                <SelectContent>
                  {matchingProfiles.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.engine} ({item.engineCode})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Řídicí jednotka</Label>
              <Select
                value={ecuAddress}
                onValueChange={(value) => {
                  setEcuAddress(value);
                  setSelected(null);
                  setResult(null);
                }}
                disabled={!profile || loadingCatalog}
              >
                <SelectTrigger className="mt-1"><SelectValue placeholder="Vyber ECU" /></SelectTrigger>
                <SelectContent className="max-h-[380px]">
                  <SelectItem value="__all">Všechny jednotky</SelectItem>
                  {filteredEcus.map((ecu) => (
                    <SelectItem key={ecu.address} value={ecu.address}>
                      {ecu.common || ecu.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[290px_1fr]">
        <Card className="h-fit">
          <CardContent className="p-2">
            <div className="mb-2 rounded-lg bg-secondary/40 p-3">
              <p className="text-xs text-muted-foreground">Aktivní vozidlo</p>
              <p className="font-semibold">
                {profile ? `${profile.make} ${profile.model} ${profile.generation}` : "Vozidlo není vybrané"}
              </p>
              <p className="text-sm text-muted-foreground">
                {profile ? `${year} · ${profile.engine} · ${profile.engineCode}` : "Vyber značku, model, rok a motor"}
              </p>
              <p className="text-sm text-muted-foreground">
                {selectedEcu?.common || selectedEcu?.name || "ECU není vybraná"}
              </p>
            </div>

            <nav className="space-y-1">
              {menu.map((item) => {
                const Icon = item.icon;
                const active = item.key === section;
                return (
                  <button
                    key={item.key}
                    onClick={() => {
                      setSection(item.key);
                      setSelected(null);
                      setResult(null);
                    }}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm transition ${
                      active ? "bg-primary text-primary-foreground" : "hover:bg-secondary/70"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="flex-1">{item.label}</span>
                    {typeof item.count === "number" && <span className="text-xs opacity-70">{item.count}</span>}
                    <ChevronRight className="h-4 w-4 opacity-60" />
                  </button>
                );
              })}
            </nav>

            <div className="mt-3 border-t pt-3">
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                <Settings2 className="h-4 w-4" /> RAW/PID/DID jsou schované z běžného pohledu
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            {section === "overview" ? (
              <div className="space-y-4">
                <div>
                  <h2 className="text-xl font-semibold">Přehled diagnostiky</h2>
                  <p className="text-sm text-muted-foreground">Nejdřív vyber přesné vozidlo a řídicí jednotku.</p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {menu.slice(1).map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.key}
                        onClick={() => setSection(item.key)}
                        className="rounded-xl border p-4 text-left transition hover:bg-secondary/50"
                      >
                        <Icon className="mb-3 h-6 w-6" />
                        <p className="font-semibold">{item.label}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Dostupných funkcí: {item.count}</p>
                      </button>
                    );
                  })}
                </div>

                <div className="rounded-xl border bg-secondary/20 p-4 text-sm">
                  <div className="flex items-center gap-2 font-semibold">
                    <ShieldCheck className="h-4 w-4" /> Bezpečný servisní režim
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    Neověřené servisní rutiny se nezobrazují. Tím se zabrání odesílání náhodných RoutineControl příkazů do nesprávné ECU.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold">{sectionLabel[section]}</h2>
                    <p className="text-sm text-muted-foreground">
                      {selectedEcu?.common || selectedEcu?.name || "Vyber konkrétní řídicí jednotku"}
                    </p>
                  </div>
                  <div className="relative w-full sm:w-72">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Hledat funkci…"
                      className="pl-9"
                    />
                  </div>
                </div>

                {(section === "tests" || section === "service") && !serviceUnlocked && (
                  <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-300">
                    Pro testy a servisní funkce vyber přesnou značku, model, generaci, rok, motor a konkrétní ECU.
                  </div>
                )}

                {(section === "tests" || section === "service") && serviceUnlocked && verifiedRoutineIds.length === 0 && (
                  <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-300">
                    Pro tento motor zatím nejsou v souboru vehicle-profiles.ts zapsané žádné ověřené rutiny. Čtení chyb a živých dat zůstává dostupné.
                  </div>
                )}

                {loadingCatalog ? (
                  <p className="py-12 text-center text-muted-foreground">Načítám katalog…</p>
                ) : (
                  <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
                    <div className="max-h-[620px] space-y-2 overflow-auto pr-1">
                      {visibleFunctions.length === 0 && (
                        <p className="rounded-xl border p-8 text-center text-muted-foreground">
                          Pro tento výběr nejsou dostupné žádné ověřené funkce.
                        </p>
                      )}

                      {visibleFunctions.map((fn) => (
                        <button
                          key={fn.id}
                          onClick={() => {
                            setSelected(fn);
                            setResult(null);
                          }}
                          className={`w-full rounded-xl border p-4 text-left transition ${
                            selected?.id === fn.id
                              ? "border-primary bg-primary/10"
                              : "hover:bg-secondary/40"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <ClipboardList className="mt-0.5 h-5 w-5 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold">{fn.name}</p>
                                {fn.destructive && <Badge variant="destructive">Pozor</Badge>}
                              </div>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {fn.description || fn.category || "Diagnostická funkce"}
                              </p>
                              <p className="mt-2 text-xs text-muted-foreground">
                                {fn.ecuCommonName || fn.ecu || "Obecná OBD-II funkce"}
                              </p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>

                    <div className="rounded-xl border bg-secondary/20 p-4">
                      {!selected ? (
                        <div className="py-10 text-center text-muted-foreground">Vyber funkci ze seznamu.</div>
                      ) : (
                        <div className="space-y-4">
                          <div>
                            <p className="text-xs uppercase text-muted-foreground">Vybraná funkce</p>
                            <h3 className="mt-1 text-lg font-semibold">{selected.name}</h3>
                            <p className="mt-1 text-sm text-muted-foreground">{selected.description}</p>
                          </div>

                          {selected.safetyWarning && (
                            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-300">
                              {selected.safetyWarning}
                            </div>
                          )}

                          <Button
                            className="w-full"
                            onClick={runSelected}
                            disabled={running || bleState !== "connected"}
                          >
                            <Play className="mr-2 h-4 w-4" />
                            {running ? "Provádím…" : "Spustit funkci"}
                          </Button>

                          {bleState !== "connected" && (
                            <p className="text-center text-xs text-red-400">Nejdřív připoj OBD adaptér.</p>
                          )}

                          {result && (
                            <div className="space-y-3 border-t pt-4">
                              <Badge variant="outline" className={statusClass(result.status)}>
                                {result.status.toUpperCase()}
                              </Badge>

                              {result.decoded.length > 0 && (
                                <div className="space-y-2">
                                  {result.decoded.map((value, index) => (
                                    <div
                                      key={`${value.name}-${index}`}
                                      className="flex items-center justify-between rounded-lg bg-background/70 p-3 text-sm"
                                    >
                                      <span className="text-muted-foreground">{value.name}</span>
                                      <strong>{String(value.value ?? "—")} {value.unit || ""}</strong>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {result.error && (
                                <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
                                  {result.error}
                                </div>
                              )}

                              <Tabs defaultValue="result">
                                <TabsList className="grid w-full grid-cols-2">
                                  <TabsTrigger value="result">Výsledek</TabsTrigger>
                                  <TabsTrigger value="technical">Technické</TabsTrigger>
                                </TabsList>
                                <TabsContent value="result" className="text-sm text-muted-foreground">
                                  Doba odezvy: {result.durationMs} ms
                                </TabsContent>
                                <TabsContent value="technical" className="space-y-2 text-xs">
                                  <p><span className="text-muted-foreground">Příkaz:</span> <code>{result.command}</code></p>
                                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-black/40 p-3">
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
