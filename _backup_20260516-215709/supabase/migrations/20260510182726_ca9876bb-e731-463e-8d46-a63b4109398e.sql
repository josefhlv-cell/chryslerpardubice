UPDATE public.nextis_vehicles SET year_from=2005, year_to=2010 WHERE brand='Chrysler' AND model='300C' AND engine='3.0 CRD';
UPDATE public.nextis_vehicles SET year_from=2005, year_to=2010 WHERE brand='Chrysler' AND model='300C' AND engine='3.5 V6';
UPDATE public.nextis_vehicles SET year_from=2005, year_to=2010 WHERE brand='Chrysler' AND model='300C' AND engine='5.7 HEMI';
UPDATE public.nextis_vehicles SET year_from=2005, year_to=2010 WHERE brand='Chrysler' AND model='300C' AND engine='6.1 SRT8';
DELETE FROM public.api_cache WHERE cache_type='jm_parts_for_engine';