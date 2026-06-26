-- CHDP Customer OBD Permissions
-- Datum: 2026-06-26

create table if not exists public.customer_obd_permissions (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null unique references public.profiles(id) on delete cascade,

    remote_obd boolean not null default false,
    live_data boolean not null default true,
    read_dtc boolean not null default true,
    clear_dtc boolean not null default false,
    gps boolean not null default false,
    service_history boolean not null default true,

    actuator_tests boolean not null default false,
    adaptations boolean not null default false,
    coding boolean not null default false,
    ecu_flash boolean not null default false,

    dpf_regen boolean not null default false,
    epb_service boolean not null default false,
    bms_reset boolean not null default false,

    sos_mode boolean not null default false,

    updated_by uuid,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create index if not exists idx_customer_obd_permissions_user
on public.customer_obd_permissions(user_id);

alter table public.customer_obd_permissions enable row level security;
create table if not exists public.customer_obd_permission_audit (
    id uuid primary key default gen_random_uuid(),

    customer_id uuid not null references public.profiles(id) on delete cascade,
    admin_id uuid references public.profiles(id) on delete set null,

    action text not null,
    permission_key text,
    old_value boolean,
    new_value boolean,
    metadata jsonb not null default '{}'::jsonb,

    created_at timestamptz default now()
);

create index if not exists idx_customer_obd_permission_audit_customer
on public.customer_obd_permission_audit(customer_id);

alter table public.customer_obd_permission_audit enable row level security;
