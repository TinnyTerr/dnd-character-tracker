import {
	type Editor,
	type MarkdownPostProcessorContext,
	type MarkdownView,
	Notice,
	Plugin,
	TFile,
} from "obsidian";
import { takeLongRest, takeShortRest } from "./mechanics";
import {
	buildCharacterCodeblockFence,
	CreateCharacterModal,
	DiceRollerModal,
} from "./modals";
import { PARTY_VIEW_TYPE, PartySidebarView } from "./party-view";
import { DndSettingTab } from "./settings";
import { CharacterSheetRenderer } from "./sheet-renderer";
import {
	extractCharactersFromNote,
	parseCharacterBlock,
	updateCharacterBlockInNote,
} from "./storage";
import { DEFAULT_SETTINGS, type DndCharacter, type DndPluginSettings } from "./types";

export default class DndCharacterTrackerPlugin extends Plugin {
	pluginSettings: DndPluginSettings = { ...DEFAULT_SETTINGS };

	override async onload(): Promise<void> {
		await this.loadSettings();

		// Register Party Sidebar View
		this.registerView(
			PARTY_VIEW_TYPE,
			(leaf) =>
				new PartySidebarView(leaf, {
					onOpenCreateModal: () => this.openCreateCharacterModal("new-note"),
					onOpenDiceModal: () => new DiceRollerModal(this.app).open(),
				}),
		);

		// Register Ribbon Icon
		this.addRibbonIcon("shield", "Open D&D Party Tracker", () => {
			void this.activatePartyView();
		});

		// Register `dnd-character` codeblock processor
		this.registerMarkdownCodeBlockProcessor(
			"dnd-character",
			(source, el, ctx) => {
				this.renderCharacterCodeBlock(source, el, ctx);
			},
		);

		// Register Commands
		this.addCommand({
			id: "create-dnd-character-note",
			name: "Create new D&D character note",
			callback: () => {
				this.openCreateCharacterModal("new-note");
			},
		});

		this.addCommand({
			id: "insert-dnd-character-block",
			name: "Insert D&D character sheet block in current note",
			editorCallback: (editor: Editor) => {
				this.openCreateCharacterModal("insert-block", editor);
			},
		});

		this.addCommand({
			id: "open-dnd-party-tracker",
			name: "Open D&D Party Tracker sidebar",
			callback: () => {
				void this.activatePartyView();
			},
		});

		this.addCommand({
			id: "open-dnd-dice-roller",
			name: "Open D&D Dice Roller",
			callback: () => {
				new DiceRollerModal(this.app).open();
			},
		});

		this.addCommand({
			id: "dnd-short-rest-active-note",
			name: "Take Short Rest for character in active note",
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (!file) return false;
				if (!checking) {
					void this.restActiveNoteCharacter("short");
				}
				return true;
			},
		});

		this.addCommand({
			id: "dnd-long-rest-active-note",
			name: "Take Long Rest for character in active note",
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (!file) return false;
				if (!checking) {
					void this.restActiveNoteCharacter("long");
				}
				return true;
			},
		});

		// Refresh party sidebar when markdown files change
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (file instanceof TFile && file.extension === "md") {
					this.refreshPartyViews();
				}
			}),
		);

		this.addSettingTab(new DndSettingTab(this.app, this));
	}

	override onunload(): void {
		// Obsidian automatically cleans up views and processors
	}

	private renderCharacterCodeBlock(
		source: string,
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext,
	): void {
		const { character, error } = parseCharacterBlock(source);
		if (error) {
			const errBox = el.createDiv({ cls: "dnd-error-box" });
			errBox.createEl("strong", { text: "⚠️ D&D Character Block Error" });
			errBox.createEl("p", { text: error });
			return;
		}

		const sheet = new CharacterSheetRenderer(el, character, {
			onSave: async (updated: DndCharacter) => {
				await this.persistCharacterBlock(ctx, el, updated);
			},
			onRollNotice: (label, result) => {
				if (!this.pluginSettings.showDiceNotices) return;
				const critText = result.isCriticalHit
					? " (CRITICAL 20!)"
					: result.isCriticalFail
						? " (NAT 1!)"
						: "";
				new Notice(
					`🎲 ${character.name} — ${label}: ${result.total} [${result.rolls.join(", ")} | ${result.formula}]${critText}`,
				);
			},
		});

		sheet.render();
	}

	private async persistCharacterBlock(
		ctx: MarkdownPostProcessorContext,
		el: HTMLElement,
		updated: DndCharacter,
	): Promise<void> {
		const abstractFile = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
		if (!(abstractFile instanceof TFile)) {
			new Notice("Could not locate markdown file to save character state.");
			return;
		}

		const sectionInfo = ctx.getSectionInfo(el);
		const currentContent = await this.app.vault.read(abstractFile);
		const nextContent = updateCharacterBlockInNote(
			currentContent,
			updated,
			sectionInfo,
		);

		if (nextContent !== currentContent) {
			await this.app.vault.modify(abstractFile, nextContent);
		}
	}

	private openCreateCharacterModal(
		mode: "new-note" | "insert-block",
		editor?: Editor,
	): void {
		new CreateCharacterModal(this.app, {
			mode,
			folder: this.pluginSettings.charactersFolder,
			onCreated: (character, file) => {
				if (mode === "insert-block" && editor) {
					const block = buildCharacterCodeblockFence(character);
					editor.replaceSelection(block);
				} else if (file) {
					void this.app.workspace.getLeaf(false).openFile(file);
				}
				this.refreshPartyViews();
			},
		}).open();
	}

	private async restActiveNoteCharacter(type: "short" | "long"): Promise<void> {
		const file = this.app.workspace.getActiveFile();
		if (!file) return;

		const content = await this.app.vault.read(file);
		const chars = extractCharactersFromNote(content);
		if (chars.length === 0) {
			new Notice("No D&D character block found in the active note.");
			return;
		}

		const character = chars[0]!;
		if (type === "short") {
			const res = takeShortRest(character, 1);
			new Notice(
				`⛺ Short Rest (${character.name}): +${res.hpHealed} HP (${res.hitDiceSpent} Hit Die)`,
			);
		} else {
			const res = takeLongRest(character);
			new Notice(
				`🌙 Long Rest (${character.name}): Full HP (+${res.hpRestored}), +${res.hitDiceRestored} Hit Dice, all spell slots restored`,
			);
		}

		const next = updateCharacterBlockInNote(content, character, null);
		if (next !== content) {
			await this.app.vault.modify(file, next);
		}
	}

	private async activatePartyView(): Promise<void> {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(PARTY_VIEW_TYPE)[0];
		if (!leaf) {
			const rightLeaf = workspace.getRightLeaf(false);
			if (rightLeaf) {
				leaf = rightLeaf;
				await leaf.setViewState({
					type: PARTY_VIEW_TYPE,
					active: true,
				});
			}
		}
		if (leaf) {
			void workspace.revealLeaf(leaf);
		}
	}

	private refreshPartyViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(PARTY_VIEW_TYPE)) {
			const view = leaf.view;
			if (view instanceof PartySidebarView) {
				void view.refresh();
			}
		}
	}

	async loadSettings(): Promise<void> {
		this.pluginSettings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.pluginSettings);
	}
}
