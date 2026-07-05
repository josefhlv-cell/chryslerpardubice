/**
 * Full DTC scan (03 + 07 + 0A) podle Delphi-OBD.
 * Vrátí summary + jednotlivé služby. Vyžaduje ATH1 profil.
 */
import { elmQueue } from "@/lib/obd/adapter/elm-queue";
import { readStoredDtcs, readPendingDtcs, readPermanentDtcs, type DtcResult } from "./dtc-services";

export type FullDtcScan = {
  summary: {
    storedCount: number;
    pendingCount: number;
    permanentCount: number;
    totalKnownCount: number;
    isCompleteBasicObdScan: boolean;
    note: string;
  };
  stored: DtcResult;
  pending: DtcResult;
  permanent: DtcResult;
};

export async function runFullDtcScan(): Promise<FullDtcScan> {
  return elmQueue.runExclusive(async () => {
    await elmQueue.applyProfile("debug");
    const stored = await readStoredDtcs();
    const pending = await readPendingDtcs();
    const permanent = await readPermanentDtcs();

    const allOk = [stored, pending, permanent].every((r) => r.status === "ok");
    const anyEmpty = [stored, pending, permanent].some((r) => r.status !== "ok");
    const total = stored.codes.length + pending.codes.length + permanent.codes.length;

    let note = "";
    if (allOk && total === 0) {
      note = "Základní OBD-II nenašlo žádné aktivní, čekající ani permanentní emisní DTC.";
    } else if (anyEmpty) {
      note =
        "Základní OBD-II scan není kompletní. Některé chyby mohou být v jiné řídicí jednotce nebo vyžadovat rozšířenou diagnostiku.";
    } else {
      note = `Nalezeno ${total} chybových kódů napříč službami 03/07/0A.`;
    }

    return {
      summary: {
        storedCount: stored.codes.length,
        pendingCount: pending.codes.length,
        permanentCount: permanent.codes.length,
        totalKnownCount: total,
        isCompleteBasicObdScan: allOk,
        note,
      },
      stored,
      pending,
      permanent,
    };
  });
}
