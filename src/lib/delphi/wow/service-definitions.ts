export type WowVerificationStatus = "verified" | "unverified" | "metadata" | "rejected";
export type WowCandidateKind = "uds_candidate" | "hex_sequence_candidate" | "function_text_candidate";

export interface WowServiceDefinitionCandidate {
  id: string;
  sourceArchive: string;
  sourceFile: string;
  offset: number;
  kind: WowCandidateKind;
  label?: string;
  requestCandidate?: string;
  context?: string[];
  confidence: number;
  verificationStatus: WowVerificationStatus;
  executable: boolean;
  reason: string;
}

export interface VerifiedWowServiceDefinition extends WowServiceDefinitionCandidate {
  verificationStatus: "verified";
  executable: true;
  brandKey: string;
  vehicleProfileIds: string[];
  ecuId: string;
  protocol: "CAN_UDS" | "CAN_ISOTP" | "KWP2000" | "J1850_VPW" | "J1850_PWM" | "ISO9141";
  tx: string;
  rx: string;
  requestCandidate: string;
  positiveResponsePrefix: string;
  timeoutMs: number;
  preconditions: string[];
  adapterSupport: "elm_supported" | "cdp_required";
}

export function canExecuteWowDefinition(
  value: WowServiceDefinitionCandidate,
): value is VerifiedWowServiceDefinition {
  const v = value as Partial<VerifiedWowServiceDefinition>;
  return value.verificationStatus === "verified" && value.executable === true &&
    !!v.ecuId && !!v.protocol && !!v.tx && !!v.rx && !!v.requestCandidate &&
    !!v.positiveResponsePrefix && Number.isFinite(v.timeoutMs);
}
