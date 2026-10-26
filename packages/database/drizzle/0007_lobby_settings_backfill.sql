-- Custom migration (F-03.1a), applied in the migrator's transaction with 0006: every room open before it gets settings.
-- Rooms already open keep the first race path's 120 s and mandatory correction; their texts are French, the site's default language (no host's language is stored).
INSERT INTO "lobby_settings" ("lobby_id", "text_language", "time_limit_ms", "error_mode") SELECT "id", 'fr', 120000, 'mandatory' FROM "lobbies";
