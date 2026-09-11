-- One-time manual migration for the already-running production database.
--
-- paraisos/infra/init.sql only seeds a fresh database on first boot (see
-- seedLegacyImages() in paraisos/backend/src/services/imageService.ts), so
-- production spots that were already inserted months ago from an older
-- init.sql keep imagen_url = NULL even after this repo's init.sql is
-- updated. Run this UPDATE by hand against the production `paraisos`
-- database to backfill the photos added in this change.
--
-- IMPORTANT: the corresponding files under paraisos/backend/seed-images/
-- must already be deployed (i.e. this branch/PR merged and the backend
-- redeployed, so seedLegacyImages() has copied them into
-- PARAISOS_IMAGES_PATH) BEFORE running these UPDATEs — otherwise the
-- imagen_url will point at a file that does not exist yet on the volume.

UPDATE spot SET imagen_url = '/paraisos/api/images/garganta-la-olla.jpg' WHERE id = 1;
UPDATE spot SET imagen_url = '/paraisos/api/images/garganta-de-cuartos.jpg' WHERE id = 5;
UPDATE spot SET imagen_url = '/paraisos/api/images/cascada-el-trabuquete.jpg' WHERE id = 6;
UPDATE spot SET imagen_url = '/paraisos/api/images/mirador-de-la-memoria.jpg' WHERE id = 9;
UPDATE spot SET imagen_url = '/paraisos/api/images/cala-dels-testos.jpg' WHERE id = 44;
UPDATE spot SET imagen_url = '/paraisos/api/images/chorradores-de-navarres.jpg' WHERE id = 51;
UPDATE spot SET imagen_url = '/paraisos/api/images/aguas-tuertas.jpg' WHERE id = 68;
UPDATE spot SET imagen_url = '/paraisos/api/images/barranco-la-peonera.jpg' WHERE id = 69;
UPDATE spot SET imagen_url = '/paraisos/api/images/toll-de-lolla.jpg' WHERE id = 71;
UPDATE spot SET imagen_url = '/paraisos/api/images/cascada-del-gerber.jpg' WHERE id = 75;
UPDATE spot SET imagen_url = '/paraisos/api/images/playa-de-castro.jpg' WHERE id = 80;
UPDATE spot SET imagen_url = '/paraisos/api/images/piscina-natural-mesas-del-mar.jpg' WHERE id = 89;
UPDATE spot SET imagen_url = '/paraisos/api/images/twin-lagoon-coron-island.jpg' WHERE id = 92;
UPDATE spot SET imagen_url = '/paraisos/api/images/playa-de-cue.jpg' WHERE id = 100;
