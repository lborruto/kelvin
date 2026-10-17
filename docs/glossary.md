# Glossary: French ↔ English

The source for every English string in Kelvin (`web/src/lib/i18n/en.ts`). The aim is natural,
British-leaning product English, as in heating apps (Nest, tado°, Hive), not a literal translation.
English is en-GB: 24 h clock, `13 October 2026`, metric units, €. A new term goes here first.

## Terms

| French (UI) | English | Notes |
|---|---|---|
| Pièces / Pièce | Rooms / Room | The sidebar's « PIÈCES » section and the Maison tableau's « Pièces » area (no longer a nav item or a page title since Tableau) |
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
| Consigne prévue · Niveau · Chauffe · Présence | Planned setpoint · Level · Heating · Presence | The room chart's inspector rows; « détectée / par moments / non détectée » → “detected / at times / not detected”; « à venir » → “still to come” |
| Chauffe temporaire | Boost | Replaces « Forcer temporairement » and « forçage » in the UI (the API stays `boost`): « Chauffer à 22 °C pendant 2 h » → “Heat to 22 °C for 2 h”, « Lancer » / « Arrêter » → “Start” / “Stop”, « Puis retour au programme vers 21:45. » → “Then back to the schedule at about 21:45.”; another day goes before « vers » (owner): « Puis retour au programme demain vers 00:19. » → “Then back to the schedule tomorrow at about 00:19.” The pending label reads « Salon : chauffe temporaire à 22 °C » → “Salon: boost to 22 °C” (the backend's « forcé à » is the Overkiz execution label only) |
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
| Reste (de la maison) | Rest (of the home) | The meter minus the radiators; compact « Reste » → “Rest” |
| Consommation de fond | Baseload | The home's always-on floor: the Puissance row (night minimum, 10 % of half-hours) and its energy (« consommation de fond ≈ 1,2 kWh » → “baseload ≈ 1.2 kWh”). « Talon (veille) » left the UI |
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
| Maison (nav, page) | Home | The tableau (dashboard) at `/` since Tableau (decision 1). « Aller au tableau Maison » → “Go to Home” |
| Partir… | Go away… | The sidebar and Maison button that opens the Absence sheet |
| Climat / Réseau / Résumés (Maison) | Climate / Grid / Summary | The Maison summary chips; « 19,1–19,6° · 1 en chauffe » → “19.1–19.6° · 1 heating”, « Rien à signaler » → “Nothing to report” |
| Tout est éteint | Everything is off | Maison banner after Tout éteindre; the rooms summary « tout éteint » → “everything off” |
| Énergie et réseau | Energy and grid | Maison's energy column |
| Programme d’aujourd’hui | Today’s schedule | Maison widget: one day bar per room; « en pause » → “paused”, « dernier connu » → “last known” |
| Demain / Hier (Maison) | Tomorrow / Yesterday | Energy-column widgets; « Octobre, jusqu’au 15 » → “October, to the 15th”, « fin du mois » → “by month end” |
| Températures du programme | Schedule temperatures | Room sheet group (Confort, Éco, Modifier les horaires) |
| Programme, températures, radiateurs | Schedule, temperatures, radiators | The phone room sheet's row that unfolds the rest |
| Remettre en programme | Back to the schedule | Room sheet, when the room is off |
| actuellement 19,6 °C | now 19.6 °C | The room sheet's caption under the setpoint (« Confort · actuellement … ») |
| Toute la maison | Whole home | |
| Réglages | Settings | The page at `/home` and its sub-pages since Tableau (was « Maison »); breadcrumbs « Réglages › Linky » → “Settings › Linky”. Its « Affichage » → “Display” (language, technical details; no theme: dark only); account and server are « Compte » → “Account” |
| Sources de données | Data sources | Réglages › Sources de données (Cozytouch, Linky, RTE EcoWatt, Tempo) |
| Nouveau prix… | New price… | Tarif: opens the editor |
| Tarif en vigueur | Current tariff | « Corriger le tarif en vigueur » → “Correct the current tariff”; « Heures creuses / pleines » (option) → “Off-peak / peak” |
| Afficher / Masquer (PDL) | Show / Hide | « Modifier la connexion » → “Change connection” |
| Box Cozytouch / Pont radio (io-homecontrol) / Wi-Fi de la box | Cozytouch box / Radio bridge (io-homecontrol) / Box Wi-Fi | Pièces et appareils: plain names; Pod, IOStack, Wifi only in the raw details |
| Voir les appareils (6) / Faire clignoter | Show devices (6) / Make it blink | Radiator « ⋯ » menu; « Actions pour … » → “Actions for …” |
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
| Faire clignoter / clignotement | Blink | The button and the pending label (« Salon : clignotement » → “Salon: blink”); « identification » is the backend's execution label only |
| Radiateur(s) | Radiator(s) | The upstream default name « Radiateur » is device data, never translated |
| Détails / Historique / Aujourd’hui / Réglage | Details / History / Today / Controls | « Infos » is the radiator’s Details section (Infos / Details) |
| Intensité (veilleuse) | Brightness | |
| Dernier signal | Last signal | The last event a radiator sent |
| Dernière mesure : 23,6 °C à 14:31 | Last reading: 23.6 °C at 14:31 | An offline room's panel only |
| Modifier les horaires | Edit schedule | Room panel → Programme |
| Masquer (une alerte) | Dismiss | |
| Accès MCP | MCP access | Réglages › Compte; « Créer un jeton » → “Create a token”, « Révoquer » → “Revoke”. MCP, Claude Code and Claude Desktop are never translated |
| Jeton MCP | MCP token | Shown once at creation |
| Assistant IA | AI assistant | |
| Appareils connectés | Signed-in devices | Réglages › Compte (Settings › Account); « Déconnecter » → “Sign out”, « Déconnecter les autres appareils » → “Sign out other devices” |
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
| Synchro / Synchroniser / Synchronisations : 1 sur 3 en 24 h | Sync / Sync / Syncs: 1 of 3 in 24 h | A full read of the Cozytouch setup; « lecture complète » left the UI |
| En ligne / Hors ligne (appareils) | Online / Offline | A radiator's or a box device's reachability (Pièces et appareils, the radiator's Infos); « Joignable » left the UI |
| Injoignable / Connecté | Unreachable / Connected | Cozytouch itself only (sidebar, Sources). A status word. In a sentence, « Cozytouch injoignable » / « Kelvin est injoignable » → “Can’t reach Cozytouch” / “Can’t reach Kelvin” (one phrasing everywhere) |
| Limite de requêtes Cozytouch atteinte | Cozytouch request limit reached | The quota condition, one phrasing everywhere (never “rate limit”) |
| à l’instant / il y a 5 min | just now / 5 min ago | |
| Aujourd’hui / demain / la veille | Today / tomorrow / the previous day | |
| Jour / Semaine / Mois / Année | Day / Week / Month / Year | |
| 24 h / 7 j / 30 j | 24 h / 7 d / 30 d | |
| Linky, Enedis, MyElectricalData, Cozytouch, PDL | unchanged | Proper nouns |

## More terms

| French | English |
|---|---|
| Pointe | Max power (never “Peak”, which is HP) |
| Consommation de fond (was Talon) | Baseload |
| Jour Tempo Bleu / Blanc / Rouge | Tempo Blue / White / Red day |
| Option tarifaire | Tariff option |
| Base | Base |
| HC/HP (option) | Off-peak / peak | One English name for the option everywhere (form, summary, Énergie); the French form keeps the compact « HC/HP » in the option picker |
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
| Nouvelle alerte · Afficher · Mettre à jour (les alertes) | New alert · Show · Update (the alerts) |
| Budget mensuel | Monthly budget |
| Rythme | Pace |
| Degré-jour (DJU) | Degree day (HDD) |
| Dehors | Outside | The outdoor temperature: the Maison chip « Dehors 4,2 °C » → “Outside 4.2 °C”, the chart legend |
| Météo (Réglages) | Weather | The Réglages page and card; « Météo désactivée » → “Weather off” |
| Ressenti | Feels like | Apparent temperature |
| Humidité | Humidity | |
| à météo égale | weather-adjusted | « −8 % à météo égale » → “−8% weather-adjusted” |
| DJU (base 18 °C) | HDD (base 18 °C) | Heating degree days; the existing « Degré-jour (DJU) » row stays |
| Prévu (température) | Expected | « max. prévu 9,8 °C vers 15:00 » → “max expected 9.8 °C around 15:00” |
| Lieu | Place | Réglages › Météo |
| Modèle (météo) | Model | « Météo-France AROME HD » is a proper name, never translated |
| Appareils | Devices |
| Pont Cozytouch | Cozytouch bridge |
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
| Afficher les détails techniques / Détails techniques | Show technical details / Technical details | The per-device preference; « Fiche » is internal only, never shown |
| Source / Relevé / Nature | Source / Reading / Kind | A Fiche's Provenance block |
| mesuré / estimé / projection / calculé / publié | measured / estimated / projected / calculated / published | Nature of a figure; « publié » for Tempo and EcoWatt as RTE/EDF gave them |
| Calcul Kelvin / Votre tarif | Kelvin’s calculation / Your tariff | Sources of computed figures |
| Hors connexion · données de 21:14 | Offline · data from 21:14 | Neutral banner (browser offline) |
| Kelvin ne répond pas | Kelvin hasn’t answered | Banner after 3 min without Kelvin |
| Cette page n’existe pas | This page doesn’t exist | 404 |
| Aller aux pièces | Go to rooms | 404 and error pages |
| Plus d’actions | More actions | A « ⋯ » menu's default name |
| Non réparti | Not split | Énergie bars: a day with no off-peak/peak split beside split days (series-1) |
| Journée | Whole day | The Courbe readout at rest (the day as a whole) |
| Mois complet | Full month | Énergie key figure: the current month projected |
| Exporter | Export | Énergie's export menu |
| Où part l’énergie | Where the energy goes | Énergie: heating share and rooms ranked by kWh |
| Analyse / Détails | Analysis / Details | Énergie's summary cards and their L2 disclosure |
| Compteur interne 1 / 2 du radiateur | Radiator’s internal meter 1 / 2 | The radiator's own registers (was « Registre 1 / 2 »; never HC/HP) |
| tout est mesuré | all measured | Qualité des données meta |

## Tone

Errors say what happened, then what to do, in two short sentences or a colon: « Cozytouch injoignable.
Réessayez dans un instant. » → “Can’t reach Cozytouch. Try again in a moment.”; « Connexion perdue :
résultat inconnu. Vérifiez la pièce. » → “Connection lost: result unknown. Check the room.”
Buttons and links are infinitives in French (« Renseigner le tarif », « Ouvrir Linky ») and plain
imperatives in English (“Add your tariff”, “Open Linky”).

French uses « vous » and imperatives (« Collez le jeton »). English uses plain imperatives (“Paste
your token”) and contractions in sentences (“can’t”, “isn’t”), not in labels. Both use sentence case.
