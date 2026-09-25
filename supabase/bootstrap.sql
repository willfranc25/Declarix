-- Historical application table, originally created outside migrations.
-- Only required on an empty database BEFORE replaying the historical migrations.
create table if not exists public.invoices (
 id uuid primary key default gen_random_uuid(), "providerName" text,"providerRut" text,
 "documentType" text,"documentNumber" text,date text,"netAmount" numeric,"ivaAmount" numeric,
 "specificTax" numeric,"totalAmount" numeric,"totalBoletaServicios" numeric,"totalBoletaHonorarios" numeric,
 "expenseType" text,detail text,status text,notes text,"createdAt" timestamptz default now(),"updatedAt" timestamptz default now()
);
