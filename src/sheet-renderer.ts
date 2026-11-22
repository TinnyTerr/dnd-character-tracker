import { Notice } from "obsidian";
import {
	abilityModifier,
	applyDamage,
	applyHealing,
	applyTempHp,
	type DiceRollResult,
	encumbranceStats,
	formatModifier,
	initiativeModifier,
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
	ABILITIES,
	type AbilityKey,
	type DndCharacter,
	type ProficiencyRank,
	SKILLS,
	STANDARD_CONDITIONS,
} from "./types";

export type SheetTab = "main" | "combat" | "spells" | "inventory" | "notes";

export interface CharacterSheetCallbacks {
	onSave: (updated: DndCharacter) => Promise<void> | void;
	onRollNotice?: (label: string, result: DiceRollResult) => void;
}

export class CharacterSheetRenderer {
	private container: HTMLElement;
	private character: DndCharacter;
	private callbacks: CharacterSheetCallbacks;
	private activeTab: SheetTab = "main";
	private rollMode: "normal" | "advantage" | "disadvantage" = "normal";
	private lastRollBanner: { label: string; result: DiceRollResult } | null = null;
	private isEditingProfile = false;

	constructor(
		container: HTMLElement,
		character: DndCharacter,
		callbacks: CharacterSheetCallbacks,
	) {
		this.container = container;
		this.character = character;
		this.callbacks = callbacks;
	}

	public setCharacter(character: DndCharacter): void {
		this.character = character;
		this.render();
	}

	private async commit(): Promise<void> {
		this.render();
		await this.callbacks.onSave(this.character);
	}

	private triggerRoll(label: string, result: DiceRollResult): void {
		this.lastRollBanner = { label, result };
		this.render();
		if (this.callbacks.onRollNotice) {
			this.callbacks.onRollNotice(label, result);
		} else {
			const critText = result.isCriticalHit
				? " (CRITICAL 20!)"
				: result.isCriticalFail
					? " (NAT 1!)"
					: "";
			new Notice(
				`🎲 ${this.character.name} — ${label}: ${result.total} [${result.rolls.join(", ")} | ${result.formula}]${critText}`,
			);
		}
	}

	public render(): void {
		this.container.empty();
		this.container.addClass("dnd-sheet-card");

		this.renderHeader();
		if (this.isEditingProfile) {
			this.renderProfileEditor();
		}
		this.renderVitalsBar();
		if (this.lastRollBanner) {
			this.renderRollBanner();
		}
		this.renderConditionsBar();
		this.renderNavTabs();

		const body = this.container.createDiv({ cls: "dnd-sheet-body" });
		switch (this.activeTab) {
			case "main":
				this.renderMainTab(body);
				break;
			case "combat":
				this.renderCombatTab(body);
				break;
			case "spells":
				this.renderSpellsTab(body);
				break;
			case "inventory":
				this.renderInventoryTab(body);
				break;
			case "notes":
				this.renderNotesTab(body);
				break;
		}
	}

	private renderHeader(): void {
		const header = this.container.createDiv({ cls: "dnd-sheet-header" });

		const titleBlock = header.createDiv({ cls: "dnd-header-title-block" });
		const nameRow = titleBlock.createDiv({ cls: "dnd-header-name-row" });
		nameRow.createEl("h2", { text: this.character.name, cls: "dnd-char-name" });

		const inspBtn = nameRow.createEl("button", {
			cls: `dnd-badge-btn ${this.character.inspiration ? "is-active" : ""}`,
			text: this.character.inspiration ? "★ Inspired" : "☆ Inspiration",
			attr: { title: "Toggle Heroic Inspiration" },
		});
		inspBtn.addEventListener("click", () => {
			this.character.inspiration = !this.character.inspiration;
			void this.commit();
		});

		const editBtn = nameRow.createEl("button", {
			cls: `dnd-icon-btn ${this.isEditingProfile ? "is-active" : ""}`,
			text: this.isEditingProfile ? "Done" : "✎ Edit",
			attr: { title: "Edit character profile & base stats" },
		});
		editBtn.addEventListener("click", () => {
			this.isEditingProfile = !this.isEditingProfile;
			this.render();
		});

		const subtitleParts = [
			`Level ${this.character.level}`,
			this.character.race,
			this.character.className,
			this.character.subclass ? `(${this.character.subclass})` : "",
			this.character.background ? `• ${this.character.background}` : "",
		].filter(Boolean);

		titleBlock.createDiv({
			cls: "dnd-char-subtitle",
			text: subtitleParts.join(" "),
		});

		// Rest & Roll Mode toolbar
		const actions = header.createDiv({ cls: "dnd-header-actions" });

		const modeGroup = actions.createDiv({ cls: "dnd-mode-group" });
		for (const mode of ["normal", "advantage", "disadvantage"] as const) {
			const label = mode === "normal" ? "1d20" : mode === "advantage" ? "Adv" : "Dis";
			const btn = modeGroup.createEl("button", {
				cls: `dnd-mode-btn ${this.rollMode === mode ? "is-active" : ""} mode-${mode}`,
				text: label,
				attr: { title: `Roll d20 checks with ${mode}` },
			});
			btn.addEventListener("click", () => {
				this.rollMode = mode;
				this.render();
			});
		}

		const shortRestBtn = actions.createEl("button", {
			cls: "dnd-action-btn",
			text: "⛺ Short Rest",
			attr: { title: "Spend 1 Hit Die (if available) & reset short-rest resources" },
		});
		shortRestBtn.addEventListener("click", () => {
			const spend = this.character.hitDice.current > 0 && this.character.hp.current < this.character.hp.max ? 1 : 0;
			const res = takeShortRest(this.character, spend);
			const parts = [
				res.hitDiceSpent > 0 ? `+${res.hpHealed} HP (${res.hitDiceSpent} HD)` : "No HD spent",
				res.resourcesReset.length > 0 ? `Reset: ${res.resourcesReset.join(", ")}` : "",
			].filter(Boolean);
			new Notice(`⛺ Short Rest (${this.character.name}): ${parts.join(" • ") || "Rested"}`);
			void this.commit();
		});

		const longRestBtn = actions.createEl("button", {
			cls: "dnd-action-btn dnd-btn-primary",
			text: "🌙 Long Rest",
			attr: { title: "Restore full HP, all spell slots, half Hit Dice, and long-rest resources" },
		});
		longRestBtn.addEventListener("click", () => {
			const res = takeLongRest(this.character);
			new Notice(
				`🌙 Long Rest (${this.character.name}): Full HP (+${res.hpRestored}), +${res.hitDiceRestored} Hit Dice, all Spell Slots restored`,
			);
			void this.commit();
		});
	}

	private renderProfileEditor(): void {
		const panel = this.container.createDiv({ cls: "dnd-profile-editor" });
		const grid = panel.createDiv({ cls: "dnd-editor-grid" });

		const addTextField = (
			label: string,
			value: string,
			onChange: (val: string) => void,
		) => {
			const field = grid.createDiv({ cls: "dnd-field" });
			field.createEl("label", { text: label });
			const input = field.createEl("input", {
				type: "text",
				value,
			});
			input.addEventListener("change", () => {
				onChange(input.value.trim());
				void this.commit();
			});
		};

		const addNumberField = (
			label: string,
			value: number,
			min: number,
			max: number,
			onChange: (val: number) => void,
		) => {
			const field = grid.createDiv({ cls: "dnd-field" });
			field.createEl("label", { text: label });
			const input = field.createEl("input", {
				type: "number",
				value: String(value),
				attr: { min: String(min), max: String(max) },
			});
			input.addEventListener("change", () => {
				const parsed = Number.parseInt(input.value, 10);
				if (!Number.isNaN(parsed)) {
					onChange(Math.max(min, Math.min(max, parsed)));
					void this.commit();
				}
			});
		};

		addTextField("Name", this.character.name, (v) => {
			if (v) this.character.name = v;
		});
		addTextField("Race", this.character.race, (v) => {
			this.character.race = v;
		});
		addTextField("Class", this.character.className, (v) => {
			this.character.className = v;
		});
		addTextField("Subclass", this.character.subclass ?? "", (v) => {
			this.character.subclass = v;
		});
		addNumberField("Level", this.character.level, 1, 20, (v) => {
			this.character.level = v;
			this.character.hitDice.max = v;
			this.character.hitDice.current = Math.min(this.character.hitDice.current, v);
		});
		addTextField("Background", this.character.background, (v) => {
			this.character.background = v;
		});
		addNumberField("Armor Class", this.character.ac, 1, 40, (v) => {
			this.character.ac = v;
		});
		addNumberField("Max HP", this.character.hp.max, 1, 999, (v) => {
			this.character.hp.max = v;
			this.character.hp.current = Math.min(this.character.hp.current, v);
		});
		addNumberField("Speed (ft)", this.character.speed, 0, 200, (v) => {
			this.character.speed = v;
		});
		addTextField("Hit Die (e.g. d8)", this.character.hitDice.die, (v) => {
			if (/^d\d+$/i.test(v)) this.character.hitDice.die = v.toLowerCase();
		});
	}

	private renderVitalsBar(): void {
		const bar = this.container.createDiv({ cls: "dnd-vitals-bar" });

		// HP Widget
		const hpCard = bar.createDiv({ cls: "dnd-vital-card dnd-hp-card" });
		const hpTop = hpCard.createDiv({ cls: "dnd-hp-top" });
		hpTop.createSpan({ cls: "dnd-vital-label", text: "HIT POINTS" });
		if (this.character.hp.temp > 0) {
			hpTop.createSpan({
				cls: "dnd-temp-hp-pill",
				text: `+${this.character.hp.temp} TEMP`,
			});
		}

		const hpValueRow = hpCard.createDiv({ cls: "dnd-hp-value-row" });
		hpValueRow.createSpan({
			cls: "dnd-hp-numbers",
			text: `${this.character.hp.current} / ${this.character.hp.max}`,
		});

		const pct = Math.max(
			0,
			Math.min(100, Math.round((this.character.hp.current / Math.max(1, this.character.hp.max)) * 100)),
		);
		const progressTrack = hpCard.createDiv({ cls: "dnd-hp-track" });
		const progressFill = progressTrack.createDiv({
			cls: `dnd-hp-fill ${pct <= 25 ? "is-critical" : pct <= 50 ? "is-bloodied" : ""}`,
		});
		progressFill.style.width = `${pct}%`;

		// HP Quick Adjust Controls
		const hpControls = hpCard.createDiv({ cls: "dnd-hp-controls" });
		const amtInput = hpControls.createEl("input", {
			type: "number",
			cls: "dnd-hp-input",
			placeholder: "Amt",
			attr: { min: "1", value: "1" },
		});

		const dmgBtn = hpControls.createEl("button", {
			cls: "dnd-hp-btn is-dmg",
			text: "− Dmg",
		});
		dmgBtn.addEventListener("click", () => {
			const val = Math.max(1, Number.parseInt(amtInput.value, 10) || 1);
			const res = applyDamage(this.character, val);
			if (res.concentrationDC !== null) {
				new Notice(
					`⚠️ Concentration Check required for ${this.character.concentration}! Roll CON Save (DC ${res.concentrationDC})`,
				);
			}
			void this.commit();
		});

		const healBtn = hpControls.createEl("button", {
			cls: "dnd-hp-btn is-heal",
			text: "+ Heal",
		});
		healBtn.addEventListener("click", () => {
			const val = Math.max(1, Number.parseInt(amtInput.value, 10) || 1);
			applyHealing(this.character, val);
			void this.commit();
		});

		const tempBtn = hpControls.createEl("button", {
			cls: "dnd-hp-btn is-temp",
			text: "Temp",
			attr: { title: "Set Temporary HP" },
		});
		tempBtn.addEventListener("click", () => {
			const val = Math.max(0, Number.parseInt(amtInput.value, 10) || 0);
			applyTempHp(this.character, val, true);
			void this.commit();
		});

		// Death saves if at 0 HP
		if (this.character.hp.current === 0) {
			const dsBox = hpCard.createDiv({ cls: "dnd-death-saves" });
			const succRow = dsBox.createDiv({ cls: "dnd-ds-row" });
			succRow.createSpan({ text: "Succ:" });
			for (let i = 1; i <= 3; i++) {
				const pip = succRow.createSpan({
					cls: `dnd-pip is-success ${this.character.deathSaves.successes >= i ? "is-filled" : ""}`,
				});
				pip.addEventListener("click", () => {
					this.character.deathSaves.successes =
						this.character.deathSaves.successes === i ? i - 1 : i;
					void this.commit();
				});
			}
			const failRow = dsBox.createDiv({ cls: "dnd-ds-row" });
			failRow.createSpan({ text: "Fail:" });
			for (let i = 1; i <= 3; i++) {
				const pip = failRow.createSpan({
					cls: `dnd-pip is-fail ${this.character.deathSaves.failures >= i ? "is-filled" : ""}`,
				});
				pip.addEventListener("click", () => {
					this.character.deathSaves.failures =
						this.character.deathSaves.failures === i ? i - 1 : i;
					void this.commit();
				});
			}
			const rollDsBtn = dsBox.createEl("button", {
				cls: "dnd-mini-btn",
				text: "🎲 Death Save",
			});
			rollDsBtn.addEventListener("click", () => {
				const res = rollD20(0, this.rollMode);
				if (res.isCriticalHit) {
					this.character.hp.current = 1;
					this.character.deathSaves = { successes: 0, failures: 0 };
				} else if (res.isCriticalFail) {
					this.character.deathSaves.failures = Math.min(3, this.character.deathSaves.failures + 2);
				} else if (res.total >= 10) {
					this.character.deathSaves.successes = Math.min(3, this.character.deathSaves.successes + 1);
				} else {
					this.character.deathSaves.failures = Math.min(3, this.character.deathSaves.failures + 1);
				}
				this.triggerRoll("Death Saving Throw", res);
				void this.commit();
			});
		}

		// Stat Pills: AC, Initiative, Speed, Proficiency, Passive Perception, Hit Dice
		const statsGrid = bar.createDiv({ cls: "dnd-vitals-grid" });

		const createStatBox = (
			label: string,
			value: string,
			subtext?: string,
			onClick?: () => void,
		) => {
			const box = statsGrid.createDiv({
				cls: `dnd-stat-pill ${onClick ? "is-clickable" : ""}`,
			});
			box.createDiv({ cls: "dnd-vital-label", text: label });
			box.createDiv({ cls: "dnd-stat-main", text: value });
			if (subtext) box.createDiv({ cls: "dnd-stat-sub", text: subtext });
			if (onClick) box.addEventListener("click", onClick);
		};

		createStatBox("ARMOR CLASS", String(this.character.ac), "AC");

		const initMod = initiativeModifier(this.character);
		createStatBox("INITIATIVE", formatModifier(initMod), "🎲 Roll", () => {
			const res = rollD20(initMod, this.rollMode);
			this.triggerRoll("Initiative", res);
		});

		createStatBox("SPEED", `${this.character.speed} ft`, "Walk");
		createStatBox("PROFICIENCY", formatModifier(proficiencyBonus(this.character.level)), `Lvl ${this.character.level}`);
		createStatBox("PASSIVE PERC", String(passiveScore(this.character, "perception")), "10 + Perc");
		createStatBox(
			"HIT DICE",
			`${this.character.hitDice.current}/${this.character.hitDice.max}`,
			this.character.hitDice.die,
			() => {
				if (this.character.hitDice.current > 0) {
					const res = takeShortRest(this.character, 1);
					new Notice(`🎲 Spent 1 ${this.character.hitDice.die}: healed +${res.hpHealed} HP`);
					void this.commit();
				} else {
					new Notice("No Hit Dice remaining!");
				}
			},
		);
	}

	private renderRollBanner(): void {
		if (!this.lastRollBanner) return;
		const { label, result } = this.lastRollBanner;
		const banner = this.container.createDiv({
			cls: `dnd-roll-banner ${result.isCriticalHit ? "is-crit" : result.isCriticalFail ? "is-fumble" : ""}`,
		});

		const left = banner.createDiv({ cls: "dnd-roll-banner-left" });
		left.createSpan({ cls: "dnd-roll-icon", text: "🎲" });
		left.createSpan({ cls: "dnd-roll-label", text: label });
		left.createSpan({
			cls: "dnd-roll-breakdown",
			text: `(${result.formula} → [${result.rolls.join(", ")}])`,
		});

		const right = banner.createDiv({ cls: "dnd-roll-banner-right" });
		right.createSpan({ cls: "dnd-roll-total", text: String(result.total) });

		const closeBtn = right.createEl("button", {
			cls: "dnd-roll-close",
			text: "×",
		});
		closeBtn.addEventListener("click", () => {
			this.lastRollBanner = null;
			this.render();
		});
	}

	private renderConditionsBar(): void {
		const bar = this.container.createDiv({ cls: "dnd-conditions-bar" });

		// Concentration pill
		const concWrap = bar.createDiv({ cls: "dnd-conc-group" });
		if (this.character.concentration) {
			const pill = concWrap.createSpan({
				cls: "dnd-condition-chip is-concentration",
				text: `🔮 Concentrating: ${this.character.concentration} ×`,
				attr: { title: "Click to end concentration" },
			});
			pill.addEventListener("click", () => {
				this.character.concentration = "";
				void this.commit();
			});
		} else {
			const concInput = concWrap.createEl("input", {
				type: "text",
				cls: "dnd-inline-input",
				placeholder: "+ Concentration spell...",
			});
			concInput.addEventListener("keydown", (e) => {
				if (e.key === "Enter" && concInput.value.trim()) {
					this.character.concentration = concInput.value.trim();
					void this.commit();
				}
			});
		}

		// Active conditions
		const condGroup = bar.createDiv({ cls: "dnd-cond-list" });
		for (const cond of this.character.conditions) {
			const chip = condGroup.createSpan({
				cls: "dnd-condition-chip",
				text: `${cond} ×`,
				attr: { title: "Click to remove condition" },
			});
			chip.addEventListener("click", () => {
				this.character.conditions = this.character.conditions.filter((c) => c !== cond);
				void this.commit();
			});
		}

		// Add condition dropdown
		const select = condGroup.createEl("select", { cls: "dnd-cond-select" });
		select.createEl("option", { text: "+ Condition", value: "" });
		for (const c of STANDARD_CONDITIONS) {
			if (!this.character.conditions.includes(c)) {
				select.createEl("option", { text: c, value: c });
			}
		}
		select.addEventListener("change", () => {
			if (select.value && !this.character.conditions.includes(select.value)) {
				this.character.conditions.push(select.value);
				void this.commit();
			}
		});
	}

	private renderNavTabs(): void {
		const nav = this.container.createDiv({ cls: "dnd-nav-tabs" });
		const tabs: { id: SheetTab; label: string }[] = [
			{ id: "main", label: "Abilities & Skills" },
			{ id: "combat", label: `Actions & Resources (${this.character.attacks.length + this.character.resources.length})` },
			{ id: "spells", label: `Spells (${this.character.spells.length})` },
			{ id: "inventory", label: `Inventory (${this.character.inventory.length})` },
			{ id: "notes", label: "Features & Notes" },
		];

		for (const t of tabs) {
			const btn = nav.createEl("button", {
				cls: `dnd-tab-btn ${this.activeTab === t.id ? "is-active" : ""}`,
				text: t.label,
			});
			btn.addEventListener("click", () => {
				this.activeTab = t.id;
				this.render();
			});
		}
	}

	private renderMainTab(parent: HTMLElement): void {
		const layout = parent.createDiv({ cls: "dnd-main-layout" });

		// Left column: 6 Ability Scores + Saving Throws
		const leftCol = layout.createDiv({ cls: "dnd-abilities-col" });
		const abilitiesGrid = leftCol.createDiv({ cls: "dnd-abilities-grid" });

		for (const ab of ABILITIES) {
			const score = this.character.abilities[ab.key] ?? 10;
			const mod = abilityModifier(score);
			const saveMod = savingThrowModifier(this.character, ab.key);
			const isSaveProf = this.character.saveProficiencies.includes(ab.key);

			const card = abilitiesGrid.createDiv({ cls: "dnd-ability-card" });
			card.createDiv({ cls: "dnd-ability-title", text: ab.short });

			const modBtn = card.createEl("button", {
				cls: "dnd-ability-mod-btn",
				text: formatModifier(mod),
				attr: { title: `Roll ${ab.label} Check` },
			});
			modBtn.addEventListener("click", () => {
				const res = rollD20(mod, this.rollMode);
				this.triggerRoll(`${ab.label} Check`, res);
			});

			// Score adjuster
			const scoreRow = card.createDiv({ cls: "dnd-ability-score-row" });
			const decBtn = scoreRow.createEl("button", { cls: "dnd-micro-btn", text: "−" });
			decBtn.addEventListener("click", () => {
				this.character.abilities[ab.key] = Math.max(1, score - 1);
				void this.commit();
			});
			scoreRow.createSpan({ cls: "dnd-ability-score-val", text: String(score) });
			const incBtn = scoreRow.createEl("button", { cls: "dnd-micro-btn", text: "+" });
			incBtn.addEventListener("click", () => {
				this.character.abilities[ab.key] = Math.min(30, score + 1);
				void this.commit();
			});

			// Saving throw row inside card
			const saveRow = card.createDiv({ cls: "dnd-save-row" });
			const profToggle = saveRow.createSpan({
				cls: `dnd-prof-dot ${isSaveProf ? "is-prof" : ""}`,
				text: isSaveProf ? "●" : "○",
				attr: { title: "Toggle Saving Throw Proficiency" },
			});
			profToggle.addEventListener("click", () => {
				if (isSaveProf) {
					this.character.saveProficiencies = this.character.saveProficiencies.filter(
						(k) => k !== ab.key,
					);
				} else {
					this.character.saveProficiencies.push(ab.key);
				}
				void this.commit();
			});

			const saveBtn = saveRow.createEl("button", {
				cls: "dnd-save-roll-btn",
				text: `Save ${formatModifier(saveMod)}`,
				attr: { title: `Roll ${ab.label} Saving Throw` },
			});
			saveBtn.addEventListener("click", () => {
				const res = rollD20(saveMod, this.rollMode);
				this.triggerRoll(`${ab.label} Save`, res);
			});
		}

		// Quick Custom Dice Roller Bar
		const customRoller = leftCol.createDiv({ cls: "dnd-custom-roller" });
		customRoller.createSpan({ cls: "dnd-section-title", text: "🎲 Quick Dice Roller" });
		const rollerRow = customRoller.createDiv({ cls: "dnd-roller-row" });
		const formulaInput = rollerRow.createEl("input", {
			type: "text",
			cls: "dnd-formula-input",
			placeholder: "e.g. 2d6+3, 1d8, 4d6",
			value: "2d6+3",
		});
		const rollBtn = rollerRow.createEl("button", {
			cls: "dnd-action-btn dnd-btn-primary",
			text: "Roll",
		});
		rollBtn.addEventListener("click", () => {
			const res = rollFormula(formulaInput.value);
			if (!res) {
				new Notice("Invalid dice formula! Try format like 2d6+3 or 1d20-1.");
				return;
			}
			this.triggerRoll(`Custom Roll (${res.formula})`, res);
		});

		const quickDiceBar = customRoller.createDiv({ cls: "dnd-quick-dice-buttons" });
		for (const die of ["1d4", "1d6", "1d8", "1d10", "1d12", "1d20", "1d100"]) {
			const dBtn = quickDiceBar.createEl("button", {
				cls: "dnd-mini-btn",
				text: die,
			});
			dBtn.addEventListener("click", () => {
				const res = rollFormula(die);
				if (res) this.triggerRoll(`Roll ${die}`, res);
			});
		}

		// Right column: 18 Skills List
		const rightCol = layout.createDiv({ cls: "dnd-skills-col" });
		const skillsHeader = rightCol.createDiv({ cls: "dnd-skills-header" });
		skillsHeader.createSpan({ cls: "dnd-section-title", text: "Skills (click ● to cycle Prof / Expertise)" });

		const skillsList = rightCol.createDiv({ cls: "dnd-skills-list" });
		for (const sk of SKILLS) {
			const rank: ProficiencyRank = this.character.skills[sk.key] ?? 0;
			const mod = skillModifier(this.character, sk.key);

			const row = skillsList.createDiv({ cls: "dnd-skill-row" });
			const dot = row.createSpan({
				cls: `dnd-prof-dot rank-${rank}`,
				text: rank === 2 ? "◆" : rank === 1 ? "●" : "○",
				attr: {
					title:
						rank === 2
							? "Expertise (2× Prof) — click to clear"
							: rank === 1
								? "Proficient — click for Expertise"
								: "Unproficient — click for Proficient",
				},
			});
			dot.addEventListener("click", () => {
				const nextRank: ProficiencyRank = rank === 0 ? 1 : rank === 1 ? 2 : 0;
				if (nextRank === 0) {
					delete this.character.skills[sk.key];
				} else {
					this.character.skills[sk.key] = nextRank;
				}
				void this.commit();
			});

			const nameBtn = row.createEl("button", {
				cls: "dnd-skill-roll-btn",
				attr: { title: `Roll ${sk.label} (${sk.ability.toUpperCase()})` },
			});
			nameBtn.createSpan({ cls: "dnd-skill-name", text: sk.label });
			nameBtn.createSpan({ cls: "dnd-skill-ability", text: sk.ability.toUpperCase() });
			nameBtn.createSpan({ cls: "dnd-skill-mod", text: formatModifier(mod) });

			nameBtn.addEventListener("click", () => {
				const res = rollD20(mod, this.rollMode);
				this.triggerRoll(`${sk.label} (${sk.ability.toUpperCase()})`, res);
			});
		}
	}

	private renderCombatTab(parent: HTMLElement): void {
		// Class Resources Section
		const resSection = parent.createDiv({ cls: "dnd-section" });
		resSection.createDiv({ cls: "dnd-section-title", text: "⚡ Class & Feature Resources" });

		if (this.character.resources.length === 0) {
			resSection.createDiv({
				cls: "dnd-empty-hint",
				text: "No tracked resources yet (e.g., Ki Points, Rage, Bardic Inspiration, Channel Divinity).",
			});
		} else {
			const resGrid = resSection.createDiv({ cls: "dnd-resources-grid" });
			for (const res of this.character.resources) {
				const card = resGrid.createDiv({ cls: "dnd-resource-card" });
				const top = card.createDiv({ cls: "dnd-resource-top" });
				top.createSpan({
					cls: "dnd-resource-name",
					text: `${res.name}${res.die ? ` (${res.die})` : ""}`,
				});
				top.createSpan({
					cls: "dnd-resource-meta",
					text: `${res.current}/${res.max} • ${res.resetOn} rest`,
				});

				const delBtn = top.createEl("button", {
					cls: "dnd-delete-btn",
					text: "×",
					attr: { title: "Delete resource" },
				});
				delBtn.addEventListener("click", () => {
					this.character.resources = this.character.resources.filter((r) => r.id !== res.id);
					void this.commit();
				});

				const pipsRow = card.createDiv({ cls: "dnd-pips-row" });
				if (res.max <= 12) {
					for (let i = 1; i <= res.max; i++) {
						const filled = i <= res.current;
						const pip = pipsRow.createSpan({
							cls: `dnd-slot-pip ${filled ? "is-available" : "is-spent"}`,
							attr: { title: filled ? "Click to spend" : "Click to restore" },
						});
						pip.addEventListener("click", () => {
							res.current = filled ? i - 1 : i;
							void this.commit();
						});
					}
				} else {
					const dec = pipsRow.createEl("button", { cls: "dnd-mini-btn", text: "−1" });
					dec.addEventListener("click", () => {
						res.current = Math.max(0, res.current - 1);
						void this.commit();
					});
					const inc = pipsRow.createEl("button", { cls: "dnd-mini-btn", text: "+1" });
					inc.addEventListener("click", () => {
						res.current = Math.min(res.max, res.current + 1);
						void this.commit();
					});
				}

				if (res.die) {
					const rollDieBtn = pipsRow.createEl("button", {
						cls: "dnd-mini-btn",
						text: `🎲 ${res.die}`,
					});
					rollDieBtn.addEventListener("click", () => {
						const formula = /^\d/.test(res.die!) ? res.die! : `1${res.die}`;
						const r = rollFormula(formula);
						if (r) this.triggerRoll(res.name, r);
					});
				}
			}
		}

		// Add resource form
		const addResRow = resSection.createDiv({ cls: "dnd-add-row" });
		const resNameIn = addResRow.createEl("input", {
			type: "text",
			placeholder: "Resource name (e.g. Bardic Inspiration)",
		});
		const resMaxIn = addResRow.createEl("input", {
			type: "number",
			placeholder: "Max",
			value: "3",
			attr: { min: "1", max: "99" },
		});
		const resDieIn = addResRow.createEl("input", {
			type: "text",
			placeholder: "Die (opt, e.g. d6)",
		});
		const resResetSelect = addResRow.createEl("select");
		resResetSelect.createEl("option", { text: "Long Rest", value: "long" });
		resResetSelect.createEl("option", { text: "Short Rest", value: "short" });
		resResetSelect.createEl("option", { text: "Manual", value: "manual" });

		const addResBtn = addResRow.createEl("button", {
			cls: "dnd-action-btn",
			text: "+ Add Resource",
		});
		addResBtn.addEventListener("click", () => {
			const name = resNameIn.value.trim();
			if (!name) return;
			const max = Math.max(1, Number.parseInt(resMaxIn.value, 10) || 1);
			this.character.resources.push({
				id: `res-${Date.now()}`,
				name,
				current: max,
				max,
				resetOn: resResetSelect.value as "short" | "long" | "manual",
				die: resDieIn.value.trim(),
			});
			void this.commit();
		});

		// Attacks & Weapons Section
		const atkSection = parent.createDiv({ cls: "dnd-section" });
		atkSection.createDiv({ cls: "dnd-section-title", text: "⚔️ Attacks & Weapons" });

		const table = atkSection.createDiv({ cls: "dnd-attacks-list" });
		for (const atk of this.character.attacks) {
			const row = table.createDiv({ cls: "dnd-attack-row" });
			const info = row.createDiv({ cls: "dnd-attack-info" });
			info.createSpan({ cls: "dnd-attack-name", text: atk.name });
			info.createSpan({
				cls: "dnd-attack-meta",
				text: [atk.range, atk.damageType, atk.notes].filter(Boolean).join(" • "),
			});

			const btns = row.createDiv({ cls: "dnd-attack-btns" });
			const toHitBtn = btns.createEl("button", {
				cls: "dnd-action-btn",
				text: `🎯 ${formatModifier(atk.attackBonus)} to Hit`,
			});
			toHitBtn.addEventListener("click", () => {
				const res = rollD20(atk.attackBonus, this.rollMode);
				this.triggerRoll(`${atk.name} — Attack`, res);
			});

			const dmgBtn = btns.createEl("button", {
				cls: "dnd-action-btn",
				text: `💥 ${atk.damage}`,
			});
			dmgBtn.addEventListener("click", () => {
				const res = rollFormula(atk.damage);
				if (res) {
					this.triggerRoll(`${atk.name} — Damage (${atk.damageType})`, res);
				} else {
					new Notice(`Could not parse damage formula: ${atk.damage}`);
				}
			});

			const delBtn = btns.createEl("button", {
				cls: "dnd-delete-btn",
				text: "×",
			});
			delBtn.addEventListener("click", () => {
				this.character.attacks = this.character.attacks.filter((a) => a.id !== atk.id);
				void this.commit();
			});
		}

		// Add Attack row
		const addAtkRow = atkSection.createDiv({ cls: "dnd-add-row" });
		const atkNameIn = addAtkRow.createEl("input", {
			type: "text",
			placeholder: "Weapon / Attack name",
		});
		const atkBonusIn = addAtkRow.createEl("input", {
			type: "number",
			placeholder: "Hit +",
			value: "5",
		});
		const atkDmgIn = addAtkRow.createEl("input", {
			type: "text",
			placeholder: "Damage (e.g. 1d8+3)",
			value: "1d8+3",
		});
		const atkTypeIn = addAtkRow.createEl("input", {
			type: "text",
			placeholder: "Type (slashing)",
			value: "slashing",
		});
		const addAtkBtn = addAtkRow.createEl("button", {
			cls: "dnd-action-btn",
			text: "+ Add Attack",
		});
		addAtkBtn.addEventListener("click", () => {
			const name = atkNameIn.value.trim();
			if (!name) return;
			this.character.attacks.push({
				id: `atk-${Date.now()}`,
				name,
				attackBonus: Number.parseInt(atkBonusIn.value, 10) || 0,
				damage: atkDmgIn.value.trim() || "1d6",
				damageType: atkTypeIn.value.trim() || "slashing",
				range: "5 ft.",
			});
			void this.commit();
		});
	}

	private renderSpellsTab(parent: HTMLElement): void {
		// Spellcasting Header Bar
		const topBar = parent.createDiv({ cls: "dnd-spell-header" });
		const abilitySelectWrap = topBar.createDiv({ cls: "dnd-spell-ability-select" });
		abilitySelectWrap.createSpan({ text: "Spellcasting Ability: " });
		const select = abilitySelectWrap.createEl("select");
		select.createEl("option", { text: "None", value: "" });
		for (const ab of ABILITIES) {
			const opt = select.createEl("option", { text: ab.label, value: ab.key });
			if (this.character.spellcastingAbility === ab.key) opt.selected = true;
		}
		select.addEventListener("change", () => {
			this.character.spellcastingAbility = (select.value as AbilityKey) || "";
			void this.commit();
		});

		const stats = spellcastingStats(this.character);
		if (stats) {
			const badges = topBar.createDiv({ cls: "dnd-spell-badges" });
			badges.createSpan({
				cls: "dnd-spell-stat-badge",
				text: `Spell Save DC: ${stats.saveDC}`,
			});
			const atkBadge = badges.createEl("button", {
				cls: "dnd-action-btn",
				text: `🎲 Spell Attack: ${formatModifier(stats.attackBonus)}`,
			});
			atkBadge.addEventListener("click", () => {
				const res = rollD20(stats.attackBonus, this.rollMode);
				this.triggerRoll("Spell Attack", res);
			});
		}

		// Spell Slots Tracker (Levels 1-9)
		const slotsSection = parent.createDiv({ cls: "dnd-section" });
		slotsSection.createDiv({ cls: "dnd-section-title", text: "✨ Spell Slots" });

		const slotsGrid = slotsSection.createDiv({ cls: "dnd-spell-slots-grid" });
		for (let lvl = 1; lvl <= 9; lvl++) {
			const key = String(lvl);
			const pool = this.character.spellSlots[key] ?? { max: 0, used: 0 };
			if (pool.max === 0 && lvl > 3 && Object.keys(this.character.spellSlots).length === 0) {
				continue;
			}
			const card = slotsGrid.createDiv({
				cls: `dnd-slot-card ${pool.max === 0 ? "is-empty-slot" : ""}`,
			});
			const head = card.createDiv({ cls: "dnd-slot-head" });
			head.createSpan({ cls: "dnd-slot-lvl", text: `Level ${lvl}` });
			const maxControls = head.createDiv({ cls: "dnd-slot-max-ctrl" });
			const decMax = maxControls.createEl("button", { cls: "dnd-micro-btn", text: "−" });
			decMax.addEventListener("click", () => {
				const nextMax = Math.max(0, pool.max - 1);
				if (nextMax === 0) {
					delete this.character.spellSlots[key];
				} else {
					this.character.spellSlots[key] = {
						max: nextMax,
						used: Math.min(pool.used, nextMax),
					};
				}
				void this.commit();
			});
			maxControls.createSpan({
				text: `${pool.max - pool.used}/${pool.max}`,
			});
			const incMax = maxControls.createEl("button", { cls: "dnd-micro-btn", text: "+" });
			incMax.addEventListener("click", () => {
				const nextMax = Math.min(9, pool.max + 1);
				this.character.spellSlots[key] = {
					max: nextMax,
					used: pool.used,
				};
				void this.commit();
			});

			if (pool.max > 0) {
				const pips = card.createDiv({ cls: "dnd-pips-row" });
				const available = pool.max - pool.used;
				for (let i = 1; i <= pool.max; i++) {
					const isAvail = i <= available;
					const pip = pips.createSpan({
						cls: `dnd-slot-pip ${isAvail ? "is-available" : "is-spent"}`,
						attr: { title: isAvail ? "Click to expend slot" : "Click to restore slot" },
					});
					pip.addEventListener("click", () => {
						const newAvail = isAvail ? i - 1 : i;
						this.character.spellSlots[key] = {
							max: pool.max,
							used: pool.max - newAvail,
						};
						void this.commit();
					});
				}
			}
		}

		// Spells Known / Prepared List
		const listSection = parent.createDiv({ cls: "dnd-section" });
		listSection.createDiv({ cls: "dnd-section-title", text: "📖 Spells Known & Prepared" });

		const sortedSpells = [...this.character.spells].sort(
			(a, b) => a.level - b.level || a.name.localeCompare(b.name),
		);

		if (sortedSpells.length === 0) {
			listSection.createDiv({
				cls: "dnd-empty-hint",
				text: "No spells added yet. Add cantrips or leveled spells below.",
			});
		} else {
			const spellList = listSection.createDiv({ cls: "dnd-spells-list" });
			for (const sp of sortedSpells) {
				const row = spellList.createDiv({ cls: "dnd-spell-row" });
				const left = row.createDiv({ cls: "dnd-spell-info" });
				left.createSpan({
					cls: "dnd-spell-level-tag",
					text: sp.level === 0 ? "Cantrip" : `Lvl ${sp.level}`,
				});
				left.createSpan({ cls: "dnd-spell-name", text: sp.name });
				if (sp.concentration) {
					left.createSpan({ cls: "dnd-tag-mini is-conc", text: "C" });
				}
				if (sp.ritual) {
					left.createSpan({ cls: "dnd-tag-mini", text: "R" });
				}
				if (sp.notes) {
					left.createSpan({ cls: "dnd-spell-notes", text: sp.notes });
				}

				const right = row.createDiv({ cls: "dnd-spell-actions" });
				const castBtn = right.createEl("button", {
					cls: "dnd-mini-btn",
					text: sp.level === 0 ? "✨ Cast" : `✨ Cast (Lvl ${sp.level})`,
				});
				castBtn.addEventListener("click", () => {
					if (sp.level > 0) {
						const key = String(sp.level);
						const pool = this.character.spellSlots[key];
						if (!pool || pool.used >= pool.max) {
							new Notice(`No Level ${sp.level} spell slots remaining!`);
							return;
						}
						pool.used += 1;
					}
					if (sp.concentration) {
						this.character.concentration = sp.name;
					}
					new Notice(`✨ ${this.character.name} casts ${sp.name}!`);
					void this.commit();
				});

				const delBtn = right.createEl("button", {
					cls: "dnd-delete-btn",
					text: "×",
				});
				delBtn.addEventListener("click", () => {
					this.character.spells = this.character.spells.filter((s) => s.id !== sp.id);
					void this.commit();
				});
			}
		}

		// Add Spell row
		const addSpRow = listSection.createDiv({ cls: "dnd-add-row" });
		const spNameIn = addSpRow.createEl("input", {
			type: "text",
			placeholder: "Spell name",
		});
		const spLvlIn = addSpRow.createEl("input", {
			type: "number",
			placeholder: "Lvl (0-9)",
			value: "1",
			attr: { min: "0", max: "9" },
		});
		const spNotesIn = addSpRow.createEl("input", {
			type: "text",
			placeholder: "Range / effect notes",
		});
		const concLabel = addSpRow.createEl("label", { cls: "dnd-checkbox-label" });
		const concCheck = concLabel.createEl("input", { type: "checkbox" });
		concLabel.appendText(" Conc.");

		const addSpBtn = addSpRow.createEl("button", {
			cls: "dnd-action-btn",
			text: "+ Add Spell",
		});
		addSpBtn.addEventListener("click", () => {
			const name = spNameIn.value.trim();
			if (!name) return;
			const level = Math.max(0, Math.min(9, Number.parseInt(spLvlIn.value, 10) || 0));
			this.character.spells.push({
				id: `sp-${Date.now()}`,
				name,
				level,
				prepared: true,
				concentration: concCheck.checked,
				notes: spNotesIn.value.trim(),
			});
			void this.commit();
		});
	}

	private renderInventoryTab(parent: HTMLElement): void {
		// Currency Bar
		const curSection = parent.createDiv({ cls: "dnd-section" });
		curSection.createDiv({ cls: "dnd-section-title", text: "🪙 Currency" });

		const curGrid = curSection.createDiv({ cls: "dnd-currency-grid" });
		const coins: { key: keyof DndCharacter["currency"]; label: string }[] = [
			{ key: "pp", label: "PP" },
			{ key: "gp", label: "GP" },
			{ key: "ep", label: "EP" },
			{ key: "sp", label: "SP" },
			{ key: "cp", label: "CP" },
		];

		for (const coin of coins) {
			const box = curGrid.createDiv({ cls: `dnd-coin-box coin-${coin.key}` });
			box.createSpan({ cls: "dnd-coin-label", text: coin.label });
			const input = box.createEl("input", {
				type: "number",
				cls: "dnd-coin-input",
				value: String(this.character.currency[coin.key]),
				attr: { min: "0" },
			});
			input.addEventListener("change", () => {
				this.character.currency[coin.key] = Math.max(
					0,
					Number.parseInt(input.value, 10) || 0,
				);
				void this.commit();
			});
		}

		// Equipment & Encumbrance
		const invSection = parent.createDiv({ cls: "dnd-section" });
		const enc = encumbranceStats(this.character);
		const invHeader = invSection.createDiv({ cls: "dnd-inv-header" });
		invHeader.createSpan({ cls: "dnd-section-title", text: "🎒 Equipment & Inventory" });
		invHeader.createSpan({
			cls: `dnd-encumbrance-badge ${enc.isEncumbered ? "is-encumbered" : ""}`,
			text: `Weight: ${enc.totalWeight} / ${enc.maxCarry} lb`,
		});

		const invList = invSection.createDiv({ cls: "dnd-inv-list" });
		for (const item of this.character.inventory) {
			const row = invList.createDiv({ cls: "dnd-inv-row" });

			const eqBtn = row.createEl("button", {
				cls: `dnd-equip-toggle ${item.equipped ? "is-equipped" : ""}`,
				text: item.equipped ? "Equipped" : "Carried",
			});
			eqBtn.addEventListener("click", () => {
				item.equipped = !item.equipped;
				void this.commit();
			});

			const info = row.createDiv({ cls: "dnd-inv-info" });
			info.createSpan({ cls: "dnd-inv-name", text: item.name });
			if (item.notes) {
				info.createSpan({ cls: "dnd-inv-notes", text: item.notes });
			}

			const meta = row.createDiv({ cls: "dnd-inv-meta" });
			const decQty = meta.createEl("button", { cls: "dnd-micro-btn", text: "−" });
			decQty.addEventListener("click", () => {
				item.qty = Math.max(0, item.qty - 1);
				if (item.qty === 0) {
					this.character.inventory = this.character.inventory.filter((i) => i.id !== item.id);
				}
				void this.commit();
			});
			meta.createSpan({ cls: "dnd-inv-qty", text: `×${item.qty}` });
			const incQty = meta.createEl("button", { cls: "dnd-micro-btn", text: "+" });
			incQty.addEventListener("click", () => {
				item.qty += 1;
				void this.commit();
			});

			meta.createSpan({
				cls: "dnd-inv-weight",
				text: `${Math.round(item.weight * item.qty * 10) / 10} lb`,
			});

			const delBtn = meta.createEl("button", {
				cls: "dnd-delete-btn",
				text: "×",
			});
			delBtn.addEventListener("click", () => {
				this.character.inventory = this.character.inventory.filter((i) => i.id !== item.id);
				void this.commit();
			});
		}

		// Add Item Row
		const addItemRow = invSection.createDiv({ cls: "dnd-add-row" });
		const nameIn = addItemRow.createEl("input", {
			type: "text",
			placeholder: "Item name",
		});
		const qtyIn = addItemRow.createEl("input", {
			type: "number",
			placeholder: "Qty",
			value: "1",
			attr: { min: "1" },
		});
		const weightIn = addItemRow.createEl("input", {
			type: "number",
			placeholder: "Weight (lb)",
			value: "1",
			attr: { min: "0", step: "0.5" },
		});
		const notesIn = addItemRow.createEl("input", {
			type: "text",
			placeholder: "Notes (optional)",
		});
		const addBtn = addItemRow.createEl("button", {
			cls: "dnd-action-btn",
			text: "+ Add Item",
		});
		addBtn.addEventListener("click", () => {
			const name = nameIn.value.trim();
			if (!name) return;
			this.character.inventory.push({
				id: `item-${Date.now()}`,
				name,
				qty: Math.max(1, Number.parseInt(qtyIn.value, 10) || 1),
				weight: Math.max(0, Number.parseFloat(weightIn.value) || 0),
				equipped: false,
				notes: notesIn.value.trim(),
			});
			void this.commit();
		});
	}

	private renderNotesTab(parent: HTMLElement): void {
		const featSection = parent.createDiv({ cls: "dnd-section" });
		featSection.createDiv({ cls: "dnd-section-title", text: "📜 Class Features, Traits & Feats" });
		const featArea = featSection.createEl("textarea", {
			cls: "dnd-textarea",
			placeholder: "Record class features, racial traits, feats, proficiencies...",
		});
		featArea.value = this.character.features ?? "";
		featArea.addEventListener("change", () => {
			this.character.features = featArea.value;
			void this.commit();
		});

		const notesSection = parent.createDiv({ cls: "dnd-section" });
		notesSection.createDiv({ cls: "dnd-section-title", text: "📝 Session & Character Notes" });
		const notesArea = notesSection.createEl("textarea", {
			cls: "dnd-textarea",
			placeholder: "Session log, NPCs, quests, backstory...",
		});
		notesArea.value = this.character.notes ?? "";
		notesArea.addEventListener("change", () => {
			this.character.notes = notesArea.value;
			void this.commit();
		});
	}
}
