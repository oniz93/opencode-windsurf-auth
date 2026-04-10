
import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import base64 from 'base64-js';

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

/**
 * Extracts model definitions from the binary windsurfConfigurations blob.
 * Returns a map of internal ID (e.g. model-private-9) to { name: "Human Label" }
 */
function discoverModels(configData: Buffer, allowedData?: Buffer): Record<string, any> {
  const models: Record<string, any> = {};
  
  // Convert buffer to a string where we can search for identifiers
  // We use latin1 to preserve byte values for regex matching
  const content = configData.toString('latin1');
  
  // Find all MODEL_ strings (e.g. MODEL_PRIVATE_9, MODEL_CHAT_GPT_4O)
  // Also look for numeric identifiers like 11121
  const modelMatches = [...content.matchAll(/MODEL_[A-Z0-9_]+/g)];
  
  // Add some known numeric IDs if they appear in certain blocks
  const numericIds = ["11121"];
  for (const numId of numericIds) {
    if (content.includes(numId)) {
      // Just a stub match to trigger the heuristic
      modelMatches.push({ 0: `MODEL_CHAT_${numId}`, index: content.indexOf(numId) } as any);
    }
  }
  
  const allowedContent = allowedData ? allowedData.toString('latin1') : null;

  for (const match of modelMatches) {
    const internalName = match[0];
    const pos = match.index || 0;
    
    // Check if this model is allowed (if we have the allowed list)
    if (allowedContent && !allowedContent.includes(internalName)) {
      continue;
    }

    // Heuristic: Look backward from the model ID to find the display label
    // Labels are usually UTF-8 strings ending with a few metadata bytes before the ID
    const lookback = content.slice(Math.max(0, pos - 150), pos);
    
    // Improved Regex: Find strings that look like model names.
    // Must start with Uppercase, usually contains numbers/dots, ends before metadata.
    // We avoid common metadata words.
    const labels = [...lookback.matchAll(/[A-Z][a-zA-Z0-9.]+ (?:[a-zA-Z0-9.]+ )*[a-zA-Z0-9.]+/g)];
    
    if (labels.length > 0) {
      let label = labels[labels.length - 1][0].trim();
      const cleanId = internalName.toLowerCase().replace(/^model_/, '').replace(/_/g, '-');
      
      // If the label is just metadata, try the one before it
      const metadataWords = ['No Thinking', 'Thinking', 'Fast Mode', 'Prompt Cache Retention', 'Reasoning Effort'];
      if (metadataWords.includes(label) && labels.length > 1) {
        label = labels[labels.length - 2][0].trim();
      }

      // Final validation - allow special cases like SWE-1.5 and GPT 5.1
      const isSpecialCase = label.includes('SWE-') || label.includes('GPT 5');
      if (label.length > 2 && (!['Windsurf', 'Enterprise', 'Codeium', 'Cascade', ...metadataWords].includes(label) || isSpecialCase)) {
        models[cleanId] = {
          name: `${label} (Windsurf)`,
          limit: {
            context: 200000,
            output: 8192
          }
        };
      }
    }
  }

  // Ensure standard defaults are present if not found
  const defaults: Record<string, string> = {
    "gpt-4o": "GPT-4o",
    "claude-3-5-sonnet": "Claude 3.5 Sonnet",
    "claude-3-7-sonnet": "Claude 3.7 Sonnet"
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
  console.log("Starting Dynamic Windsurf Model Discovery...");
  
  try {
    const configRaw = await getWindsurfValue('windsurfConfigurations');
    const authStatusRaw = await getWindsurfValue('windsurfAuthStatus');
    
    if (!configRaw) {
      console.error("Could not find Windsurf configurations in database.");
      return;
    }

    const configBuf = Buffer.from(configRaw, 'base64');
    
    // Optional: Get the allowed list from auth status if present
    let allowedBuf: Buffer | undefined;
    if (authStatusRaw) {
      // The auth status is a JSON containing the allowed protos
      const authData = JSON.parse(authStatusRaw);
      const allowedProtos = authData.allowedCommandModelConfigsProtoBinaryBase64 || [];
      // Combine all allowed protos into one search buffer
      allowedBuf = Buffer.concat(allowedProtos.map((p: string) => Buffer.from(p, 'base64')));
    }

    const discovered = discoverModels(configBuf, allowedBuf);
    const count = Object.keys(discovered).length;

    if (count === 0) {
      console.error("No models could be discovered.");
      return;
    }

    if (!fs.existsSync(CONFIG_PATH)) {
      console.error(`OpenCode config not found at ${CONFIG_PATH}`);
      return;
    }

    const opencodeConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    if (!opencodeConfig.provider) opencodeConfig.provider = {};
    if (!opencodeConfig.provider.windsurf) {
      opencodeConfig.provider.windsurf = {
        npm: "@ai-sdk/openai-compatible",
        options: { baseURL: "http://127.0.0.1:42100/v1" },
        models: {}
      };
    }

    opencodeConfig.provider.windsurf.models = discovered;
    
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(opencodeConfig, null, 2));
    
    console.log(`\nSuccess! Updated ${count} models in opencode.json.`);
    console.log("Discovered models:");
    Object.entries(discovered).forEach(([id, meta]: [string, any]) => {
      console.log(`  - ${id.padEnd(30)} -> ${meta.name}`);
    });

  } catch (error) {
    console.error("Discovery failed:", error);
  }
}

main();
