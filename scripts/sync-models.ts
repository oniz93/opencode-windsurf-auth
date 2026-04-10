
import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(process.env.HOME || '', 'Library/Application Support/Windsurf/User/globalStorage/state.vscdb');
const CONFIG_PATH = path.join(process.env.HOME || '', '.config/opencode/opencode.json');

async function getWindsurfValue(key: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(DB_PATH)) {
      resolve(null);
      return;
    }
    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY, (err) => {
      if (err) reject(err);
    });

    db.get("SELECT value FROM ItemTable WHERE key = ?", [key], (err, row: any) => {
      db.close();
      if (err) {
        reject(err);
      } else {
        resolve(row ? row.value : null);
      }
    });
  });
}

function discoverModels(configData: Buffer, authStatus?: string): Record<string, any> {
  const models: Record<string, any> = {};
  const content = configData.toString('latin1');
  
  // 1. Precise Enterprise Mappings discovered from previous decodes
  // We keep these mapping rules here so the plugin knows which generic slot to use
  const enterpriseIdMap: Record<string, string> = {
    "kimi-k2-5": "private-9",
    "minimax-m2-5": "private-19",
    "claude-haiku-4-5": "private-11",
    "claude-sonnet-4-5": "private-2",
    "claude-sonnet-4-5-thinking": "private-3",
    "gpt-5-1": "private-12",
    "gpt-5-2": "private-13",
    "gpt-5-3": "private-14",
    "gpt-5-4": "private-15",
    "gemini-3-1-pro-high": "private-20",
    "gemini-3-1-pro-low": "private-21",
  };

  // 2. Enterprise Anchors: Force correct names for specific internal IDs that are hard to parse
  const anchorLabels: Record<string, string> = {
    "private-15": "GPT-5.4 Low Thinking",
    "private-14": "GPT-5.3-Codex Medium",
    "private-13": "GPT-5.2 High Thinking",
    "private-12": "GPT-5.1-Codex Medium",
  };

  // 3. Scan for labels and IDs in the binary config
  // Pattern: [Label String]...[ID String]
  // We look for IDs like kimi-k2-5, gpt-5-4, etc.
  const idPatterns = [
    "kimi-k2-5", "minimax-m2-5", "gpt-5-4", "gpt-5-3", "gpt-5-2", "gpt-5-1", 
    "gpt-oss-120b", "claude-4-sonnet", "claude-4-5-sonnet", "claude-4-5-opus",
    "gpt-4-1", "swe-1-5", "gemini-3-1-pro-high", "gemini-3-1-pro-low"
  ];

  for (const id of idPatterns) {
    const pos = content.indexOf(id);
    if (pos !== -1) {
      // Look back for the human label
      const lookback = content.slice(Math.max(0, pos - 100), pos);
      const labels = [...lookback.matchAll(/[A-Z][a-zA-Z0-9.]+ (?:[a-zA-Z0-9.]+ )*[a-zA-Z0-9.]+/g)];
      
      if (labels.length > 0) {
        let label = labels[labels.length - 1][0].trim();
        
        // If the label is just a detail (Low Thinking, Codex Medium), grab the one before it
        const detailWords = ['Low Thinking', 'Medium Thinking', 'High Thinking', 'No Thinking', 'Codex Medium', 'Fast Mode'];
        if (detailWords.some(d => label.endsWith(d)) && labels.length > 1) {
          const prevLabel = labels[labels.length - 2][0].trim();
          // If the previous label looks like a series name (GPT-5.4, Gemini 3.1)
          if (prevLabel.includes('GPT') || prevLabel.includes('Gemini') || prevLabel.includes('Claude')) {
            label = prevLabel + " " + label;
          }
        }

        const cleanId = enterpriseIdMap[id] || id;
        const finalLabel = anchorLabels[cleanId] || label;
        
        models[cleanId] = {
          name: `${finalLabel} (Windsurf)`,
          limit: { context: 200000, output: 8192 }
        };
      }
    }
  }

  // 3. Add standard defaults
  const defaults: Record<string, string> = {
    "gpt-4o": "GPT-4o",
    "claude-3-5-sonnet": "Claude 3.5 Sonnet",
    "claude-3-7-sonnet": "Claude 3.7 Sonnet",
    "windsurf-fast": "Windsurf Fast"
  };

  for (const [id, name] of Object.entries(defaults)) {
    if (!models[id]) {
      models[id] = {
        name: `${name} (Windsurf)`,
        limit: { context: 200000, output: 8192 }
      };
    }
  }

  return models;
}

async function main() {
  console.log("Starting Enterprise-Aware Model Discovery...");
  
  try {
    const configRaw = await getWindsurfValue('windsurfConfigurations');
    const authStatusRaw = await getWindsurfValue('windsurfAuthStatus');
    
    if (!configRaw) {
      console.error("Could not find Windsurf configurations.");
      return;
    }

    const discovered = discoverModels(Buffer.from(configRaw, 'base64'), authStatusRaw || undefined);
    
    if (!fs.existsSync(CONFIG_PATH)) {
      console.error(`OpenCode config not found at ${CONFIG_PATH}`);
      return;
    }

    const opencodeConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    if (!opencodeConfig.provider) opencodeConfig.provider = {};
    if (!opencodeConfig.provider.windsurf) opencodeConfig.provider.windsurf = {
      npm: "@ai-sdk/openai-compatible",
      options: { baseURL: "http://127.0.0.1:42100/v1" },
      models: {}
    };

    opencodeConfig.provider.windsurf.models = discovered;
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(opencodeConfig, null, 2));
    
    console.log(`\nSuccess! Updated ${Object.keys(discovered).length} models.`);
    Object.entries(discovered).forEach(([id, meta]: [string, any]) => {
      console.log(`  - ${id.padEnd(30)} -> ${meta.name}`);
    });

  } catch (error) {
    console.error("Discovery failed:", error);
  }
}

main();
