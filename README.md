# D&D Character Tracker for Obsidian

An interactive **Dungeons & Dragons 5e** character sheet and party tracker plugin for [Obsidian](https://obsidian.md).

Render live, interactive character sheets directly inside your Markdown notes using a ```` ```dnd-character ```` code block, or track your entire party from the **D&D Party Tracker** sidebar view. Every HP adjustment, spell slot expenditure, rest, inventory edit, and condition toggle persists automatically back into your note.

---

## Features

- **Interactive Character Sheets (`dnd-character` code blocks)**:
  - **Combat Vitals**: Live HP progress bar, Damage / Heal / Temporary HP buttons (automatically absorbs damage via Temp HP first), Death Saving Throw pips & roller when at 0 HP, Armor Class, Initiative roller, Speed, Proficiency Bonus, Passive Perception, and Hit Dice roller.
  - **Concentration & Conditions**: Track active concentration spells (automatically calculates and alerts the **CON Save DC** `max(10, floor(damage / 2))` when taking damage!) and toggle standard 5e conditions.
  - **Abilities, Saves & 18 Skills**: Click any ability modifier, saving throw, or skill to roll a `1d20` check with **Normal**, **Advantage**, or **Disadvantage** mode. Click skill pips (`○` → `●` → `◆`) to cycle Unproficient, Proficient, and Expertise (`2×` proficiency).
  - **Actions & Class Resources**: Track custom resources (Bardic Inspiration, Ki, Rage, Action Surge, Channel Divinity) with clickable pips and automatic Short / Long Rest recovery, plus weapon attacks with 1-click **To Hit** and **Damage** rolls.
  - **Spellcasting**: Auto-computes **Spell Save DC** (`8 + Prof + Mod`) and **Spell Attack Bonus**, tracks Level 1–9 spell slot pools with clickable pips, and casts cantrips or leveled spells (automatically spending a slot and updating active concentration).
  - **Inventory, Currency & Encumbrance**: Track `PP / GP / EP / SP / CP`, equipment quantities, equipped state, and carrying capacity (`15 × STR`).
  - **Short & Long Rests**: 1-click **Short Rest** (spends Hit Dice and resets short-rest features) and **Long Rest** (restores full HP, clears Temp HP, restores all spell slots, regains half max Hit Dice, and resets long-rest resources).
- **D&D Party Tracker Sidebar**:
  - View all characters across your vault in one sidebar panel with quick HP adjustments (`-1`, `-5`, `+5`), Initiative rolling, Passive Perception, AC, active Conditions/Concentration, and 1-click **Party Long Rest**.
- **Character Creator & Class Presets**:
  - Create a new character note or insert a character block from starter 5e class presets (**Fighter**, **Wizard**, **Rogue**, **Cleric**, **Bard**) with a built-in **4d6 drop lowest** ability score roller.

---

## Usage

### 1. Create a Character
Open the Command Palette (`Cmd/Ctrl + P`) and run:
- **`D&D Character Tracker: Create new D&D character note`** — creates a new character note in your configured `Characters` folder.
- **`D&D Character Tracker: Insert D&D character sheet block in current note`** — inserts a ```` ```dnd-character ```` block at your cursor.
- Or click the **Shield** icon in the left ribbon to open the **D&D Party Tracker** sidebar and click **`+ Character`**.

### 2. Code Block Format
Character state is stored as clean, human-readable JSON inside a `dnd-character` code block:

````markdown
```dnd-character
{
  "name": "Lyra Vane",
  "race": "Half-Elf",
  "className": "Bard",
  "subclass": "College of Lore",
  "level": 3,
  "background": "Entertainer",
  "ac": 14,
  "speed": 30,
  "hp": { "current": 24, "max": 24, "temp": 0 },
  "hitDice": { "die": "d8", "current": 3, "max": 3 },
  "abilities": { "str": 8, "dex": 14, "con": 14, "int": 12, "wis": 10, "cha": 16 },
  "saveProficiencies": ["dex", "cha"],
  "skills": { "performance": 2, "persuasion": 2, "acrobatics": 1, "deception": 1, "insight": 1 },
  "jackOfAllTrades": true,
  "spellcastingAbility": "cha",
  "spellSlots": {
    "1": { "max": 4, "used": 0 },
    "2": { "max": 2, "used": 0 }
  }
}
```
````

---

## Development

Built with [Bun](https://bun.sh) and TypeScript:

```bash
# Install dependencies
bun install

# Typecheck and run unit tests
bun run typecheck
bun test

# Build main.js for Obsidian
bun run build
```

---

## License

[GPL-3.0-only](./LICENSE)
