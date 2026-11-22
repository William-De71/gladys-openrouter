# OpenRouter

## Überblick

Diese Integration betreibt den Assistenten von Gladys mit **OpenRouter**, einem Dienst, der mit einem einzigen API-Schlüssel und einem einzigen Prepaid-Guthaben Zugang zu mehr als 400 KI-Modellen bietet (Anthropic Claude, OpenAI GPT, Google Gemini, DeepSeek, Mistral, Qwen, kostenlose offene Modelle…). Sobald du sie unter **Einstellungen → Künstliche Intelligenz** wählst, läuft jede KI-Anfrage von Gladys über OpenRouter: der Chat und die Geräte, die er steuert, die Szenen, die er erstellt, die Szenenaktion „KI fragen“ und der Wochenrückblick. Sie funktioniert mit oder ohne Gladys-Plus-Konto.

Dazu kommen eine Szenenaktion, die eine Frage **mit Websuche** stellt, zwei Szenenauslöser (der Assistent hat einen Fehler, der Assistent antwortet wieder) und ein Dashboard-Widget mit den Anfragen, den **Kosten** und dem verbleibenden Guthaben des Schlüssels.

Nicht mit OpenRouter verbunden. Noch nicht mit einem echten OpenRouter-Schlüssel getestet: Rückmeldungen sind willkommen.

## Voraussetzungen

- Gladys Assistant 5.3.0 oder neuer.
- Ein OpenRouter-Konto und ein API-Schlüssel: [openrouter.ai/keys](https://openrouter.ai/keys) → **Create API key**. Du kannst dem Schlüssel ein **Kreditlimit** geben: Dann kann Gladys nie mehr ausgeben.
- **Credits**: Die kostenpflichtigen Modelle werden pro Token von deinem Prepaid-Guthaben abgerechnet, zum Preis des Anbieters ([openrouter.ai/models](https://openrouter.ai/models)). Mit den Standardmodellen kostet eine Chat-Nachricht einen Bruchteil eines Cents.
- **Kostenlose Modelle** (die Auswahl „Kostenlose Modelle“, IDs mit der Endung `:free`): 20 Anfragen pro Minute und 50 pro Tag, 1.000 pro Tag, sobald du 10 Credits gekauft hast. Der Router zählt eine Anfrage pro Chat-Nachricht, eine kostenlose Einrichtung erlaubt also etwa 25 Nachrichten pro Tag. Ihre Anbieter speichern die Anfragen oft oder trainieren damit.
- Was dein Zuhause verlässt: jede Chat-Nachricht, der Verlauf, die Werkzeuge, die Gladys anbietet, und ihre Ergebnisse (der Zustand der Geräte, die der Assistent abfragt) sowie die Bilder des Chats gehen per HTTPS an OpenRouter und dann an den Anbieter des Modells. Die Antworten steuern deine Geräte und erstellen Szenen.

## Konfiguration

| Feld oder Schaltfläche         | Standard                      | Bedeutung                                                                                                |
| ------------------------------ | ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| OpenRouter-API-Schlüssel       | —                             | Pflicht (er beginnt mit `sk-or-`). Nie wieder angezeigt, nie protokolliert                               |
| Chat-Modell                    | Claude Haiku, neueste Version | Beantwortet den Chat, erstellt Szenen, schreibt den Wochenrückblick, führt die Websuche-Aktion aus       |
| Router-Modell                  | GPT Luna, neueste Version     | Ordnet jede Nachricht vor der Antwort ein und muss innerhalb von 20 Sekunden antworten                   |
| ID des anderen Modells         | —                             | Nur wenn ein Modell auf „Anderes Modell“ steht: die genaue ID von openrouter.ai/models (mit Werkzeugen!) |
| Nachdenken des Chat-Modells    | Niedrig                       | Mehr Nachdenken, bessere Szenen, langsamere und teurere Antworten                                        |
| Maximale Antwortlänge (Tokens) | 8000                          | Nachdenken inbegriffen                                                                                   |
| Anbieter                       | Alle Anbieter des Modells     | Auf Anbieter ohne Datenerfassung oder ohne Speicherung beschränken                                       |
| Verbindung testen              | —                             | Eine kurze Antwort jedes Modells mit seiner Zeit; kostet einen Bruchteil eines Cents                     |

Der Status des Konfigurationsbildschirms zeigt, ob OpenRouter den Schlüssel akzeptiert und beide Modelle kennt, ohne etwas auszugeben, und warnt, wenn ein Modell keine Werkzeuge aufrufen kann, wenn das Guthaben des Schlüssels aufgebraucht ist oder wenn ein kostenloses Modell gewählt ist.

## Verwendung

1. Integrationen → **OpenRouter** → Konfiguration: API-Schlüssel einfügen, die Standardmodelle behalten, **Verbindung testen** drücken.
2. Einstellungen → **Künstliche Intelligenz**: **OpenRouter** wählen.
3. Sprich mit Gladys im Chat: „schalte das Wohnzimmer ein“, „wie warm ist es im Schlafzimmer?“, „erstelle eine Szene, die bei Sonnenuntergang die Rollläden schließt“.

### Modelle wählen

Die Auswahlen „neueste Version“ sind Aliase, die OpenRouter aktuell hält: Sie zeigen immer auf das neueste Modell der Familie (heute Claude Haiku 5.5), die Einstellung veraltet also nie.

- **Claude Haiku** (Standard für den Chat): schnell, günstig und zuverlässig mit Werkzeugen.
- **Claude Sonnet**: am leistungsfähigsten für komplexe Szenen, etwa 20-mal so teuer wie Haiku; es denkt immer nach.
- **GPT Terra / GPT Luna**: die Modelle von OpenAI; GPT Luna, der Standard-Router, ist sehr günstig und kann ohne Nachdenken antworten.
- **Gemini Flash**, **DeepSeek Flash**: weitere schnelle Modelle; Gemini denkt immer ein wenig nach.
- **Auto Router**: OpenRouter wählt für jede Anfrage ein Modell; du bezahlst das gewählte Modell.
- **Kostenlose Modelle**: OpenRouter wählt ein kostenloses Modell; begrenzt, siehe Voraussetzungen.
- **Anderes Modell**: jede ID von [openrouter.ai/models](https://openrouter.ai/models), die Werkzeuge unterstützt, etwa `mistralai/mistral-large-4-0` oder eine `:free`-Variante.

Jedes Modell erhält unter den Stufen, die es akzeptiert, die Nachdenk-Stufe, die deiner Wahl am nächsten kommt; der Router erhält immer die niedrigste. Lehnt ein Modell den Parameter für das Nachdenken ab, sendet die Integration ihn ab dann nicht mehr.

### Dashboard-Widget

Das Widget **OpenRouter-Verbrauch** zeigt die Anfragen, die Kosten und die Fehler des Tages, die Kosten des Monats, was dem Schlüssel bleibt (sein Kreditlimit oder die kostenlosen Anfragen des Tages), die Kosten pro Tag über 30 Tage (Tokens, wenn alles kostenlos war), ob OpenRouter antwortet, die Modelle, die letzte Anfrage und den letzten Fehler. Es zählt, was Gladys angefragt hat; für die Rechnung bleibt die Aktivitätsseite von OpenRouter maßgeblich.

![Das Verbrauchs-Widget: Anfragen, Kosten des Tages und des Monats, Fehler, verbleibendes Guthaben des Schlüssels, Kosten pro Tag, Modelle, letzte Anfrage und letzter Fehler (generierte Illustration, kein Screenshot)](https://raw.githubusercontent.com/William-De71/gladys-openrouter/main/docs/assets/widgets.de.png)

### Szenen

- **Aktion „OpenRouter: mit Websuche fragen“**: Das Chat-Modell sucht im Web (5 Ergebnisse über Exa, etwa $0.007 zusätzlich zu den Tokens) und antwortet in wenigen Sätzen. Felder: die Frage (Szenenvariablen erlaubt), zusätzliche Anweisungen. Ausgaben: die Antwort und die Quellen, eine pro Zeile.
- **Auslöser „OpenRouter: Der Assistent hat einen Fehler“**: einmal pro Ausfall (Schlüssel abgelehnt, keine Credits mehr, Anfragelimit, Modell nicht verfügbar, API nicht erreichbar, zu langsam, Fehler des Anbieters), mit Art, Meldung, Anfrage und Modell.
- **Auslöser „OpenRouter: Der Assistent antwortet wieder“**: die erste Antwort nach einem Ausfall, mit den Minuten des Ausfalls.

Beispiele: jeden Morgen mit Websuche nach den Nachrichten des Tages fragen und die Antwort per Telegram senden; wenn der Assistent wegen fehlender Credits ausfällt, dem Administrator eine SMS senden.

## Fehlerbehebung

- **„OpenRouter hat den API-Schlüssel abgelehnt“**: Kopiere den Schlüssel erneut von openrouter.ai/keys; ein gelöschter oder deaktivierter Schlüssel ergibt dieselbe Meldung.
- **„Keine OpenRouter-Credits mehr“**: Lade Credits auf openrouter.ai auf oder erhöhe das Kreditlimit des Schlüssels.
- **„Anfragelimit erreicht“**: Meist die Tagesgrenze der kostenlosen Modelle. Warte bis Mitternacht UTC, kaufe 10 Credits (1.000 kostenlose Anfragen pro Tag) oder wähle ein kostenpflichtiges Router-Modell.
- **„… ist auf OpenRouter nicht verfügbar“**: Die Modell-ID ist falsch oder das Modell wurde entfernt; oder die Einstellung **Anbieter** lässt ihm keinen Anbieter (kostenlose Modelle brauchen oft „Alle Anbieter des Modells“).
- **Der Chat antwortet, ohne etwas zu tun**: Das gewählte Modell kann vielleicht keine Werkzeuge aufrufen (siehe Status); versuche Claude Haiku.
- **„Die Antwort wurde bei max_tokens abgeschnitten“**: Erhöhe die maximale Antwortlänge.
- **Ein Bild im Chat schlägt fehl**: Das gewählte Modell liest vielleicht keine Bilder; die Modelle der Liste lesen sie alle.
- Protokolle: Einstellungen → Supervision, die Protokolle der Integration. Teile nie deinen API-Schlüssel.
