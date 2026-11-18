-- Block the old placeholder "Inspection Details" findings for good.
--
-- New Inspection used to insert six Informational placeholder findings (In
-- Attendance, Occupancy, Style, Temperature, Type of Building, Weather
-- Conditions) whose text just listed every option. The app no longer creates
-- them (#123), but a phone/tablet/browser still running the OLD page (open since
-- before that update) still inserts them when a new inspection is created. This
-- guard silently skips those exact placeholder rows at the database, whatever
-- app version sends them. Real findings are never affected: it only matches the
-- placeholder's own recommendation text in the Inspection Details section.
-- Safe to run more than once.

create or replace function public.skip_placeholder_details_findings()
returns trigger
language plpgsql
as $$
begin
  if new.section = 'Inspection Details'
     and new.recommendation in (
       'Update this item as applicable to document who was present during the inspection.',
       'Update this item as applicable to document the occupancy and utility status observed during the inspection.',
       'Update this item as applicable to document the observed home style.',
       'Enter the approximate temperature observed during the inspection.',
       'Update this item as applicable to document the building type.',
       'Update this item as applicable to document weather conditions that may affect inspection visibility or limitations.'
     ) then
    return null; -- skip this row, no error
  end if;
  return new;
end;
$$;

drop trigger if exists skip_placeholder_details_findings on public.findings;
create trigger skip_placeholder_details_findings
  before insert on public.findings
  for each row execute function public.skip_placeholder_details_findings();

-- Clean up any that were already created and never edited (placeholder text
-- unchanged in both fields, no photos attached).
delete from public.findings f
where f.section = 'Inspection Details'
  and f.recommendation in (
    'Update this item as applicable to document who was present during the inspection.',
    'Update this item as applicable to document the occupancy and utility status observed during the inspection.',
    'Update this item as applicable to document the observed home style.',
    'Enter the approximate temperature observed during the inspection.',
    'Update this item as applicable to document the building type.',
    'Update this item as applicable to document weather conditions that may affect inspection visibility or limitations.'
  )
  and f.observation in (
    'In attendance at the time of inspection: Client, Listing Agent, Home Owner, Client''s Agent, Inspector, or Other.',
    'Occupancy status at the time of inspection: Furnished, Occupied, Vacant, Utilities Off, or Other.',
    'Home style/type observed: Manufactured, Rambler, Modular, Ranch, Modern, Multi-level, Bungalow, Contemporary, Victorian, Colonial, Row House, Townhouse, or Other.',
    'Approximate exterior temperature at the time of inspection should be documented.',
    'Building type observed: Multi-Family, Attached, Single Family, Condominium / Townhouse, Detached, or Other.',
    'Weather conditions at the time of inspection: Snow, Dry, Cloudy, Hot, Heavy Rain, Clear, Light Rain, Humid, Recent Rain, or Other.'
  )
  and not exists (select 1 from public.photos p where p.finding_id = f.id::text);
