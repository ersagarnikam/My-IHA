-- Each doctor and hospital works in its own Australian time zone (Sydney and
-- Melbourne observe daylight saving, Brisbane doesn't, Perth is two hours
-- behind). Existing accounts keep Brisbane, the zone everything used before.

alter table doctors add column time_zone varchar not null default 'Australia/Brisbane';
alter table hospitals add column time_zone varchar not null default 'Australia/Brisbane';
