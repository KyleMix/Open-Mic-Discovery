-- Undo 20260808000200. Safe only while no profile references 1.3
-- (profiles.eula_version is a foreign key); after anyone accepts it, the
-- version is history and must not be deleted.
delete from eula_versions ev
 where ev.version = '1.3'
   and not exists (select 1 from profiles p where p.eula_version = '1.3');
