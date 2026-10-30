# Editorial review guide — random-mode word lists (Incision, card #42, D-21)

Context: a typing-race website for students aged 12-17. In "random" mode the server draws words
uniformly from a list and players type them. You review a chunk of a frequency list derived from
wordfreq 3.1.1 (lowercased, NFC). Each input line: `word<TAB>zipf<TAB>LDNOOBW-flag`.
`LDNOOBW` marks words present in a public "bad words" list: a hint only, never a verdict
(that list contains innocent words too, and misses others).

Read EVERY line. Decide only on the exact word (no substring logic). Flag only the words that
need an action; unflagged words are kept.

Actions (exactly one per flagged word):

- `remove` — not a playable word of the language. Categories:
  - `fragment`: clitic/tokenisation fragment or lone letter that is not a word by itself
    (fr: "qu", "l", "d", "j", "c", "n", "s", "t", "m"; en: "s", "t", "ll", "ve", "re", "d", "m", "don"
    when only a fragment of "don't"…). Real one-letter words stay (fr "a", "à", "y", "ô"; en "a").
    English lowercase "i" is removed (category `fragment`): lowercase lone i is wrong English.
  - `abbreviation`: abbreviations, acronyms, SMS/chat forms, units, roman numerals
    (fr "mdr", "svp", "etc", "km", "xix"; en "lol", "pls", "etc", "mr", "ii").
  - `proper-noun`: a name of a person, place, brand, team, organisation, product, with no common
    word sense in this language (fr "paris", "jean", "google"; en "london", "lakers", "zurich").
    Keep a word that is also an ordinary common word (fr "pierre" = stone, "rose"; en "bill",
    "mark", "turkey", "china" = porcelain). Demonyms/languages are ordinary words in their
    language spelling (fr "français", "anglais"; en "french", but in English demonyms are
    capitalised: lowercase en "english", "french", "american" -> remove as `proper-noun`,
    since the typed text must be correct English; fr demonyms in lowercase are correct adjectives -> keep).
    Days and months: fr lowercase is correct (keep); en "monday", "january" -> remove (`proper-noun`).
  - `foreign`: a word of another language not used as an ordinary loanword
    (fr list: "the", "you", "and", "shirts"; en list: "de", "la", "que"). Established loanwords
    stay (fr "week-end" is not here, but "football", "sandwich" stay; en "cafe", "ballet" stay).
  - `nonstandard`: misspelling, missing accent in French ("etait", "deja", "tres"), phonetic or
    slang spelling ("ouais" is standard enough: keep; "chui", "jsuis", "gonna", "wanna", "u", "ur"
    -> remove), interjection noise ("hahaha", "mmm", "ahah"), elongated words.
- `exclude` — a real word that D-21 keeps out of random draws for minors. Categories:
  - `swear`: swear words and vulgar expletives (fr "merde", "putain"; en "shit", "fuck", "damn"…).
  - `insult`: words whose main use is to insult a person (fr "connard", "salope", "idiot",
    "imbécile", "crétin", "abruti", "débile"…; en "bastard", "jerk", "moron", "idiot", "stupid"
    when used as insult noun… use judgement: an adjective like "stupid"/"stupide" is common and mostly not an insult
    to a person by itself -> keep; a noun whose only use is name-calling -> exclude).
  - `slur`: discriminatory slurs (ethnic, religious, sexual orientation, disability, gender):
    always exclude, including slurs that look like ordinary spellings.
  - `sexual`: sexual acts, sexual slang, genital/sexual anatomy slang, pornography, prostitution
    vocabulary (fr "baiser" is a homonym: see below; "pute", "porno", "bite"…). Neutral words such as
    "sexe", "sexuel", "sexy", "viol", "violer", "pédophile", "orgasme" are also excluded:
    random juxtaposition with minors makes them unsuitable even when neutral.
  - `degrading`: degrading or graphic material, self-harm/suicide terms ("suicide", "suicider"),
    drug slang ("beuh", "weed", "joint" is a homonym: see below).
  Ordinary vocabulary of violence, death, war, crime, illness and religion STAYS (pirate
  atmosphere: "mort", "tuer", "sabre", "sang", "guerre", "kill", "blood", "gun", "dead").
- `homonym-keep` / `homonym-exclude` — a word with an ordinary sense AND a vulgar/sexual/insulting
  sense. Choose: keep when the ordinary sense clearly dominates for a 12-17 reader
  (fr "queue", "baiser"? -> decide and justify; en "cock" (rooster), "ass" (donkey), "bitch",
  "dick", "joint", "gay"). Give the senses in the reason.
- `identity` — KEEP the word, but mark it: an identity term (ethnicity, nationality, religion,
  sexual orientation, gender identity, disability, skin colour) that a random neighbour could turn
  into an attack (fr "juif", "arabe", "noir", "musulman", "gay", "handicapé"; en "jewish", "muslim",
  "black", "gay", "disabled"). Identity terms are never removed for being identity terms.
- `pejorative` — KEEP the word, but mark it: an ordinary adjective/verb/noun that, placed next to
  an identity term, would form an attack ("sale", "dirty", "mort" (death to), "kill", "hate",
  "haine", "nul", "ugly", "stupid", "puant", "vermine", "dehors", "go", "back"? use judgement,
  keep to clearly hostile words).

Do not flag ordinary words for being unusual, sad, scary or adult-sounding. Do not invent words
that are not in your chunk. Never paraphrase a flagged word: copy it exactly.

Output: write a TSV file (UTF-8, LF, no header) at the path given in your task, one flagged word
per line: `word<TAB>action<TAB>category<TAB>short reason in English`.
For identity/pejorative use the action as category too. Then reply with: the number of lines read,
the number flagged per action, and up to 15 borderline decisions you want the coordinator to look at.
