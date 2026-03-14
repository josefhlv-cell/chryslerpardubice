
INSERT INTO public.service_orders (id, user_id, vehicle_id, status, description, planned_work, mechanic_id, estimated_price, mileage)
VALUES
  ('a0000001-0000-0000-0000-000000000001', '4370f475-51d4-4d73-bf1c-27c0318f61cb', '8b664dee-d78f-4586-b5e4-25f0767830f2', 'in_repair', 'Výměna oleje a filtrů', 'Výměna motorového oleje, olejového filtru a vzduchového filtru', '9d6a4ee8-c324-4749-9205-fd7d83178976', 3500, 85000),
  ('a0000002-0000-0000-0000-000000000002', '4370f475-51d4-4d73-bf1c-27c0318f61cb', '8b664dee-d78f-4586-b5e4-25f0767830f2', 'diagnostics', 'Diagnostika motoru - nestabilní chod', 'Připojení diagnostiky, kontrola chybových kódů', 'baf6d762-deba-44e0-9828-3cde73f37d9c', 1500, 120000),
  ('a0000003-0000-0000-0000-000000000003', '4370f475-51d4-4d73-bf1c-27c0318f61cb', '8b664dee-d78f-4586-b5e4-25f0767830f2', 'in_repair', 'Výměna brzdových destiček', 'Výměna předních a zadních brzdových destiček', '2479c5af-8264-4236-aced-a8f1dd434001', 5200, 95000),
  ('a0000004-0000-0000-0000-000000000004', '4370f475-51d4-4d73-bf1c-27c0318f61cb', '8b664dee-d78f-4586-b5e4-25f0767830f2', 'in_repair', 'Výměna rozvodového řemene', 'Kompletní výměna rozvodové sady', '83d1ffe2-a46a-4b16-b8cd-15c738424ddf', 12000, 150000),
  ('a0000005-0000-0000-0000-000000000005', '4370f475-51d4-4d73-bf1c-27c0318f61cb', '8b664dee-d78f-4586-b5e4-25f0767830f2', 'testing', 'Kontrola klimatizace', 'Plnění chladiva, test těsnosti, kontrola kompresoru', '15dd08a9-3879-4eae-a718-1f81a3957ada', 2800, 67000);

INSERT INTO public.mechanic_tasks (service_order_id, mechanic_id, title, status, estimated_minutes)
VALUES
  ('a0000001-0000-0000-0000-000000000001', '9d6a4ee8-c324-4749-9205-fd7d83178976', 'Vypustit starý olej', 'pending', 15),
  ('a0000001-0000-0000-0000-000000000001', '9d6a4ee8-c324-4749-9205-fd7d83178976', 'Vyměnit olejový filtr', 'pending', 10),
  ('a0000001-0000-0000-0000-000000000001', '9d6a4ee8-c324-4749-9205-fd7d83178976', 'Vyměnit vzduchový filtr', 'pending', 10),
  ('a0000001-0000-0000-0000-000000000001', '9d6a4ee8-c324-4749-9205-fd7d83178976', 'Naplnit nový olej a zkontrolovat hladinu', 'pending', 15),
  ('a0000002-0000-0000-0000-000000000002', 'baf6d762-deba-44e0-9828-3cde73f37d9c', 'Připojit diagnostiku OBD2', 'pending', 20),
  ('a0000002-0000-0000-0000-000000000002', 'baf6d762-deba-44e0-9828-3cde73f37d9c', 'Přečíst a analyzovat chybové kódy', 'pending', 30),
  ('a0000002-0000-0000-0000-000000000002', 'baf6d762-deba-44e0-9828-3cde73f37d9c', 'Zkontrolovat stav zapalovacích svíček', 'pending', 15),
  ('a0000003-0000-0000-0000-000000000003', '2479c5af-8264-4236-aced-a8f1dd434001', 'Demontáž předních kol', 'pending', 15),
  ('a0000003-0000-0000-0000-000000000003', '2479c5af-8264-4236-aced-a8f1dd434001', 'Výměna předních brzdových destiček', 'pending', 30),
  ('a0000003-0000-0000-0000-000000000003', '2479c5af-8264-4236-aced-a8f1dd434001', 'Výměna zadních brzdových destiček', 'pending', 30),
  ('a0000003-0000-0000-0000-000000000003', '2479c5af-8264-4236-aced-a8f1dd434001', 'Kontrola brzdových kotoučů', 'pending', 10),
  ('a0000004-0000-0000-0000-000000000004', '83d1ffe2-a46a-4b16-b8cd-15c738424ddf', 'Demontáž krytu rozvodů', 'pending', 30),
  ('a0000004-0000-0000-0000-000000000004', '83d1ffe2-a46a-4b16-b8cd-15c738424ddf', 'Výměna rozvodového řemene', 'pending', 45),
  ('a0000004-0000-0000-0000-000000000004', '83d1ffe2-a46a-4b16-b8cd-15c738424ddf', 'Výměna napínací kladky', 'pending', 20),
  ('a0000004-0000-0000-0000-000000000004', '83d1ffe2-a46a-4b16-b8cd-15c738424ddf', 'Výměna vodní pumpy', 'pending', 25),
  ('a0000005-0000-0000-0000-000000000005', '15dd08a9-3879-4eae-a718-1f81a3957ada', 'Kontrola těsnosti klimatizace', 'pending', 20),
  ('a0000005-0000-0000-0000-000000000005', '15dd08a9-3879-4eae-a718-1f81a3957ada', 'Plnění chladiva R134a', 'pending', 15),
  ('a0000005-0000-0000-0000-000000000005', '15dd08a9-3879-4eae-a718-1f81a3957ada', 'Test funkce kompresoru', 'pending', 15);
