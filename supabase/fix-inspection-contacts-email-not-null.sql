-- inspection_contacts.email is NOT NULL, but the realtor-forward agreement
-- flow needs to create a client contact from just a name when the inspector
-- doesn't have the client's email yet (that's the whole reason to route
-- through the realtor - the client supplies their own email when they
-- actually sign). Dropping the constraint lets that contact exist with a
-- null email in the meantime.

alter table public.inspection_contacts
  alter column email drop not null;
