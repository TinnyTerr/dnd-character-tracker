import { ItemView, Notice, TFile, type WorkspaceLeaf } from "obsidian";
import {
	applyDamage,
	applyHealing,
	formatModifier,
	initiativeModifier,
	passiveScore,
	rollD20,
	takeLongRest,
	takeShortRest,
} from "./mechanics";
import { extractCharactersFromNote, updateCharacterBlockInNote } from "./storage";
import type { DndCharacter } from "./types";

export const PARTY_VIEW_TYPE = "dnd-character-party-view";

export interface TrackedCharacterRef {
	file: TFile;
	character: DndCharacter;
}

export class PartySidebarView extends ItemView {
	private tracked: TrackedCharacterRef[] = [];
	private onOpenCreateModal: () => void;
	private onOpenDiceModal: () => void;

	constructor(
		leaf: WorkspaceLeaf,
		callbacks: {
			onOpenCreateModal: () => void;
			onOpenDiceModal: () => void;
		},
	) {
		super(leaf);
		this.onOpenCreateModal = callbacks.onOpenCreateModal;
		this.onOpenDiceModal = callbacks.onOpenDiceModal;
	}

	override getViewType(): string {
		return PARTY_VIEW_TYPE;
	}

	override getDisplayText(): string {
		return "D&D Party Tracker";
	}

	override getIcon(): string {
		return "shield";
	}

	override async onOpen(): Promise<void> {
		await this.refresh();
	}

	public async refresh(): Promise<void> {
		const files = this.app.vault.getMarkdownFiles();
		const list: TrackedCharacterRef[] = [];

		for (const file of files) {
			const cached = await this.app.vault.cachedRead(file);
			if (!cached.includes("```dnd-character")) continue;
			const chars = extractCharactersFromNote(cached);
			for (const character of chars) {
				list.push({ file, character });
			}
		}

		list.sort((a, b) => a.character.name.localeCompare(b.character.name));
		this.tracked = list;
		this.render();
	}

	private async saveCharacterRef(ref: TrackedCharacterRef): Promise<void> {
		const raw = await this.app.vault.read(ref.file);
		const updatedText = updateCharacterBlockInNote(raw, ref.character, null);
		if (updatedText !== raw) {
			await this.app.vault.modify(ref.file, updatedText);
		}
		await this.refresh();
	}

	private render(): void {
		const container = this.containerEl.children[1] as HTMLElement | undefined;
		if (!container) return;
		container.empty();
		container.addClass("dnd-party-sidebar");

		const header = container.createDiv({ cls: "dnd-sidebar-header" });
		header.createEl("h3", { text: "🛡️ D&D Party Tracker" });

		const toolbar = container.createDiv({ cls: "dnd-sidebar-toolbar" });
		const newBtn = toolbar.createEl("button", {
			cls: "dnd-action-btn dnd-btn-primary",
			text: "+ Character",
		});
		newBtn.addEventListener("click", () => this.onOpenCreateModal());

		const diceBtn = toolbar.createEl("button", {
			cls: "dnd-action-btn",
			text: "🎲 Dice",
		});
		diceBtn.addEventListener("click", () => this.onOpenDiceModal());

		const refreshBtn = toolbar.createEl("button", {
			cls: "dnd-icon-btn",
			text: "↻",
			attr: { title: "Refresh vault characters" },
		});
		refreshBtn.addEventListener("click", () => {
			void this.refresh();
		});

		if (this.tracked.length === 0) {
			const empty = container.createDiv({ cls: "dnd-sidebar-empty" });
			empty.createEl("p", {
				text: "No D&D characters found in your vault yet.",
			});
			empty.createEl("p", {
				cls: "dnd-empty-hint",
				text: "Click '+ Character' above or run 'D&D: Create new character note' from the command palette.",
			});
			return;
		}

		// Party bulk actions
		const partyActions = container.createDiv({ cls: "dnd-party-bulk-bar" });
		const partyLongRestBtn = partyActions.createEl("button", {
			cls: "dnd-mini-btn",
			text: "🌙 Party Long Rest",
		});
		partyLongRestBtn.addEventListener("click", async () => {
			for (const ref of this.tracked) {
				takeLongRest(ref.character);
				const raw = await this.app.vault.read(ref.file);
				const next = updateCharacterBlockInNote(raw, ref.character, null);
				if (next !== raw) await this.app.vault.modify(ref.file, next);
			}
			new Notice(`🌙 Party Long Rest complete for ${this.tracked.length} characters!`);
			await this.refresh();
		});

		const listEl = container.createDiv({ cls: "dnd-party-list" });
		for (const ref of this.tracked) {
			const char = ref.character;
			const card = listEl.createDiv({ cls: "dnd-party-card" });

			const topRow = card.createDiv({ cls: "dnd-party-card-top" });
			const titleLink = topRow.createEl("a", {
				cls: "dnd-party-name",
				text: char.name,
				attr: { title: `Open ${ref.file.path}` },
			});
			titleLink.addEventListener("click", () => {
				void this.app.workspace.getLeaf(false).openFile(ref.file);
			});

			topRow.createSpan({
				cls: "dnd-party-meta",
				text: `Lvl ${char.level} ${char.className}`,
			});

			// Vitals badges
			const badges = card.createDiv({ cls: "dnd-party-badges" });
			badges.createSpan({
				cls: "dnd-party-badge is-hp",
				text: `❤️ ${char.hp.current}/${char.hp.max}${char.hp.temp > 0 ? ` (+${char.hp.temp})` : ""}`,
			});
			badges.createSpan({
				cls: "dnd-party-badge",
				text: `🛡️ AC ${char.ac}`,
			});
			badges.createSpan({
				cls: "dnd-party-badge",
				text: `👁️ PP ${passiveScore(char, "perception")}`,
			});

			if (char.concentration) {
				card.createDiv({
					cls: "dnd-party-conc",
					text: `🔮 ${char.concentration}`,
				});
			}

			if (char.conditions.length > 0) {
				card.createDiv({
					cls: "dnd-party-conds",
					text: `⚠️ ${char.conditions.join(", ")}`,
				});
			}

			// Quick actions in sidebar card
			const ctrl = card.createDiv({ cls: "dnd-party-controls" });
			const dmg1Btn = ctrl.createEl("button", {
				cls: "dnd-micro-btn is-dmg",
				text: "−1 HP",
			});
			dmg1Btn.addEventListener("click", () => {
				applyDamage(char, 1);
				void this.saveCharacterRef(ref);
			});

			const dmg5Btn = ctrl.createEl("button", {
				cls: "dnd-micro-btn is-dmg",
				text: "−5 HP",
			});
			dmg5Btn.addEventListener("click", () => {
				applyDamage(char, 5);
				void this.saveCharacterRef(ref);
			});

			const heal5Btn = ctrl.createEl("button", {
				cls: "dnd-micro-btn is-heal",
				text: "+5 HP",
			});
			heal5Btn.addEventListener("click", () => {
				applyHealing(char, 5);
				void this.saveCharacterRef(ref);
			});

			const initBtn = ctrl.createEl("button", {
				cls: "dnd-micro-btn",
				text: "🎲 Init",
				attr: { title: "Roll Initiative" },
			});
			initBtn.addEventListener("click", () => {
				const mod = initiativeModifier(char);
				const res = rollD20(mod, "normal");
				new Notice(`🎲 ${char.name} Initiative: ${res.total} (1d20${formatModifier(mod)})`);
			});

			const srBtn = ctrl.createEl("button", {
				cls: "dnd-micro-btn",
				text: "⛺",
				attr: { title: "Short Rest" },
			});
			srBtn.addEventListener("click", () => {
				takeShortRest(char, 1);
				void this.saveCharacterRef(ref);
			});
		}
	}
}
