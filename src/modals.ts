import { type App, Modal, Notice, Setting, TFile } from "obsidian";
import { abilityModifier, formatModifier, rollD20, rollFormula } from "./mechanics";
import { CHARACTER_PRESETS } from "./presets";
import { buildCharacterNoteMarkdown, serializeCharacterBlock } from "./storage";
import { ABILITIES, type AbilityKey, type DndCharacter } from "./types";

export class CreateCharacterModal extends Modal {
	private presetId = CHARACTER_PRESETS[0]!.id;
	private charName = "Garrick Thorne";
	private race = "Human";
	private className = "Fighter";
	private level = 1;
	private background = "Soldier";
	private maxHp = 12;
	private ac = 16;
	private abilities: Record<AbilityKey, number> = {
		str: 16,
		dex: 13,
		con: 14,
		int: 10,
		wis: 12,
		cha: 8,
	};
	private mode: "new-note" | "insert-block";
	private folder: string;
	private onCreated: (character: DndCharacter, file?: TFile) => void;

	constructor(
		app: App,
		options: {
			mode: "new-note" | "insert-block";
			folder: string;
			onCreated: (character: DndCharacter, file?: TFile) => void;
		},
	) {
		super(app);
		this.mode = options.mode;
		this.folder = options.folder;
		this.onCreated = options.onCreated;
	}

	private applyPreset(id: string): void {
		const preset = CHARACTER_PRESETS.find((p) => p.id === id);
		if (!preset) return;
		this.presetId = preset.id;
		const sample = preset.build(this.charName || undefined);
		this.charName = sample.name;
		this.race = sample.race;
		this.className = sample.className;
		this.level = sample.level;
		this.background = sample.background;
		this.maxHp = sample.hp.max;
		this.ac = sample.ac;
		this.abilities = { ...sample.abilities };
	}

	override onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("dnd-modal");

		contentEl.createEl("h2", {
			text:
				this.mode === "new-note"
					? "🐉 Create New D&D 5e Character Note"
					: "🐉 Insert D&D 5e Character Block",
		});

		new Setting(contentEl)
			.setName("Class Preset / Archetype")
			.setDesc("Start from a pre-configured 5e class kit or customize below")
			.addDropdown((drop) => {
				for (const preset of CHARACTER_PRESETS) {
					drop.addOption(preset.id, preset.label);
				}
				drop.setValue(this.presetId);
				drop.onChange((val) => {
					this.applyPreset(val);
					this.onOpen();
				});
			});

		new Setting(contentEl)
			.setName("Character Name")
			.addText((text) =>
				text.setValue(this.charName).onChange((v) => {
					this.charName = v.trim() || "New Adventurer";
				}),
			);

		new Setting(contentEl)
			.setName("Race & Class")
			.addText((text) =>
				text
					.setPlaceholder("Race (e.g. Half-Elf)")
					.setValue(this.race)
					.onChange((v) => {
						this.race = v.trim();
					}),
			)
			.addText((text) =>
				text
					.setPlaceholder("Class (e.g. Bard)")
					.setValue(this.className)
					.onChange((v) => {
						this.className = v.trim();
					}),
			);

		new Setting(contentEl)
			.setName("Level & Background")
			.addText((text) =>
				text
					.setPlaceholder("Level (1-20)")
					.setValue(String(this.level))
					.onChange((v) => {
						const parsed = Number.parseInt(v, 10);
						if (!Number.isNaN(parsed)) {
							this.level = Math.max(1, Math.min(20, parsed));
						}
					}),
			)
			.addText((text) =>
				text
					.setPlaceholder("Background")
					.setValue(this.background)
					.onChange((v) => {
						this.background = v.trim();
					}),
			);

		new Setting(contentEl)
			.setName("Max HP & Armor Class (AC)")
			.addText((text) =>
				text
					.setPlaceholder("Max HP")
					.setValue(String(this.maxHp))
					.onChange((v) => {
						const parsed = Number.parseInt(v, 10);
						if (!Number.isNaN(parsed)) {
							this.maxHp = Math.max(1, parsed);
						}
					}),
			)
			.addText((text) =>
				text
					.setPlaceholder("AC")
					.setValue(String(this.ac))
					.onChange((v) => {
						const parsed = Number.parseInt(v, 10);
						if (!Number.isNaN(parsed)) {
							this.ac = Math.max(1, parsed);
						}
					}),
			);

		// Ability scores row
		const abWrap = contentEl.createDiv({ cls: "dnd-modal-abilities" });
		abWrap.createEl("h4", { text: "Ability Scores" });
		const abGrid = abWrap.createDiv({ cls: "dnd-modal-ab-grid" });

		for (const ab of ABILITIES) {
			const box = abGrid.createDiv({ cls: "dnd-modal-ab-box" });
			box.createSpan({ cls: "dnd-modal-ab-label", text: ab.short });
			const input = box.createEl("input", {
				type: "number",
				value: String(this.abilities[ab.key]),
				attr: { min: "1", max: "30" },
			});
			const modSpan = box.createSpan({
				cls: "dnd-modal-ab-mod",
				text: formatModifier(abilityModifier(this.abilities[ab.key])),
			});
			input.addEventListener("input", () => {
				const val = Math.max(1, Math.min(30, Number.parseInt(input.value, 10) || 10));
				this.abilities[ab.key] = val;
				modSpan.setText(formatModifier(abilityModifier(val)));
			});
		}

		// Roll 4d6 drop lowest button
		const rollStatsBtn = abWrap.createEl("button", {
			cls: "dnd-action-btn",
			text: "🎲 Roll 4d6 Drop Lowest for All",
		});
		rollStatsBtn.addEventListener("click", () => {
			for (const ab of ABILITIES) {
				const rolls = [1, 2, 3, 4]
					.map(() => Math.floor(Math.random() * 6) + 1)
					.sort((a, b) => b - a);
				this.abilities[ab.key] = rolls[0]! + rolls[1]! + rolls[2]!;
			}
			this.onOpen();
		});

		const footer = contentEl.createDiv({ cls: "dnd-modal-footer" });
		const cancelBtn = footer.createEl("button", {
			cls: "dnd-action-btn",
			text: "Cancel",
		});
		cancelBtn.addEventListener("click", () => this.close());

		const submitBtn = footer.createEl("button", {
			cls: "dnd-action-btn dnd-btn-primary",
			text: this.mode === "new-note" ? "Create Character Note" : "Insert Character Sheet",
		});
		submitBtn.addEventListener("click", () => {
			void this.handleSubmit();
		});
	}

	private async handleSubmit(): Promise<void> {
		const preset =
			CHARACTER_PRESETS.find((p) => p.id === this.presetId) ?? CHARACTER_PRESETS[0]!;
		const character = preset.build(this.charName);
		character.name = this.charName;
		character.race = this.race;
		character.className = this.className;
		character.level = this.level;
		character.background = this.background;
		character.hp.max = this.maxHp;
		character.hp.current = this.maxHp;
		character.hitDice.max = this.level;
		character.hitDice.current = this.level;
		character.ac = this.ac;
		character.abilities = { ...this.abilities };

		if (this.mode === "insert-block") {
			this.onCreated(character);
			this.close();
			return;
		}

		// Create new note in vault
		const folderPath = this.folder.trim().replace(/^\/+|\/+$/g, "");
		if (folderPath) {
			const existingFolder = this.app.vault.getAbstractFileByPath(folderPath);
			if (!existingFolder) {
				await this.app.vault.createFolder(folderPath);
			}
		}

		const safeFileName = this.charName.replace(/[\\/:*?"<>|]/g, "-").trim() || "Character";
		let targetPath = folderPath ? `${folderPath}/${safeFileName}.md` : `${safeFileName}.md`;
		let counter = 2;
		while (this.app.vault.getAbstractFileByPath(targetPath)) {
			targetPath = folderPath
				? `${folderPath}/${safeFileName} ${counter}.md`
				: `${safeFileName} ${counter}.md`;
			counter++;
		}

		const content = buildCharacterNoteMarkdown(character);
		const file = await this.app.vault.create(targetPath, content);
		new Notice(`🐉 Created character sheet: ${file.path}`);
		this.onCreated(character, file);
		this.close();
	}
}

export class DiceRollerModal extends Modal {
	private formula = "1d20+5";
	private history: { label: string; total: number; detail: string }[] = [];

	override onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("dnd-modal");

		contentEl.createEl("h2", { text: "🎲 D&D Dice Roller" });

		const quickRow = contentEl.createDiv({ cls: "dnd-quick-dice-buttons" });
		for (const die of ["1d4", "1d6", "1d8", "1d10", "1d12", "1d20", "2d6", "4d6", "1d100"]) {
			const btn = quickRow.createEl("button", {
				cls: "dnd-action-btn",
				text: `🎲 ${die}`,
			});
			btn.addEventListener("click", () => {
				const res = rollFormula(die);
				if (res) {
					this.recordRoll(die, res.total, `[${res.rolls.join(", ")}]`);
				}
			});
		}

		const advRow = contentEl.createDiv({ cls: "dnd-quick-dice-buttons" });
		const advBtn = advRow.createEl("button", {
			cls: "dnd-action-btn",
			text: "1d20 Advantage",
		});
		advBtn.addEventListener("click", () => {
			const res = rollD20(0, "advantage");
			this.recordRoll("d20 (Advantage)", res.total, `[${res.rolls.join(", ")} → ${res.total}]`);
		});

		const disBtn = advRow.createEl("button", {
			cls: "dnd-action-btn",
			text: "1d20 Disadvantage",
		});
		disBtn.addEventListener("click", () => {
			const res = rollD20(0, "disadvantage");
			this.recordRoll("d20 (Disadvantage)", res.total, `[${res.rolls.join(", ")} → ${res.total}]`);
		});

		new Setting(contentEl)
			.setName("Custom Formula")
			.setDesc("Format: NdS+M (e.g., 2d6+3, 1d20-1, 8d6)")
			.addText((text) =>
				text.setValue(this.formula).onChange((v) => {
					this.formula = v;
				}),
			)
			.addButton((btn) =>
				btn
					.setButtonText("Roll Formula")
					.setCta()
					.onClick(() => {
						const res = rollFormula(this.formula);
						if (!res) {
							new Notice("Invalid formula. Example: 2d6+3");
							return;
						}
						this.recordRoll(res.formula, res.total, `[${res.rolls.join(", ")}]`);
					}),
			);

		if (this.history.length > 0) {
			const histSection = contentEl.createDiv({ cls: "dnd-modal-history" });
			histSection.createEl("h4", { text: "Recent Rolls" });
			for (const item of this.history.slice(0, 8)) {
				const row = histSection.createDiv({ cls: "dnd-modal-hist-row" });
				row.createSpan({ text: `${item.label} ${item.detail}` });
				row.createSpan({ cls: "dnd-roll-total", text: String(item.total) });
			}
		}
	}

	private recordRoll(label: string, total: number, detail: string): void {
		this.history.unshift({ label, total, detail });
		new Notice(`🎲 ${label}: ${total} ${detail}`);
		this.onOpen();
	}
}

export function buildCharacterCodeblockFence(character: DndCharacter): string {
	return ["```dnd-character", serializeCharacterBlock(character), "```", ""].join("\n");
}
