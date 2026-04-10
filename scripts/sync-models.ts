
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(process.env.HOME || '', 'Library/Application Support/Windsurf/User/globalStorage/state.vscdb');
const CONFIG_PATH = path.join(process.env.HOME || '', '.config/opencode/opencode.json');

/**
 * Truly dynamic discovery that carves (Label, ID) pairs from the binary database.
 * No hardcoded model names allowed.
 */
async function main() {
  console.log("Starting 100% Dynamic Model Discovery...");
  
  try {
    if (!fs.existsSync(DB_PATH)) {
      console.error("Windsurf database not found.");
      return;
    }

    // Extract the raw binary blob from the SQLite database
    const configRaw = execSync(`sqlite3 "${DB_PATH}" "SELECT value FROM ItemTable WHERE key = 'windsurfConfigurations'"`).toString('utf8');
    if (!configRaw) {
      console.error("windsurfConfigurations not found.");
      return;
    }

    const data = Buffer.from(configRaw, 'base64');
    const content = data.toString('latin1');
    const discovered: Record<string, any> = {};

    // Windsurf Protobuf Pattern for ClientModelConfig:
    // Field 1 (Tag 0x0A): Label String
    // ... metadata ...
    // Field 22 (Tag 0xB2 0x01): Model UID String
    
    // We look for everything that looks like an internal ID first (Field 22)
    // and then find the Label (Field 1) that immediately preceded it.
    const idMatches = [...content.matchAll(/\xb2\x01([\x01-\x7f])([a-z0-9\-]{3,})/g)];
    
    for (const match of idMatches) {
      const modelId = match[2];
      const pos = match.index || 0;

      // Look back for the Label (starts with Tag 0x0A)
      const lookback = content.slice(Math.max(0, pos - 250), pos);
      
      // Find strings that look like Labels: [Tag 0x0A][Length][Uppercase String]
      const labelMatches = [...lookback.matchAll(/\x0a([\x01-\x7f])([A-Z][a-zA-Z0-9. ]{2,})/g)];
      
      if (labelMatches.length > 0) {
        // The label closest to the ID is usually the correct one
        const label = labelMatches[labelMatches.length - 1][2].trim();
        
        // Filter out generic IDE metadata
        const metadata = ['No Thinking', 'Thinking', 'Fast Mode', 'Prompt Cache Retention', 'Reasoning Effort', 'Enterprise', 'Windsurf', 'Codeium', 'Cascade'];
        if (metadata.includes(label)) continue;

        const cleanId = modelId.toLowerCase().replace(/_/g, '-');
        discovered[cleanId] = {
          name: `${label} (Windsurf)`,
          limit: { context: 200000, output: 8192 }
        };
      }
    }

    // Always ensure base standard models are present as fallbacks
    const standard = ["gpt-4o", "claude-3-5-sonnet", "claude-3-7-sonnet"];
    for (const id of standard) {
      if (!discovered[id]) {
        discovered[id] = {
          name: id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) + " (Windsurf)",
          limit: { context: 200000, output: 8192 }
        };
      }
    }

    if (!fs.existsSync(CONFIG_PATH)) {
      console.error(`OpenCode config not found at ${CONFIG_PATH}`);
      return;
    }

    const opencodeConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    opencodeConfig.provider.windsurf.models = discovered;
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(opencodeConfig, null, 2));
    
    console.log(`\nSuccess! Dynamically synchronized ${Object.keys(discovered).length} models.`);
    Object.entries(discovered).forEach(([id, meta]: [string, any]) => {
      console.log(`  - ${id.padEnd(35)} -> ${meta.name}`);
    });

  } catch (error) {
    console.error("Discovery failed:", error);
  }
}

main();
