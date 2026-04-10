
import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'path';
import { execSync } from 'child_process';

const DB_PATH = `${process.env.HOME}/Library/Application Support/Windsurf/User/globalStorage/state.vscdb`;
const CONFIG_PATH = `${process.env.HOME}/.config/opencode/opencode.json`;
const EXTENSION_PATH = "/Applications/Windsurf.app/Contents/Resources/app/extensions/windsurf/dist/extension.js";

async function getWindsurfConfigs() {
  return new Promise<string>((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY, (err) => {
      if (err) reject(err);
    });

    db.get("SELECT value FROM ItemTable WHERE key = 'windsurfConfigurations'", (err, row: any) => {
      db.close();
      if (err) reject(err);
      if (!row) reject(new Error("windsurfConfigurations not found in database"));
      resolve(row.value);
    });
  });
}

function extractModels(data: Buffer) {
  // Extract clean model IDs (they look like 'kimi-k2-5' or 'gpt-5-4')
  const dataStr = data.toString('binary');
  
  // Enterprise Mappings discovered from binary decode
  const enterpriseMap: Record<string, string> = {
    "kimi-k2-5": "Kimi K2.5",
    "minimax-m2-5": "Minimax M2.5",
    "claude-haiku-4-5": "Claude Haiku 4.5",
    "claude-sonnet-4-5": "Claude Sonnet 4.5",
    "claude-sonnet-4-5-thinking": "Claude Sonnet 4.5 Thinking",
    "gpt-5-1": "GPT-5.1",
    "gpt-5-2": "GPT-5.2",
    "gpt-5-3": "GPT-5.3",
    "gpt-5-4": "GPT-5.4",
    "gpt-oss-120b": "GPT-OSS 120B Medium Thinking",
    "claude-4-sonnet": "Claude Sonnet 4",
    "claude-4-5-opus": "Claude 4.5 Opus",
    "gpt-4-1": "GPT-4.1",
    "swe-1-5": "SWE-1.5",
    "windsurf-fast": "Windsurf Fast",
    "gpt-4o": "GPT-4o",
    "claude-3-5-sonnet": "Claude 3.5 Sonnet",
    "claude-3-7-sonnet": "Claude 3.7 Sonnet",
    "claude-3-7-sonnet-thinking": "Claude 3.7 Sonnet (Thinking)",
    "gemini-3-1-pro-high": "Gemini 3.1 Pro High Thinking",
    "gemini-3-1-pro-low": "Gemini 3.1 Pro Low Thinking"
  };

  const foundModels: Record<string, any> = {};
  
  // Find which ones are actually present in the binary config
  for (const [id, label] of Object.entries(enterpriseMap)) {
    if (dataStr.includes(id) || dataStr.includes(id.replace(/-/g, '_').toUpperCase())) {
      foundModels[id] = {
        name: `${label} (Windsurf)`,
        limit: { context: 200000, output: 8192 }
      };
    }
  }

  // Always include standard ones as fallback
  const defaults = ["gpt-4o", "claude-3-5-sonnet", "claude-3-7-sonnet"];
  for (const id of defaults) {
    if (!foundModels[id]) {
      foundModels[id] = {
        name: `${enterpriseMap[id]} (Windsurf)`,
        limit: { context: 200000, output: 8192 }
      };
    }
  }

  return foundModels;
}

async function main() {
  console.log("Starting Windsurf model synchronization...");
  
  try {
    const rawB64 = await getWindsurfConfigs();
    const data = Buffer.from(rawB64, 'base64');
    const enabledModels = extractModels(data);
    
    if (Object.keys(enabledModels).length === 0) {
      console.error("No enabled models found in Windsurf configuration.");
      return;
    }

    if (!fs.existsSync(CONFIG_PATH)) {
      console.error(`OpenCode config not found at ${CONFIG_PATH}`);
      return;
    }

    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    
    if (!config.provider) config.provider = {};
    if (!config.provider.windsurf) {
      config.provider.windsurf = {
        npm: "@ai-sdk/openai-compatible",
        options: { baseURL: "http://127.0.0.1:42100/v1" },
        models: {}
      };
    }

    config.provider.windsurf.models = enabledModels;
    
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    
    console.log(`Successfully updated ${Object.keys(enabledModels).length} models in OpenCode configuration.`);
    for (const id of Object.keys(enabledModels)) {
      console.log(`  - ${id}`);
    }
    
  } catch (error) {
    console.error("Synchronization failed:", error);
  }
}

main();
