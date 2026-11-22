export type AbilityKey = "str" | "dex" | "con" | "int" | "wis" | "cha";

export const ABILITIES: { key: AbilityKey; label: string; short: string }[] = [
	{ key: "str", label: "Strength", short: "STR" },
	{ key: "dex", label: "Dexterity", short: "DEX" },
	{ key: "con", label: "Constitution", short: "CON" },
	{ key: "int", label: "Intelligence", short: "INT" },
	{ key: "wis", label: "Wisdom", short: "WIS" },
	{ key: "cha", label: "Charisma", short: "CHA" },
];

export type SkillKey =
	| "acrobatics"
	| "animal_handling"
	| "arcana"
	| "athletics"
	| "deception"
	| "history"
	| "insight"
	| "intimidation"
	| "investigation"
	| "medicine"
	| "nature"
	| "perception"
	| "performance"
	| "persuasion"
	| "religion"
	| "sleight_of_hand"
	| "stealth"
	| "survival";

export const SKILLS: { key: SkillKey; label: string; ability: AbilityKey }[] = [
	{ key: "acrobatics", label: "Acrobatics", ability: "dex" },
	{ key: "animal_handling", label: "Animal Handling", ability: "wis" },
	{ key: "arcana", label: "Arcana", ability: "int" },
	{ key: "athletics", label: "Athletics", ability: "str" },
	{ key: "deception", label: "Deception", ability: "cha" },
	{ key: "history", label: "History", ability: "int" },
	{ key: "insight", label: "Insight", ability: "wis" },
	{ key: "intimidation", label: "Intimidation", ability: "cha" },
	{ key: "investigation", label: "Investigation", ability: "int" },
	{ key: "medicine", label: "Medicine", ability: "wis" },
	{ key: "nature", label: "Nature", ability: "int" },
	{ key: "perception", label: "Perception", ability: "wis" },
	{ key: "performance", label: "Performance", ability: "cha" },
	{ key: "persuasion", label: "Persuasion", ability: "cha" },
	{ key: "religion", label: "Religion", ability: "int" },
	{ key: "sleight_of_hand", label: "Sleight of Hand", ability: "dex" },
	{ key: "stealth", label: "Stealth", ability: "dex" },
	{ key: "survival", label: "Survival", ability: "wis" },
];

export const STANDARD_CONDITIONS = [
	"Blinded",
	"Charmed",
	"Deafened",
	"Exhaustion",
	"Frightened",
	"Grappled",
	"Incapacitated",
	"Invisible",
	"Paralyzed",
	"Petrified",
	"Poisoned",
	"Prone",
	"Restrained",
	"Stunned",
	"Unconscious",
];

export type ProficiencyRank = 0 | 1 | 2; // 0 = none, 1 = proficient, 2 = expertise

export interface SpellSlotPool {
	max: number;
	used: number;
}

export interface ClassResource {
	id: string;
	name: string;
	current: number;
	max: number;
	resetOn: "short" | "long" | "manual";
	die?: string;
}

export interface AttackEntry {
	id: string;
	name: string;
	attackBonus: number;
	damage: string;
	damageType: string;
	range?: string;
	notes?: string;
}

export interface SpellEntry {
	id: string;
	name: string;
	level: number; // 0 = cantrip, 1..9
	prepared: boolean;
	concentration?: boolean;
	ritual?: boolean;
	notes?: string;
}

export interface InventoryItem {
	id: string;
	name: string;
	qty: number;
	weight: number;
	equipped: boolean;
	attuned?: boolean;
	notes?: string;
}

export interface Currency {
	cp: number;
	sp: number;
	ep: number;
	gp: number;
	pp: number;
}

export interface DeathSaves {
	successes: number; // 0..3
	failures: number; // 0..3
}

export interface DndCharacter {
	name: string;
	race: string;
	className: string;
	subclass?: string;
	level: number;
	background: string;
	alignment?: string;
	xp?: number;

	// Combat & Vitals
	ac: number;
	initiativeBonus?: number;
	speed: number;
	inspiration: boolean;
	hp: {
		current: number;
		max: number;
		temp: number;
	};
	hitDice: {
		die: string; // e.g., "d8", "d10"
		current: number;
		max: number;
	};
	deathSaves: DeathSaves;

	// Abilities & Proficiencies
	abilities: Record<AbilityKey, number>;
	saveProficiencies: AbilityKey[];
	skills: Partial<Record<SkillKey, ProficiencyRank>> & Record<string, ProficiencyRank>;
	jackOfAllTrades?: boolean;

	// Conditions & Concentration
	conditions: string[];
	concentration?: string;

	// Spellcasting
	spellcastingAbility?: AbilityKey | "";
	spellSlots: Record<string, SpellSlotPool>; // "1".."9"
	spells: SpellEntry[];

	// Actions, Resources & Equipment
	attacks: AttackEntry[];
	resources: ClassResource[];
	inventory: InventoryItem[];
	currency: Currency;
	features?: string;
	notes?: string;

	/** Unrecognized homebrew / custom fields are preserved verbatim on save. */
	[extra: string]: unknown;
}

export interface DndPluginSettings {
	charactersFolder: string;
	showDiceNotices: boolean;
	logRollsToConsole: boolean;
	defaultAbilityMethod: "standard" | "pointbuy";
}

export const DEFAULT_SETTINGS: DndPluginSettings = {
	charactersFolder: "Characters",
	showDiceNotices: true,
	logRollsToConsole: false,
	defaultAbilityMethod: "standard",
};
