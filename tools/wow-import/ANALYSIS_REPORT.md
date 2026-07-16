# WOW archive analysis

Both archives were inspected directly.

## Confirmed sources

- `mid_prot_overview.csv`: 63,017 rows, exactly 22 semicolon-delimited fields per row.
- `MID_PROT_OVERVIEW_DEV.config`: field descriptor for the protocol overview database.
- `serial_help.zip`: 3,000 files including manufacturer-specific adaptation, activation and service-help documents.
- `diagnosis.zip`: connection and diagnostic preparation help.
- `ac_diagnosis_module.zip` (nested): compiled Java implementation classes used to understand naming and architecture.
- `protocols.data.*`, `protocols.index.*`, `protocols_info.*`, `lookup_dtc.*`, `resources.*`, `confirms.*`: present and inventoried, but not falsely decoded.

## Safe result

The patch imports real protocol/system metadata and help-document metadata. It deliberately does not turn proprietary protocol identifiers into ELM commands. A record such as `9chr_vpw_bcm_RS` identifies a real WOW protocol entry, but does not by itself provide the complete byte sequence, timing, pin routing or VCI behavior required to execute it through Vgate.
