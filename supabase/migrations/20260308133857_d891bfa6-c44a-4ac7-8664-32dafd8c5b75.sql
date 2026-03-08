-- Standardize "Elektrika" to "Elektroinstalace" across all EPC data
UPDATE epc_categories SET category = 'Elektroinstalace' WHERE category = 'Elektrika';
