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
| Arrêt (mode and status) | Off | « Arrêté » left the UI: the status sentence says « Arrêt » |
| Manuel | Manual | |
| Autre / Mixte / Mixte (moyenne) | Other / Mixed / Mixed (average) | |
| Confort | Comfort | Level and setpoint |
| Éco | Eco | |
| Abaissement éco | Eco setback | The offset below comfort; the room panel shows eco as a temperature, « Éco » with « 3,0 °C sous le confort » → “Eco”, “3.0 °C below comfort” |
| Hors-gel | Frost protection | |
| Repos (level off) | Idle | The heater is not calling for heat. Not shown on rooms any more: only « En chauffe » / “Heating”, when true |
| Consigne / Consigne active | Setpoint / Current setpoint | Controls. The card and panel caption « consigne 21,0 °C » is “target 21.0 °C” |
| Chauffe temporaire | Boost | Replaces « Forcer temporairement » in the UI (the API stays `boost`): « Chauffer à 22 °C pendant 2 h » → “Heat to 22 °C for 2 h”, « Lancer » / « Arrêter » → “Start” / “Stop”, « Puis retour au programme vers 21:45. » → “Then back to the schedule at about 21:45.” |
| Absence | Away | The state. « Partir en absence » (sheet title) and its button « Partir » → “Go away”; « Absence en cours » → “Away mode on”; « Prolonger… » → “Extend…”; « Terminer maintenant » → “End now”; « Annuler l’absence » → “Cancel away”; sidebar « Absence · dim. 18:00 » → “Away · Sun 18:00” |
| Rétablissement… | Restoring… | |
| En ce moment (Maison) | Right now | The overview's live section; « Tout suit son réglage habituel. » → “Everything follows its usual settings.” (« Aucun forçage ni absence » left the UI) |
| Tout éteindre | Turn everything off | |
| Tout remettre en programme | Put everything back on schedule | |
| Heures creuses / HC | Off-peak | Never “HC”, even in compact places |
| Heures pleines / HP | Peak | |
| Plage (confort, HC) | Period | “Comfort period”, “Off-peak period” |
| Période (Historique d’une pièce) | Time range | The room History selector (24 h / 7 d / 30 d): never “Period”, which is « plage » there |
| Période (Énergie) | Period | The time Énergie shows (“Previous period”, “Share of the period”); no « plage » appears on that page |
| Tarif | Tariff | |
| Registre 1 / Registre 2 (radiator meters) | Register 1 / Register 2 | T1/T2 are the radiator’s registers, not off-peak/peak |
| Pointe (moyenne sur 30 min) | Max power (30-min average) | Never “Peak”, which is HP |
| Talon (veille) | Base load | |
| Reste (de la maison) | Rest (of the home) | The meter minus the radiators; compact « Reste » → “Rest” |
| Consommation de fond | Background use | The floor under a day’s curve (“background use ≈ 1.2 kWh”); not « talon », which is the base load row |
| Couverture | Coverage | Radiator-days measured over radiator-days that existed |
| Relevé (journalier) | (Daily) reading | A meter or Linky reading; « pas de relevé » → “no reading” |
| Écart | Gap | Between two figures (“measurement gap”, “curve / reading gap”) |
| Jour comparable | Comparable day | |
| Qualité | Quality | The Énergie section; the longer « Qualité des données » is “Data quality” |
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
| Réglages | Settings | Left Maison in UX batch 8: the overview has « Affichage » → “Display” (theme, language, technical details); account and server are « Compte » → “Account” |
| Sources de données | Data sources | Maison › Sources de données (Cozytouch, Linky, RTE EcoWatt, Tempo) |
| Nouveau prix… | New price… | Tarif: opens the editor |
| Thème : Système / Sombre / Clair | Theme: System / Dark / Light | |
| Langue | Language | Options never translated: « Français », “English” |
| Compte | Account | |
| Se connecter / Connexion / Se déconnecter / Se reconnecter | Sign in / Sign in / Sign out / Sign in again | Never “log in” |
| Mot de passe | Password | |
| Simulateur | Simulator | |
| Envoi… / Confirmé / Réessayer / Échec de la commande | Sending… / Confirmed / Retry / Command failed | |
| Fenêtre ouverte | Window open | |
| Hors ligne / Hors ligne depuis 14:32 | Offline / Offline since 14:32 | A radiator or room that does not answer (switched off at the mains); replaces « Injoignable » on rooms and radiators. « Cozytouch injoignable » keeps “unreachable” |
| Radiateur hors tension ou hors de portée | Radiator switched off or out of range | The offline hint |
| En chauffe | Heating | « 1 pièce en chauffe · 2 hors ligne » → “1 room heating · 2 offline” |
| Programme · Confort jusqu’à 23:00 | Schedule · Comfort until 23:00 | The room status sentence; « jusqu’à demain 06:30 » → “until tomorrow 06:30” |
| Détection de fenêtre ouverte / de présence | Open-window detection / Presence detection | |
| Veilleuse | Night light | |
| Faire clignoter / identification | Blink | The button and the pending label (“Salon: blink”) |
| Radiateur(s) | Radiator(s) | The upstream default name « Radiateur » is device data, never translated |
| Détails / Historique / Aujourd’hui / Réglage | Details / History / Today / Controls | « Infos » is the radiator’s Details section (Infos / Details) |
| Intensité (veilleuse) | Brightness | |
| Dernier signal | Last signal | The last event a radiator sent |
| Dernière mesure : 23,6 °C à 14:31 | Last reading: 23.6 °C at 14:31 | An offline room's panel only |
| Modifier les horaires | Edit schedule | Room panel → Programme |
| Masquer (une alerte) | Dismiss | |
| Appareils connectés | Signed-in devices | Home › Settings; « Déconnecter » → “Sign out”, « Déconnecter les autres appareils » → “Sign out other devices” |
| Copier vers… / Jours de semaine / Week-end / Tous les jours | Copy to… / Weekdays / Weekend / Every day | Programme day editor; « Copier sur 4 jours » → “Copy to 4 days” |
| Aussi pour… / Envoyer aussi à | Also for… / Also send to | Programme send bar |
| Maintenant : Confort · 23:00 → Éco | Now: Comfort · 23:00 → Eco | Programme plan line |
| Hors ligne (pièce) / derniers connus | Offline / last known | Programme picker suffix « hors ligne » → “offline” |
| modifié (jour) | edited | An unsent day in the Programme week |
| Comment modifier ? | How to edit | Programme help disclosure |
| Programme modifié ailleurs | Schedule changed elsewhere | « Recharger » → “Reload”, « Remplacer quand même » → “Replace anyway” |
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
| Option tarifaire | Tariff option |
| Base | Base |
| HC/HP (option) | Peak/Off-peak |
| Applicable à partir du | Valid from |
| Heures creuses différentes selon la saison | Off-peak hours differ by season |
| Saison | Season |
| Jours Tempo | Tempo days |
| Jours rouges | Red days |
| Couleur pas encore publiée | Colour not published yet |
| Signaux du réseau électrique | Power grid signals |
| Système électrique tendu | The power grid is under strain |
| Sources | Sources |
| Préremplir | Prefill |
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
| Allure | Heating level | A pilot-wire heater's level (Confort, Éco, Hors-gel, Arrêt) |
| Devrait fonctionner | Expected to work | Support chip: not tested on real hardware |
| Expérimental | Experimental | Support chip |
| Lecture seule | Read-only | Support chip: Kelvin shows the device and sends it nothing |
| Sèche-serviettes | Towel dryer | |
| Boost (du sèche-serviettes) | Towel boost | Kelvin's own override is « Chauffe temporaire » / Boost |
| Séchage | Drying | |
| Radiateur fil pilote | Pilot-wire radiator | |
| Serveur | Server | The Overkiz server a home belongs to (Settings, login) |
| Afficher les détails techniques / Détails techniques | Show technical details / Technical details | The per-device preference (direction-2 §1.3); « Fiche » is internal only, never shown |
| Source / Relevé / Nature | Source / Reading / Kind | A Fiche's Provenance block |
| mesuré / estimé / projection / calculé / publié | measured / estimated / projected / calculated / published | Nature of a figure (§1.4); « publié » for Tempo and EcoWatt as RTE/EDF gave them |
| Calcul Kelvin / Votre tarif | Kelvin’s calculation / Your tariff | Sources of computed figures |
| Hors connexion · données de 21:14 | Offline · data from 21:14 | Neutral banner (browser offline) |
| Kelvin ne répond pas | Kelvin hasn’t answered | Banner after 3 min without Kelvin |
| Cette page n’existe pas | This page doesn’t exist | 404 |
| Aller aux pièces | Go to rooms | 404 and error pages |
| Plus d’actions | More actions | A « ⋯ » menu's default name |

## Tone

French uses « vous » and imperatives (« Collez le jeton »). English uses plain imperatives (“Paste
your token”) and contractions in sentences (“can’t”, “isn’t”), not in labels. Both use sentence case.
