-- Feestplanner: optioneel adres bij een feest, dat de host bewust kan tonen
-- op de gedeelde menukaart (en in de agenda-uitnodiging). Standaard uit.
alter table public.parties add column if not exists address text;
alter table public.parties add column if not exists show_address boolean not null default false;
