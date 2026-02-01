import fs from 'fs/promises';
import path from 'path';

/**
 * This script synchronizes common rules from docs/rules/common.md
 * into various Agent configuration files (GEMINI.md, CLAUDE.md, Agent.md, .cursorrules).
 */

const COMMON_RULES_PATH = path.resolve('.agent/rules/common.md');
const TARGET_FILES = [
    'GEMINI.md',
    'CLAUDE.md',
    'Agent.md',
];

const START_TAG = '<!-- RULES_START -->';
const END_TAG = '<!-- RULES_END -->';

async function syncRules() {
    try {
        const commonRulesContent = await fs.readFile(COMMON_RULES_PATH, 'utf-8');

        // Prepare the content to be injected
        const injectedContent = `\n${START_TAG}\n${commonRulesContent.trim()}\n${END_TAG}\n`;

        for (const file of TARGET_FILES) {
            const filePath = path.resolve(file);

            try {
                let content = await fs.readFile(filePath, 'utf-8');

                const startIdx = content.indexOf(START_TAG);
                const endIdx = content.indexOf(END_TAG);

                if (startIdx !== -1 && endIdx !== -1) {
                    // Replace existing rules section
                    const newContent =
                        content.substring(0, startIdx) +
                        injectedContent.trim() +
                        content.substring(endIdx + END_TAG.length);

                    await fs.writeFile(filePath, newContent, 'utf-8');
                    console.log(`Successfully updated ${file}`);
                } else {
                    // If tags not found, append to the end or notify
                    console.warn(`Tags not found in ${file}. Please add ${START_TAG} and ${END_TAG} to the file.`);
                }
            } catch (err) {
                if (err.code === 'ENOENT') {
                    // If file doesn't exist, create it with just the rules for now?
                    // Or just skip. Let's create it for Cursor if it's .cursorrules
                    if (file === '.cursorrules') {
                        await fs.writeFile(filePath, injectedContent.trim(), 'utf-8');
                        console.log(`Created new file ${file} with common rules.`);
                    } else {
                        console.warn(`File ${file} not found, skipping.`);
                    }
                } else {
                    console.error(`Error processing ${file}:`, err);
                }
            }
        }
    } catch (err) {
        console.error('Failed to read common rules source:', err);
        process.exit(1);
    }
}

syncRules();
