# DA2-8 — Race settings edit form

Captures of the settings panel alone, taken from the running app (production build, isolated
local database) by `apps/web/e2e/da2-settings-form.spec.ts` with `DA2_EVIDENCE=1`. There is no
mock-up for this form: the criteria of `docs/da/v2/plan.md` (DA2-8) are its specification.

Files are `<state>-{fr,en}-{abysse,aube}-{1440,390}.jpg`:

| State | What it shows |
|---|---|
| `1-ferme` | host, form closed: the saved summary |
| `2-ouvert-sans-modification` | form open, four groups, nothing pending |
| `3-modifications-en-attente` | four pending changes, each with its tag and the saved value |
| `4-erreur-de-champ` | word count and duration out of range, each error beside its field |
| `5-refus-du-serveur` | a save refused by the server (no word fits), beside the field it names |
| `6-conflit` | the settings changed in another tab: summary updated, draft kept, conflict message |
| `7-deconnecte` | connection lost with a draft open: fields disabled, draft kept |
| `8-non-hote` | a member who is not the host: the summary only |
