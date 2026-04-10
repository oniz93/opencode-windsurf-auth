
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(process.env.HOME || '', 'Library/Application Support/Windsurf/User/globalStorage/state.vscdb');
const CONFIG_PATH = path.join(process.env.HOME || '', '.config/opencode/opencode.json');

async function main() {
  console.log("Starting Deep Scan Model Discovery...");
  
  try {
    if (!fs.existsSync(DB_PATH)) {
      console.error("Windsurf database not found.");
      return;
    }

    // Get the massive configuration blob
    const configRaw = execSync(`sqlite3 "${DB_PATH}" "SELECT value FROM ItemTable WHERE key = 'windsurfConfigurations'"`).toString('utf8');
    if (!configRaw) {
      console.error("windsurfConfigurations not found.");
      return;
    }

    const data = Buffer.from(configRaw, 'base64').toString('latin1');
    const discovered: Record<string, any> = {};

    // Enterprise Anchor Mappings - To ensure high-priority models have correct labels
    const anchorLabels: Record<string, string> = {
      "private-9": "Kimi K2.5",
      "private-19": "Minimax M2.5",
      "private-15": "GPT-5.4 Low Thinking",
      "private-14": "GPT-5.3-Codex Medium",
      "private-13": "GPT-5.2 High Thinking",
      "private-12": "GPT-5.1-Codex Medium",
      "private-20": "Gemini 3.1 Pro High Thinking",
      "private-21": "Gemini 3.1 Pro Low Thinking",
    };

    // 1. Find all MODEL_ strings
    const matches = [...data.matchAll(/MODEL_[A-Z0-9_]+/g)];
    
    for (const match of matches) {
      const internalName = match[0];
      const pos = match.index || 0;

      // 2. Look back for the human label
      const lookback = data.slice(Math.max(0, pos - 200), pos);
      
      // Match human labels: Capitalized words with spaces/dots/numbers
      const labels = [...lookback.matchAll(/[A-Z][a-zA-Z0-9.]+ (?:[a-zA-Z0-9.]+ )*[a-zA-Z0-9.]+/g)];
      
      if (labels.length > 0) {
        let label = labels[labels.length - 1][0].trim();
        
        // Skip metadata labels
        const metadataWords = ['No Thinking', 'Thinking', 'Fast Mode', 'Prompt Cache Retention', 'Reasoning Effort', 'Enterprise', 'Windsurf', 'Codeium', 'Cascade'];
        if (metadataWords.includes(label) && labels.length > 1) {
          label = labels[labels.length - 2][0].trim();
        }

        // 3. Filter out unwanted clutter (BYOK, Databricks, Open Router, internal tests)
        const unwanted = ['BYOK', 'Databricks', 'Open Router', 'Internal', 'Prompt', 'Test', 'Redirect', 'Internal'];
        const isUnwanted = unwanted.some(u => label.toUpperCase().includes(u.toUpperCase()) || internalName.includes(u.toUpperCase()));
        
        if (!isUnwanted && label.length > 2 && !metadataWords.includes(label)) {
          const cleanId = internalName.toLowerCase().replace(/^model_chat_/, '').replace(/^model_/, '').replace(/_/g, '-');
          const finalLabel = anchorLabels[cleanId] || label;
          
          discovered[cleanId] = {
            name: `${finalLabel} (Windsurf)`,
            limit: { context: 200000, output: 8192 }
          };
        }
      }
    }

    // Ensure standard defaults
    const defaults: Record<string, string> = {
      "gpt-4o": "GPT-4o",
      "claude-3-5-sonnet": "Claude 3.5 Sonnet",
      "claude-3-7-sonnet": "Claude 3.7 Sonnet",
      "windsurf-fast": "Windsurf Fast"
    };

    for (const [id, name] of Object.entries(defaults)) {
      if (!discovered[id]) {
        discovered[id] = {
          name: `${name} (Windsurf)`,
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
    
    console.log(`\nSuccess! Deep-scanned and synchronized ${Object.keys(discovered).length} models.`);
    Object.entries(discovered).forEach(([id, meta]: [string, any]) => {
      console.log(`  - ${id.padEnd(30)} -> ${meta.name}`);
    });

  } catch (error) {
    console.error("Discovery failed:", error);
  }
}

main();
