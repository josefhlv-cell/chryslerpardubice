/**
 * Delphi-OBD inspirovaná vrstvená OBD API (read-only).
 *
 * Použití:
 *   import { obd2 } from "@/lib/obd/obd2";
 *   await obd2.runFullDtcScan();
 *   await obd2.stellantis.scanBasicInfo();
 *
 * Toto je jediný veřejný entry-point pro nové OEM/DTC/UDS scany.
 * Nesouvisí se starým `elm327-engine` init (ten pořád ovládá live polling).
 */
import { elmQueue } from "./adapter/elm-queue";
import { applyElmProfile, withElmProfile } from "./adapter/elm-init";
import { runFullDtcScan } from "./services/full-dtc-scan";
import { readStoredDtcs, readPendingDtcs, readPermanentDtcs } from "./services/dtc-services";
import { readVinMode09 } from "./services/service09";
import {
  stellantisProfile,
  startExtendedSession,
  readStellantisDid,
  isStellantisVin,
} from "./oem/stellantis";
import {
  detectOemProfileByVin,
  getOemProfiles,
  getOemProfile,
} from "./oem/OemRegistry";
import { lookupIso15031 } from "./dtc/catalogs/iso-15031";
import { lookupStellantis } from "./dtc/catalogs/stellantis";

export function lookupDtc(code: string) {
  return lookupStellantis(code) ?? lookupIso15031(code);
}

export const obd2 = {
  queue: elmQueue,
  applyProfile: applyElmProfile,
  withProfile: withElmProfile,

  // DTC
  runFullDtcScan,
  readStoredDtcs,
  readPendingDtcs,
  readPermanentDtcs,

  // Mode 09
  readVinMode09,

  // OEM registry
  detectOemProfileByVin,
  getOemProfiles,
  getOemProfile,

  // Stellantis shortcut
  stellantis: {
    profile: stellantisProfile,
    isStellantisVin,
    startExtendedSession,
    readDid: readStellantisDid,
    scanBasicInfo: () => stellantisProfile.scanBasicInfo(),
    scanEngineLive: () => stellantisProfile.scanEngineLive(),
    basicDids: () => stellantisProfile.getBasicDids(),
    engineLiveDids: () => stellantisProfile.getEngineLiveDids(),
  },

  // katalogy
  lookupDtc,
};

export type { DtcResult, DtcService, DtcLabel } from "./services/dtc-services";
export type { FullDtcScan } from "./services/full-dtc-scan";
export type { DidResult, StellantisBasicScan, StellantisEngineLiveScan, SessionResult } from "./oem/stellantis";
export type { ElmStatus } from "./adapter/elm-errors";
