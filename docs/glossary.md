# Glossary: French ↔ English

The source for every English string in Kelvin (`web/src/lib/i18n/en.ts`). The aim is natural,
British-leaning product English, as in heating apps (Nest, tado°, Hive), not a literal translation.
English is en-GB: 24 h clock, `13 October 2026`, metric units, €. A new term goes here first.

## Terms

| French (UI) | English | Notes |
|---|---|---|
| Pièces / Pièce | Rooms / Room | Nav, page title |
| Sans pièce | No room | Énergie, unassigned radiators |
| Programme (nav, page, mode) | Schedule | “Programme” is British for TV programmes; heating apps say schedule. Compact « Prog. » → “Sched.” |
| Arrêt (mode) / Arrêté (status) | Off | |
| Manuel | Manual | |
| Autre / Mixte / Mixte (moyenne) | Other / Mixed / Mixed (average) | |
| Confort | Comfort | Level and setpoint |
| Éco | Eco | |
| Abaissement éco | Eco setback | The offset below comfort |
| Hors-gel | Frost protection | |
| Repos (level off) | Idle | The heater is not calling for heat |
| Consigne / Consigne active | Setpoint / Current setpoint | |
| Forcer / Forcé / Forçage / Forcer temporairement | Boost / Boosted / Boost / Temporary boost | « Annuler le forçage » → “Cancel boost” |
| Absence | Away | « Activer l’absence » → “Start away mode” |
| Rétablissement… | Restoring… | |
| En cours (Maison) | Active | |
| Tout éteindre | Turn everything off | |
| Tout remettre en programme | Put everything back on schedule | |
| Heures creuses / HC | Off-peak | Never “HC”, even in compact places |
| Heures pleines / HP | Peak | |
| Plage (confort, HC) | Period | “Comfort period”, “Off-peak period” |
| Tarif | Tariff | |
| Registre 1 / Registre 2 (radiator meters) | Register 1 / Register 2 | T1/T2 are the radiator’s registers, not off-peak/peak |
| Pointe (moyenne sur 30 min) | Max power (30-min average) | Never “Peak”, which is HP |
| Talon (veille) | Base load | |
| Qualité des données | Data quality | |
| Comparaisons | Comparisons | |
| Abonnement (€/mois) | Standing charge (€/month) | |
| Puissance souscrite | Subscribed power | kVA |
| Applicable à partir du | Valid from | |
| Estimation | Estimate | |
| Projection | Forecast | |
| Consommation | Consumption | |
| Chauffage | Heating | |
| Énergie | Energy | |
| Courbe du … | Load curve, … | “Half-hourly use on 13 October 2026” for its label |
| Compteurs des radiateurs | Radiator meters | |
| Depuis l’installation | Since installation | |
| Maison (nav, page) | Home | Page at `/home` |
| Toute la maison | Whole home | |
| Réglages | Settings | |
| Thème : Système / Sombre / Clair | Theme: System / Dark / Light | |
| Langue | Language | Options never translated: « Français », “English” |
| Compte | Account | |
| Se connecter / Connexion / Se déconnecter / Se reconnecter | Sign in / Sign in / Sign out / Sign in again | Never “log in” |
| Mot de passe | Password | |
| Simulateur | Simulator | |
| Envoi… / Confirmé / Réessayer / Échec de la commande | Sending… / Confirmed / Retry / Command failed | |
| Fenêtre ouverte | Window open | |
| Détection de fenêtre ouverte / de présence | Open-window detection / Presence detection | |
| Veilleuse | Night light | |
| Faire clignoter / identification | Blink | The button and the pending label (“Salon: blink”) |
| Radiateur(s) | Radiator(s) | The upstream default name « Radiateur » is device data, never translated |
| Détails / Historique / Commande | Details / History / Controls | |
| Jeton MyElectricalData | MyElectricalData token | |
| PDL (point de livraison) | PDL (delivery point) | |
| Relié / Non relié | Connected / Not connected | Linky |
| Synchro | Sync | |
| Injoignable / Connecté | Unreachable / Connected | A status word. In a sentence, « Cozytouch injoignable » / « Kelvin est injoignable » → “Can’t reach Cozytouch” / “Can’t reach Kelvin” (one phrasing everywhere) |
| Limite de requêtes Cozytouch atteinte | Cozytouch request limit reached | The quota condition, one phrasing everywhere (never “rate limit”) |
| à l’instant / il y a 5 min | just now / 5 min ago | |
| Aujourd’hui / demain / la veille | Today / tomorrow / the previous day | |
| Jour / Semaine / Mois / Année | Day / Week / Month / Year | |
| 24 h / 7 j / 30 j | 24 h / 7 d / 30 d | |
| Linky, Enedis, MyElectricalData, Cozytouch, PDL | unchanged | Proper nouns |

## Terms of later plans (spec §4)

| French | English |
|---|---|
| Pointe | Max power (never “Peak”, which is HP) |
| Talon (veille) | Base load |
| Jour Tempo Bleu / Blanc / Rouge | Tempo Blue / White / Red day |
| EcoWatt vert / orange / rouge | EcoWatt green / orange / red |
| Alertes | Alerts |
| Budget mensuel | Monthly budget |
| Rythme | Pace |
| Degré-jour (DJU) | Degree day (HDD) |
| Appareils | Devices |
| Pont Cozytouch | Cozytouch bridge |
| Joignable / Injoignable | Reachable / Unreachable |
| Sessions | Signed-in devices |
| Pré-chauffage | Pre-heat |

## Tone

French uses « vous » and imperatives (« Collez le jeton »). English uses plain imperatives (“Paste
your token”) and contractions in sentences (“can’t”, “isn’t”), not in labels. Both use sentence case.
