#!/usr/bin/env bash
# Downloads the class and specialization icons used by the admin site into web/public/icons.
# Run once; the images are committed so the site never depends on an external server.
# Icons are Blizzard Entertainment assets (World of Warcraft), served here for guild tooling.
set -u
CDN="https://wow.zamimg.com/images/wow/icons/medium"
OUT="$(dirname "$0")/../web/public/icons"

# file slug (class-spec, as built by specIcon() in src/domain/wow.ts) -> icon name on the CDN
SPEC_ICONS="
warrior-arms ability_warrior_savageblow
warrior-fury ability_warrior_innerrage
warrior-protection ability_warrior_defensivestance
paladin-holy spell_holy_holybolt
paladin-protection ability_paladin_shieldofthetemplar
paladin-retribution spell_holy_auraoflight
hunter-beast_mastery ability_hunter_bestialdiscipline
hunter-marksmanship ability_hunter_focusedaim
hunter-survival ability_hunter_camouflage
rogue-assassination ability_rogue_eviscerate
rogue-outlaw ability_rogue_waylay
rogue-subtlety ability_stealth
priest-discipline spell_holy_powerwordshield
priest-holy spell_holy_guardianspirit
priest-shadow spell_shadow_shadowwordpain
deathknight-blood spell_deathknight_bloodpresence
deathknight-frost spell_deathknight_frostpresence
deathknight-unholy spell_deathknight_unholypresence
shaman-elemental spell_nature_lightning
shaman-enhancement spell_shaman_improvedstormstrike
shaman-restoration spell_nature_magicimmunity
mage-arcane spell_holy_magicalsentry
mage-fire spell_fire_firebolt02
mage-frost spell_frost_frostbolt02
warlock-affliction spell_shadow_deathcoil
warlock-demonology spell_shadow_metamorphosis
warlock-destruction spell_shadow_rainoffire
monk-brewmaster spell_monk_brewmaster_spec
monk-mistweaver spell_monk_mistweaver_spec
monk-windwalker spell_monk_windwalker_spec
druid-balance spell_nature_starfall
druid-feral ability_druid_catform
druid-guardian ability_racial_bearform
druid-restoration spell_nature_healingtouch
demonhunter-havoc ability_demonhunter_specdps
demonhunter-vengeance ability_demonhunter_spectank
demonhunter-devourer classicon_demonhunter
evoker-devastation classicon_evoker_devastation
evoker-preservation classicon_evoker_preservation
evoker-augmentation classicon_evoker_augmentation
"
CLASSES="warrior paladin hunter rogue priest deathknight shaman mage warlock monk druid demonhunter evoker"

fetch() { # <icon name> <destination>
  curl -fsS -m 30 -o "$2" "$CDN/$1.jpg" 2>/dev/null && echo "ok   $2" || { echo "FAIL $1 -> $2"; rm -f "$2"; return 1; }
}

echo "$SPEC_ICONS" | while read -r slug icon; do
  [ -n "$slug" ] && fetch "$icon" "$OUT/spec/$slug.jpg"
done
for c in $CLASSES; do fetch "classicon_$c" "$OUT/class/$c.jpg"; done
