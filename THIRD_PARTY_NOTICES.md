CHDP Garage uses and ports parts of Delphi-OBD.

Delphi-OBD
Copyright (C) 2024 Ernst Reidinga
Licensed under the Apache License, Version 2.0.

Original project:
https://github.com/erdesigns-eu/Delphi-OBD

Parts of the Delphi-OBD diagnostic catalog, protocol handling, parser logic,
ELM327/UDS flow and OEM diagnostic definitions were ported and adapted
for use in CHDP Garage (VraForge Diag admin module).

Original source is kept unmodified under `vendor/delphi-obd/` and a curated
subset of catalog JSON files is served at runtime from
`public/vraforge-diag/catalogs/`.
