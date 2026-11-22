import { normalizeCharacter } from "./mechanics";
import type { DndCharacter } from "./types";

/**
 * Parse a `dnd-character` codeblock payload (JSON) into a normalized DndCharacter.
 */
export function parseCharacterBlock(source: string): {
	character: DndCharacter;
	error: string | null;
} {
	const trimmed = source.trim();
	if (!trimmed) {
		return {
			character: normalizeCharacter({}),
			error: null,
		};
	}

	try {
		const raw = JSON.parse(trimmed) as unknown;
		return {
			character: normalizeCharacter(raw),
			error: null,
		};
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return {
			character: normalizeCharacter({}),
			error: `Invalid JSON in dnd-character block: ${msg}`,
		};
	}
}

/**
 * Serialize a DndCharacter cleanly to formatted JSON for inside a `dnd-character` fence.
 */
export function serializeCharacterBlock(character: DndCharacter): string {
	return JSON.stringify(character, null, 2);
}

/**
 * Replace a `dnd-character` fenced block in a note's markdown text.
 * Uses `lineStart` and `lineEnd` from Obsidian's `getSectionInfo` when available,
 * or falls back to matching the Nth (or first matching by name) `dnd-character` block.
 */
export function updateCharacterBlockInNote(
	noteText: string,
	updated: DndCharacter,
	sectionInfo?: { lineStart: number; lineEnd: number } | null,
): string {
	const serialized = serializeCharacterBlock(updated);

	if (sectionInfo && sectionInfo.lineStart >= 0 && sectionInfo.lineEnd >= sectionInfo.lineStart) {
		const lines = noteText.split("\n");
		const startLine = lines[sectionInfo.lineStart] ?? "";
		const endLine = lines[sectionInfo.lineEnd] ?? "";
		if (startLine.trim().startsWith("```dnd-character") && endLine.trim().startsWith("```")) {
			const before = lines.slice(0, sectionInfo.lineStart + 1);
			const after = lines.slice(sectionInfo.lineEnd);
			return [...before, serialized, ...after].join("\n");
		}
	}

	// Fallback: regex search for ```dnd-character ... ``` blocks
	const fenceRegex = /(^```dnd-character[^\n]*\n)([\s\S]*?)(^```)/gm;
	let replaced = false;

	const nextText = noteText.replace(
		fenceRegex,
		(fullMatch, openFence: string, body: string, closeFence: string) => {
			if (replaced) return fullMatch;
			try {
				const parsed = JSON.parse(body.trim()) as { name?: string };
				if (parsed.name && parsed.name === updated.name) {
					replaced = true;
					return `${openFence}${serialized}\n${closeFence}`;
				}
			} catch {
				// Ignore parse failure during name match
			}
			return fullMatch;
		},
	);

	if (replaced) return nextText;

	// If name didn't match (e.g. character was just renamed), replace the first dnd-character block
	return noteText.replace(
		/(^```dnd-character[^\n]*\n)([\s\S]*?)(^```)/m,
		`$1${serialized}\n$3`,
	);
}

/**
 * Extract all `dnd-character` blocks from a markdown document.
 */
export function extractCharactersFromNote(noteText: string): DndCharacter[] {
	const results: DndCharacter[] = [];
	const fenceRegex = /^```dnd-character[^\n]*\n([\s\S]*?)^```/gm;
	for (let match = fenceRegex.exec(noteText); match !== null; match = fenceRegex.exec(noteText)) {
		const body = match[1] ?? "";
		const { character, error } = parseCharacterBlock(body);
		if (!error) {
			results.push(character);
		}
	}
	return results;
}

/**
 * Generate a complete Markdown note containing frontmatter and an interactive `dnd-character` codeblock.
 */
export function buildCharacterNoteMarkdown(character: DndCharacter): string {
	const serialized = serializeCharacterBlock(character);
	return [
		"---",
		`tags: [dnd, character]`,
		`character_name: "${character.name.replace(/"/g, '\\"')}"`,
		`class: "${character.className.replace(/"/g, '\\"')}"`,
		`race: "${character.race.replace(/"/g, '\\"')}"`,
		`level: ${character.level}`,
		"---",
		"",
		`# ${character.name}`,
		"",
		"```dnd-character",
		serialized,
		"```",
		"",
		"## Campaign Notes & Backstory",
		"",
		"- ",
		"",
	].join("\n");
}
