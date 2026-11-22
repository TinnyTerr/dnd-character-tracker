import { type App, PluginSettingTab, Setting } from "obsidian";
import type DndCharacterTrackerPlugin from "./main";

export class DndSettingTab extends PluginSettingTab {
	plugin: DndCharacterTrackerPlugin;

	constructor(app: App, plugin: DndCharacterTrackerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	override display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "D&D Character Tracker Settings" });

		new Setting(containerEl)
			.setName("Default characters folder")
			.setDesc("Vault folder where newly created character notes are stored.")
			.addText((text) =>
				text
					.setPlaceholder("Characters")
					.setValue(this.plugin.pluginSettings.charactersFolder)
					.onChange(async (value) => {
						this.plugin.pluginSettings.charactersFolder = value.trim() || "Characters";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Show dice roll notifications")
			.setDesc("Display an Obsidian toast notice whenever a roll is made on a character sheet.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.pluginSettings.showDiceNotices)
					.onChange(async (value) => {
						this.plugin.pluginSettings.showDiceNotices = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
