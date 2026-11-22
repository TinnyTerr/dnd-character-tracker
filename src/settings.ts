import {
	type App,
	PluginSettingTab,
	requireApiVersion,
	Setting,
	type SettingDefinitionItem,
} from "obsidian";
import type DndCharacterTrackerPlugin from "./main";
import type { DndPluginSettings } from "./types";

type SettingKey = keyof DndPluginSettings;

export class DndSettingTab extends PluginSettingTab {
	plugin: DndCharacterTrackerPlugin;

	constructor(app: App, plugin: DndCharacterTrackerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/** Declarative settings (Obsidian 1.13.0+): rendered natively and indexed by settings search. */
	override getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: "Default characters folder",
				desc: "Vault folder where newly created character notes are stored.",
				control: {
					type: "text",
					key: "charactersFolder",
					placeholder: "Characters",
					defaultValue: "Characters",
				},
			},
			{
				name: "Show dice roll notifications",
				desc: "Display an Obsidian toast notice whenever a roll is made on a character sheet.",
				control: {
					type: "toggle",
					key: "showDiceNotices",
					defaultValue: true,
				},
			},
		];
	}

	override getControlValue(key: string): unknown {
		return this.plugin.pluginSettings[key as SettingKey];
	}

	override async setControlValue(key: string, value: unknown): Promise<void> {
		const settings = this.plugin.pluginSettings;
		if (key === "charactersFolder") {
			settings.charactersFolder = (typeof value === "string" ? value.trim() : "") || "Characters";
		} else if (key === "showDiceNotices") {
			settings.showDiceNotices = Boolean(value);
		} else {
			return;
		}
		await this.plugin.saveSettings();
	}

	override display(): void {
		if (requireApiVersion("1.13.0")) {
			// Native declarative rendering from getSettingDefinitions().
			super.display();
			return;
		}

		// Imperative fallback for Obsidian versions older than 1.13.0.
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Default characters folder")
			.setHeading("D&D Character Tracker Settings")
			.setDesc("Vault folder where newly created character notes are stored.")
			.addText((text) =>
				text
					.setPlaceholder("Characters")
					.setValue(this.plugin.pluginSettings.charactersFolder)
					.onChange(async (value) => {
						await this.setControlValue("charactersFolder", value);
					}),
			);

		new Setting(containerEl)
			.setName("Show dice roll notifications")
			.setDesc("Display an Obsidian toast notice whenever a roll is made on a character sheet.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.pluginSettings.showDiceNotices)
					.onChange(async (value) => {
						await this.setControlValue("showDiceNotices", value);
					}),
			);
	}
}
