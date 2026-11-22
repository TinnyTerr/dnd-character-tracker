import { describe, expect, test } from "bun:test";
import {
	abilityModifier,
	applyDamage,
	applyHealing,
	applyTempHp,
	createDefaultCharacter,
	encumbranceStats,
	formatModifier,
	passiveScore,
	proficiencyBonus,
	rollD20,
	rollFormula,
	savingThrowModifier,
	skillModifier,
	spellcastingStats,
	takeLongRest,
	takeShortRest,
} from "./mechanics";
import {
	extractCharactersFromNote,
	parseCharacterBlock,
	updateCharacterBlockInNote,
} from "./storage";

describe("D&D 5e Mechanics", () => {
	test("ability modifiers and proficiency bonus", () => {
		expect(abilityModifier(8)).toBe(-1);
		expect(abilityModifier(10)).toBe(0);
		expect(abilityModifier(15)).toBe(2);
		expect(abilityModifier(20)).toBe(5);
		expect(formatModifier(3)).toBe("+3");
		expect(formatModifier(-1)).toBe("-1");

		expect(proficiencyBonus(1)).toBe(2);
		expect(proficiencyBonus(4)).toBe(2);
		expect(proficiencyBonus(5)).toBe(3);
		expect(proficiencyBonus(9)).toBe(4);
		expect(proficiencyBonus(17)).toBe(6);
	});

	test("saves, skills, expertise, Jack of All Trades, and passive perception", () => {
		const bard = createDefaultCharacter({
			level: 5, // PB = +3
			abilities: { str: 8, dex: 14, con: 12, int: 10, wis: 12, cha: 18 },
			saveProficiencies: ["dex", "cha"],
			skills: {
				persuasion: 2, // Expertise: +4 (CHA) + 6 = +10
				acrobatics: 1, // Proficient: +2 (DEX) + 3 = +5
				perception: 1, // Proficient: +1 (WIS) + 3 = +4
			},
			jackOfAllTrades: true,
			spellcastingAbility: "cha",
		});

		expect(savingThrowModifier(bard, "cha")).toBe(7); // +4 + 3
		expect(savingThrowModifier(bard, "str")).toBe(-1);
		expect(skillModifier(bard, "persuasion")).toBe(10);
		expect(skillModifier(bard, "acrobatics")).toBe(5);
		expect(skillModifier(bard, "arcana")).toBe(1); // +0 (INT) + floor(3/2)=1
		expect(passiveScore(bard, "perception")).toBe(14);

		const spellStats = spellcastingStats(bard);
		expect(spellStats).not.toBeNull();
		expect(spellStats?.saveDC).toBe(15); // 8 + 3 + 4
		expect(spellStats?.attackBonus).toBe(7); // 3 + 4
	});

	test("combat damage, temporary HP absorption, and concentration DC", () => {
		const char = createDefaultCharacter({
			hp: { current: 24, max: 24, temp: 5 },
			concentration: "Bless",
		});

		// Non-stacking temp HP keeps higher when force=false
		applyTempHp(char, 3, false);
		expect(char.hp.temp).toBe(5);

		// Take 9 damage -> 5 absorbed by temp, 4 from current HP, Conc DC 10
		const res1 = applyDamage(char, 9);
		expect(res1.tempAbsorbed).toBe(5);
		expect(res1.hpLost).toBe(4);
		expect(char.hp.temp).toBe(0);
		expect(char.hp.current).toBe(20);
		expect(res1.concentrationDC).toBe(10);

		// Take 26 damage -> Conc DC = floor(26/2) = 13, HP drops to 0
		const res2 = applyDamage(char, 26);
		expect(char.hp.current).toBe(0);
		expect(res2.concentrationDC).toBe(13);

		// Heal 10
		const healed = applyHealing(char, 10);
		expect(healed).toBe(10);
		expect(char.hp.current).toBe(10);
	});

	test("short and long rests", () => {
		const char = createDefaultCharacter({
			level: 4,
			hp: { current: 6, max: 28, temp: 4 },
			hitDice: { die: "d8", current: 1, max: 4 },
			spellSlots: {
				"1": { max: 4, used: 3 },
				"2": { max: 2, used: 2 },
			},
			resources: [
				{ id: "r1", name: "Action Surge", current: 0, max: 1, resetOn: "short" },
				{ id: "r2", name: "Rage", current: 0, max: 3, resetOn: "long" },
			],
		});

		const sr = takeShortRest(char, 1);
		expect(sr.hitDiceSpent).toBe(1);
		expect(char.hitDice.current).toBe(0);
		expect(char.hp.current).toBeGreaterThan(6);
		expect(sr.resourcesReset).toContain("Action Surge");
		expect(char.resources[1]!.current).toBe(0); // Long rest resource untouched

		const lr = takeLongRest(char);
		expect(char.hp.current).toBe(28);
		expect(char.hp.temp).toBe(0);
		expect(lr.hitDiceRestored).toBe(2); // Half of 4
		expect(char.spellSlots["1"]!.used).toBe(0);
		expect(char.spellSlots["2"]!.used).toBe(0);
		expect(char.resources[1]!.current).toBe(3);
	});

	test("dice rolling and encumbrance", () => {
		const r20 = rollD20(5, "advantage", () => 0.99); // rolls 20
		expect(r20.isCriticalHit).toBe(true);
		expect(r20.total).toBe(25);

		const rf = rollFormula("2d6+3", () => 0.5); // each d6 rolls 4 -> 8+3=11
		expect(rf).not.toBeNull();
		expect(rf?.total).toBe(11);

		const char = createDefaultCharacter();
		const enc = encumbranceStats(char);
		expect(enc.totalWeight).toBe(68);
		expect(enc.maxCarry).toBe(240);
		expect(enc.isEncumbered).toBe(false);
	});
});

describe("Markdown Storage & Codeblock Sync", () => {
	test("parse, extract, and update dnd-character block in note", () => {
		const char = createDefaultCharacter({ name: "Lyra Vane", level: 3 });
		const note = [
			"# Lyra Vane",
			"",
			"```dnd-character",
			JSON.stringify(char, null, 2),
			"```",
			"",
			"Some campaign notes below.",
		].join("\n");

		const extracted = extractCharactersFromNote(note);
		expect(extracted).toHaveLength(1);
		expect(extracted[0]!.name).toBe("Lyra Vane");

		char.hp.current = 5;
		const updatedNote = updateCharacterBlockInNote(note, char, null);
		const parsedAfter = extractCharactersFromNote(updatedNote);
		expect(parsedAfter[0]!.hp.current).toBe(5);
		expect(updatedNote).toContain("Some campaign notes below.");

		const bad = parseCharacterBlock("{ broken json");
		expect(bad.error).not.toBeNull();
	});
});
