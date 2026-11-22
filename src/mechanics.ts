import {
	ABILITIES,
	type AbilityKey,
	type DndCharacter,
	type ProficiencyRank,
	SKILLS,
	type SkillKey,
} from "./types";

/**
 * Compute 5e ability modifier: floor((score - 10) / 2)
 */
export function abilityModifier(score: number): number {
	return Math.floor((score - 10) / 2);
}

/**
 * Format signed modifier string (e.g., "+3", "-1", "+0")
 */
export function formatModifier(mod: number): string {
	return mod >= 0 ? `+${mod}` : `${mod}`;
}

/**
 * Compute 5e proficiency bonus from character level (1-20)
 */
export function proficiencyBonus(level: number): number {
	const clamped = Math.max(1, Math.min(20, Math.floor(level || 1)));
	return Math.ceil(clamped / 4) + 1;
}

/**
 * Compute saving throw modifier for a character
 */
export function savingThrowModifier(char: DndCharacter, ability: AbilityKey): number {
	const base = abilityModifier(char.abilities[ability] ?? 10);
	const isProf = char.saveProficiencies.includes(ability);
	return base + (isProf ? proficiencyBonus(char.level) : 0);
}

/**
 * Compute skill check modifier for a character
 */
export function skillModifier(char: DndCharacter, skillKey: SkillKey): number {
	const skillDef = SKILLS.find((s) => s.key === skillKey);
	const ability: AbilityKey = skillDef ? skillDef.ability : "int";
	const base = abilityModifier(char.abilities[ability] ?? 10);
	const rank: ProficiencyRank = char.skills[skillKey] ?? 0;
	const pb = proficiencyBonus(char.level);

	if (rank === 2) return base + pb * 2;
	if (rank === 1) return base + pb;
	if (char.jackOfAllTrades) return base + Math.floor(pb / 2);
	return base;
}

/**
 * Compute passive score (e.g. Passive Perception = 10 + perception modifier)
 */
export function passiveScore(char: DndCharacter, skillKey: SkillKey): number {
	return 10 + skillModifier(char, skillKey);
}

/**
 * Compute initiative modifier
 */
export function initiativeModifier(char: DndCharacter): number {
	return abilityModifier(char.abilities.dex ?? 10) + (char.initiativeBonus ?? 0);
}

/**
 * Compute spell save DC and spell attack bonus if character has a spellcasting ability
 */
export function spellcastingStats(char: DndCharacter): {
	ability: AbilityKey;
	saveDC: number;
	attackBonus: number;
} | null {
	if (!char.spellcastingAbility) return null;
	const ability = char.spellcastingAbility;
	const mod = abilityModifier(char.abilities[ability] ?? 10);
	const pb = proficiencyBonus(char.level);
	return {
		ability,
		saveDC: 8 + pb + mod,
		attackBonus: pb + mod,
	};
}

/**
 * Apply damage to a character following 5e Temporary HP rules.
 * Also returns whether a concentration check is triggered and its DC.
 */
export function applyDamage(
	char: DndCharacter,
	amount: number,
): {
	tempAbsorbed: number;
	hpLost: number;
	concentrationDC: number | null;
} {
	const dmg = Math.max(0, Math.floor(amount));
	if (dmg === 0) {
		return { tempAbsorbed: 0, hpLost: 0, concentrationDC: null };
	}

	const tempAbsorbed = Math.min(char.hp.temp, dmg);
	char.hp.temp -= tempAbsorbed;

	const remaining = dmg - tempAbsorbed;
	const hpLost = Math.min(char.hp.current, remaining);
	char.hp.current = Math.max(0, char.hp.current - remaining);

	// Reset death saves if still above 0
	if (char.hp.current > 0) {
		char.deathSaves = { successes: 0, failures: 0 };
	}

	const concentrationDC = char.concentration
		? Math.max(10, Math.floor(dmg / 2))
		: null;

	return { tempAbsorbed, hpLost, concentrationDC };
}

/**
 * Apply healing to a character (clamped at max HP, resets death saves).
 */
export function applyHealing(char: DndCharacter, amount: number): number {
	const heal = Math.max(0, Math.floor(amount));
	if (heal === 0) return 0;

	const before = char.hp.current;
	char.hp.current = Math.min(char.hp.max, char.hp.current + heal);
	if (char.hp.current > 0) {
		char.deathSaves = { successes: 0, failures: 0 };
	}
	return char.hp.current - before;
}

/**
 * Set temporary HP following 5e non-stacking rules (keeps higher unless forced).
 */
export function applyTempHp(char: DndCharacter, amount: number, force = true): void {
	const val = Math.max(0, Math.floor(amount));
	char.hp.temp = force ? val : Math.max(char.hp.temp, val);
}

/**
 * Perform a Short Rest:
 * - Resets resources with resetOn === "short"
 * - Optionally spends hit dice and rolls healing
 */
export function takeShortRest(
	char: DndCharacter,
	hitDiceToSpend = 0,
): {
	hitDiceSpent: number;
	hpHealed: number;
	rolls: number[];
	resourcesReset: string[];
} {
	const toSpend = Math.max(0, Math.min(char.hitDice.current, Math.floor(hitDiceToSpend)));
	const dieSides = Number.parseInt(char.hitDice.die.replace(/^[dD]/, ""), 10) || 8;
	const conMod = abilityModifier(char.abilities.con ?? 10);

	const rolls: number[] = [];
	let totalHeal = 0;

	for (let i = 0; i < toSpend; i++) {
		const roll = Math.floor(Math.random() * dieSides) + 1;
		const gained = Math.max(0, roll + conMod);
		rolls.push(roll);
		totalHeal += gained;
	}

	char.hitDice.current -= toSpend;
	const hpHealed = applyHealing(char, totalHeal);

	const resourcesReset: string[] = [];
	for (const res of char.resources) {
		if (res.resetOn === "short" && res.current < res.max) {
			res.current = res.max;
			resourcesReset.push(res.name);
		}
	}

	return {
		hitDiceSpent: toSpend,
		hpHealed,
		rolls,
		resourcesReset,
	};
}

/**
 * Perform a Long Rest:
 * - Restores full HP, clears temp HP, resets death saves
 * - Restores all spell slots
 * - Restores up to half of max hit dice (minimum 1)
 * - Resets all "short" and "long" rest resources
 */
export function takeLongRest(char: DndCharacter): {
	hpRestored: number;
	hitDiceRestored: number;
	resourcesReset: string[];
} {
	const hpRestored = Math.max(0, char.hp.max - char.hp.current);
	char.hp.current = char.hp.max;
	char.hp.temp = 0;
	char.deathSaves = { successes: 0, failures: 0 };

	const maxHd = Math.max(1, char.hitDice.max || char.level);
	const regain = Math.max(1, Math.floor(maxHd / 2));
	const beforeHd = char.hitDice.current;
	char.hitDice.max = maxHd;
	char.hitDice.current = Math.min(maxHd, char.hitDice.current + regain);
	const hitDiceRestored = char.hitDice.current - beforeHd;

	for (const pool of Object.values(char.spellSlots)) {
		pool.used = 0;
	}

	const resourcesReset: string[] = [];
	for (const res of char.resources) {
		if ((res.resetOn === "long" || res.resetOn === "short") && res.current < res.max) {
			res.current = res.max;
			resourcesReset.push(res.name);
		}
	}

	return {
		hpRestored,
		hitDiceRestored,
		resourcesReset,
	};
}

export interface DiceRollResult {
	formula: string;
	rolls: number[];
	keptRolls: number[];
	modifier: number;
	total: number;
	isCriticalHit: boolean;
	isCriticalFail: boolean;
	mode: "normal" | "advantage" | "disadvantage";
}

/**
 * Roll a d20 check with normal / advantage / disadvantage
 */
export function rollD20(
	modifier = 0,
	mode: "normal" | "advantage" | "disadvantage" = "normal",
	rng: () => number = Math.random,
): DiceRollResult {
	const r1 = Math.floor(rng() * 20) + 1;
	const r2 = Math.floor(rng() * 20) + 1;

	let kept: number;
	let rolls: number[];
	if (mode === "advantage") {
		kept = Math.max(r1, r2);
		rolls = [r1, r2];
	} else if (mode === "disadvantage") {
		kept = Math.min(r1, r2);
		rolls = [r1, r2];
	} else {
		kept = r1;
		rolls = [r1];
	}

	const modStr = modifier === 0 ? "" : formatModifier(modifier);
	const prefix = mode === "advantage" ? "2d20kh1" : mode === "disadvantage" ? "2d20kl1" : "1d20";

	return {
		formula: `${prefix}${modStr}`,
		rolls,
		keptRolls: [kept],
		modifier,
		total: kept + modifier,
		isCriticalHit: kept === 20,
		isCriticalFail: kept === 1,
		mode,
	};
}

/**
 * Parse and roll arbitrary dice expressions such as "2d6+3", "1d8-1", "4d6", "d20+5"
 */
export function rollFormula(
	formula: string,
	rng: () => number = Math.random,
): DiceRollResult | null {
	const cleaned = formula.trim().replace(/\s+/g, "");
	const match = /^(\d*)d(\d+)([+-]\d+)?$/i.exec(cleaned);
	if (!match) return null;

	const count = match[1] ? Number.parseInt(match[1], 10) : 1;
	const sides = Number.parseInt(match[2]!, 10);
	const modifier = match[3] ? Number.parseInt(match[3], 10) : 0;

	if (count <= 0 || count > 100 || sides <= 0 || sides > 1000) return null;

	const rolls: number[] = [];
	let sum = 0;
	for (let i = 0; i < count; i++) {
		const r = Math.floor(rng() * sides) + 1;
		rolls.push(r);
		sum += r;
	}

	return {
		formula: `${count}d${sides}${modifier === 0 ? "" : formatModifier(modifier)}`,
		rolls,
		keptRolls: rolls,
		modifier,
		total: sum + modifier,
		isCriticalHit: count === 1 && sides === 20 && rolls[0] === 20,
		isCriticalFail: count === 1 && sides === 20 && rolls[0] === 1,
		mode: "normal",
	};
}

/**
 * Compute total carried weight in lbs and encumbrance limit (15 * STR)
 */
export function encumbranceStats(char: DndCharacter): {
	totalWeight: number;
	maxCarry: number;
	isEncumbered: boolean;
} {
	const totalWeight = char.inventory.reduce(
		(acc, item) => acc + (Number(item.weight) || 0) * (Number(item.qty) || 0),
		0,
	);
	const strScore = char.abilities.str ?? 10;
	const maxCarry = strScore * 15;
	return {
		totalWeight: Math.round(totalWeight * 100) / 100,
		maxCarry,
		isEncumbered: totalWeight > maxCarry,
	};
}

/**
 * Create a clean default character object
 */
export function createDefaultCharacter(overrides?: Partial<DndCharacter>): DndCharacter {
	const level = overrides?.level ?? 1;
	const base: DndCharacter = {
		name: "New Adventurer",
		race: "Human",
		className: "Fighter",
		subclass: "",
		level,
		background: "Soldier",
		alignment: "Neutral Good",
		xp: 0,
		ac: 16,
		initiativeBonus: 0,
		speed: 30,
		inspiration: false,
		hp: {
			current: 12,
			max: 12,
			temp: 0,
		},
		hitDice: {
			die: "d10",
			current: level,
			max: level,
		},
		deathSaves: {
			successes: 0,
			failures: 0,
		},
		abilities: {
			str: 16,
			dex: 14,
			con: 14,
			int: 10,
			wis: 12,
			cha: 8,
		},
		saveProficiencies: ["str", "con"],
		skills: {
			athletics: 1,
			intimidation: 1,
			perception: 1,
			survival: 1,
		},
		jackOfAllTrades: false,
		conditions: [],
		concentration: "",
		spellcastingAbility: "",
		spellSlots: {},
		spells: [],
		attacks: [
			{
				id: "atk-1",
				name: "Longsword",
				attackBonus: 5,
				damage: "1d8+3",
				damageType: "slashing",
				range: "5 ft.",
				notes: "Versatile (1d10)",
			},
		],
		resources: [
			{
				id: "res-1",
				name: "Second Wind",
				current: 1,
				max: 1,
				resetOn: "short",
				die: "1d10",
			},
		],
		inventory: [
			{
				id: "item-1",
				name: "Chain Mail",
				qty: 1,
				weight: 55,
				equipped: true,
				notes: "AC 16",
			},
			{
				id: "item-2",
				name: "Longsword",
				qty: 1,
				weight: 3,
				equipped: true,
				notes: "Versatile (1d10)",
			},
			{
				id: "item-3",
				name: "Explorer's Pack",
				qty: 1,
				weight: 10,
				equipped: false,
			},
		],
		currency: {
			cp: 0,
			sp: 0,
			ep: 0,
			gp: 15,
			pp: 0,
		},
		features: "Fighting Style (Defense), Second Wind",
		notes: "",
	};

	return {
		...base,
		...overrides,
		hp: { ...base.hp, ...(overrides?.hp ?? {}) },
		hitDice: { ...base.hitDice, ...(overrides?.hitDice ?? {}) },
		deathSaves: { ...base.deathSaves, ...(overrides?.deathSaves ?? {}) },
		abilities: { ...base.abilities, ...(overrides?.abilities ?? {}) },
		currency: { ...base.currency, ...(overrides?.currency ?? {}) },
	};
}

/**
 * Normalize and validate an arbitrary parsed JSON object into a valid DndCharacter
 */
export function normalizeCharacter(raw: unknown): DndCharacter {
	const def = createDefaultCharacter();
	if (!raw || typeof raw !== "object") return def;
	const obj = raw as Record<string, unknown>;

	const level = Math.max(1, Math.min(20, Number(obj.level) || def.level));
	const rawHp = (obj.hp && typeof obj.hp === "object" ? obj.hp : {}) as Record<string, unknown>;
	const maxHp = Math.max(1, Number(rawHp.max) || def.hp.max);
	const currentHp = Math.max(0, Math.min(maxHp, Number(rawHp.current ?? maxHp)));
	const tempHp = Math.max(0, Number(rawHp.temp) || 0);

	const rawHd = (obj.hitDice && typeof obj.hitDice === "object" ? obj.hitDice : {}) as Record<
		string,
		unknown
	>;
	const hdMax = Math.max(1, Number(rawHd.max) || level);
	const hdCur = Math.max(0, Math.min(hdMax, Number(rawHd.current ?? hdMax)));

	const rawDs = (
		obj.deathSaves && typeof obj.deathSaves === "object" ? obj.deathSaves : {}
	) as Record<string, unknown>;

	const rawAb = (
		obj.abilities && typeof obj.abilities === "object" ? obj.abilities : {}
	) as Record<string, unknown>;
	const abilities: Record<AbilityKey, number> = {
		str: Number(rawAb.str) || def.abilities.str,
		dex: Number(rawAb.dex) || def.abilities.dex,
		con: Number(rawAb.con) || def.abilities.con,
		int: Number(rawAb.int) || def.abilities.int,
		wis: Number(rawAb.wis) || def.abilities.wis,
		cha: Number(rawAb.cha) || def.abilities.cha,
	};

	const validAbilityKeys = new Set<string>(ABILITIES.map((a) => a.key));
	const saveProficiencies: AbilityKey[] = Array.isArray(obj.saveProficiencies)
		? obj.saveProficiencies.filter(
				(k): k is AbilityKey => typeof k === "string" && validAbilityKeys.has(k),
			)
		: def.saveProficiencies;

	const rawSkills = (obj.skills && typeof obj.skills === "object" ? obj.skills : {}) as Record<
		string,
		unknown
	>;
	const skills: Partial<Record<SkillKey, ProficiencyRank>> = {};
	for (const s of SKILLS) {
		const v = Number(rawSkills[s.key]);
		if (v === 1 || v === 2) {
			skills[s.key] = v;
		}
	}

	const rawSlots = (
		obj.spellSlots && typeof obj.spellSlots === "object" ? obj.spellSlots : {}
	) as Record<string, unknown>;
	const spellSlots: Record<string, { max: number; used: number }> = {};
	for (let lvl = 1; lvl <= 9; lvl++) {
		const key = String(lvl);
		const entry = rawSlots[key];
		if (entry && typeof entry === "object") {
			const e = entry as Record<string, unknown>;
			const max = Math.max(0, Number(e.max) || 0);
			const used = Math.max(0, Math.min(max, Number(e.used) || 0));
			if (max > 0) {
				spellSlots[key] = { max, used };
			}
		}
	}

	const rawCur = (
		obj.currency && typeof obj.currency === "object" ? obj.currency : {}
	) as Record<string, unknown>;

	return {
		name: typeof obj.name === "string" && obj.name.trim() ? obj.name.trim() : def.name,
		race: typeof obj.race === "string" ? obj.race : def.race,
		className: typeof obj.className === "string" ? obj.className : def.className,
		subclass: typeof obj.subclass === "string" ? obj.subclass : "",
		level,
		background: typeof obj.background === "string" ? obj.background : def.background,
		alignment: typeof obj.alignment === "string" ? obj.alignment : "",
		xp: Number(obj.xp) || 0,
		ac: Number(obj.ac) || def.ac,
		initiativeBonus: Number(obj.initiativeBonus) || 0,
		speed: Number(obj.speed) || 30,
		inspiration: Boolean(obj.inspiration),
		hp: {
			current: currentHp,
			max: maxHp,
			temp: tempHp,
		},
		hitDice: {
			die: typeof rawHd.die === "string" && rawHd.die ? rawHd.die : def.hitDice.die,
			current: hdCur,
			max: hdMax,
		},
		deathSaves: {
			successes: Math.max(0, Math.min(3, Number(rawDs.successes) || 0)),
			failures: Math.max(0, Math.min(3, Number(rawDs.failures) || 0)),
		},
		abilities,
		saveProficiencies,
		skills,
		jackOfAllTrades: Boolean(obj.jackOfAllTrades),
		conditions: Array.isArray(obj.conditions)
			? obj.conditions.filter((c): c is string => typeof c === "string" && c.trim().length > 0)
			: [],
		concentration: typeof obj.concentration === "string" ? obj.concentration : "",
		spellcastingAbility:
			typeof obj.spellcastingAbility === "string" &&
			validAbilityKeys.has(obj.spellcastingAbility)
				? (obj.spellcastingAbility as AbilityKey)
				: "",
		spellSlots,
		spells: Array.isArray(obj.spells)
			? obj.spells
					.filter((s): s is Record<string, unknown> => Boolean(s && typeof s === "object"))
					.map((s, idx) => ({
						id: typeof s.id === "string" ? s.id : `sp-${idx + 1}`,
						name: typeof s.name === "string" ? s.name : "Unnamed Spell",
						level: Math.max(0, Math.min(9, Number(s.level) || 0)),
						prepared: Boolean(s.prepared ?? true),
						concentration: Boolean(s.concentration),
						ritual: Boolean(s.ritual),
						notes: typeof s.notes === "string" ? s.notes : "",
					}))
			: [],
		attacks: Array.isArray(obj.attacks)
			? obj.attacks
					.filter((a): a is Record<string, unknown> => Boolean(a && typeof a === "object"))
					.map((a, idx) => ({
						id: typeof a.id === "string" ? a.id : `atk-${idx + 1}`,
						name: typeof a.name === "string" ? a.name : "Attack",
						attackBonus: Number(a.attackBonus) || 0,
						damage: typeof a.damage === "string" ? a.damage : "1d4",
						damageType: typeof a.damageType === "string" ? a.damageType : "bludgeoning",
						range: typeof a.range === "string" ? a.range : "5 ft.",
						notes: typeof a.notes === "string" ? a.notes : "",
					}))
			: [],
		resources: Array.isArray(obj.resources)
			? obj.resources
					.filter((r): r is Record<string, unknown> => Boolean(r && typeof r === "object"))
					.map((r, idx) => {
						const max = Math.max(1, Number(r.max) || 1);
						const current = Math.max(0, Math.min(max, Number(r.current ?? max)));
						const resetOn =
							r.resetOn === "short" || r.resetOn === "long" || r.resetOn === "manual"
								? r.resetOn
								: "long";
						return {
							id: typeof r.id === "string" ? r.id : `res-${idx + 1}`,
							name: typeof r.name === "string" ? r.name : "Resource",
							current,
							max,
							resetOn,
							die: typeof r.die === "string" ? r.die : "",
						};
					})
			: [],
		inventory: Array.isArray(obj.inventory)
			? obj.inventory
					.filter((i): i is Record<string, unknown> => Boolean(i && typeof i === "object"))
					.map((i, idx) => ({
						id: typeof i.id === "string" ? i.id : `item-${idx + 1}`,
						name: typeof i.name === "string" ? i.name : "Item",
						qty: Math.max(0, Number(i.qty ?? 1)),
						weight: Math.max(0, Number(i.weight ?? 0)),
						equipped: Boolean(i.equipped),
						attuned: Boolean(i.attuned),
						notes: typeof i.notes === "string" ? i.notes : "",
					}))
			: [],
		currency: {
			cp: Math.max(0, Number(rawCur.cp) || 0),
			sp: Math.max(0, Number(rawCur.sp) || 0),
			ep: Math.max(0, Number(rawCur.ep) || 0),
			gp: Math.max(0, Number(rawCur.gp) || 0),
			pp: Math.max(0, Number(rawCur.pp) || 0),
		},
		features: typeof obj.features === "string" ? obj.features : "",
		notes: typeof obj.notes === "string" ? obj.notes : "",
	};
}
