import {
  proto,
  initAuthCreds,
  BufferJSON,
  type AuthenticationState,
  type AuthenticationCreds,
  type SignalDataTypeMap,
} from '@whiskeysockets/baileys';
import { query } from '../config/db';
import fs from 'node:fs';
import path from 'node:path';

const fixKeyName = (file: string): string => file?.replace(/\//g, '__')?.replace(/:/g, '-');

/**
 * PostgreSQL-backed Authentication State Adapter for Baileys.
 * Replaces disk-based multi-file auth so sessions survive Render restarts and container redeploys.
 */
export async function usePostgresAuthState(): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
  clearAuth: () => Promise<void>;
}> {
  // Ensure DB table exists
  await query(`
    CREATE TABLE IF NOT EXISTS whatsapp_session_keys (
      key_id VARCHAR(255) PRIMARY KEY,
      key_data TEXT NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);

  // Migrate existing session files from disk into PostgreSQL if available and not yet stored
  try {
    const diskDir = path.resolve(process.cwd(), 'server/data/whatsapp_session');
    if (fs.existsSync(diskDir)) {
      const credsExist = await query(`SELECT 1 FROM whatsapp_session_keys WHERE key_id = 'creds.json' LIMIT 1`);
      if (credsExist.rows.length === 0) {
        const files = fs.readdirSync(diskDir);
        if (files.length > 0) {
          console.log(`[WhatsApp Postgres Auth] Migrating ${files.length} session files from disk into PostgreSQL...`);
          for (const file of files) {
            if (file.endsWith('.json')) {
              try {
                const content = fs.readFileSync(path.join(diskDir, file), 'utf-8');
                await query(
                  `INSERT INTO whatsapp_session_keys (key_id, key_data, updated_at) 
                   VALUES ($1, $2, NOW()) 
                   ON CONFLICT (key_id) DO NOTHING`,
                  [fixKeyName(file), content]
                );
              } catch {
                // Ignore corrupt individual file
              }
            }
          }
          console.log(`[WhatsApp Postgres Auth] ✅ Disk session successfully migrated to PostgreSQL!`);
        }
      }
    }
  } catch (err: any) {
    console.warn('[WhatsApp Postgres Auth] Auto-migration check warning:', err?.message || err);
  }

  const writeData = async (data: any, key: string): Promise<void> => {
    const fixedKey = fixKeyName(key);
    const jsonStr = JSON.stringify(data, BufferJSON.replacer);
    await query(
      `INSERT INTO whatsapp_session_keys (key_id, key_data, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key_id) DO UPDATE SET key_data = $2, updated_at = NOW()`,
      [fixedKey, jsonStr]
    );
  };

  const readData = async (key: string): Promise<any> => {
    try {
      const fixedKey = fixKeyName(key);
      const res = await query<{ key_data: string }>(
        `SELECT key_data FROM whatsapp_session_keys WHERE key_id = $1 LIMIT 1`,
        [fixedKey]
      );
      if (res.rows.length === 0) return null;
      return JSON.parse(res.rows[0].key_data, BufferJSON.reviver);
    } catch {
      return null;
    }
  };

  const removeData = async (key: string): Promise<void> => {
    try {
      const fixedKey = fixKeyName(key);
      await query(`DELETE FROM whatsapp_session_keys WHERE key_id = $1`, [fixedKey]);
    } catch {}
  };

  const clearAuth = async (): Promise<void> => {
    try {
      await query(`DELETE FROM whatsapp_session_keys`);
      console.log('[WhatsApp Postgres Auth] All session keys purged from PostgreSQL.');
    } catch (err) {
      console.error('[WhatsApp Postgres Auth] Error clearing auth:', err);
    }
  };

  const creds: AuthenticationCreds = (await readData('creds.json')) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type: keyof SignalDataTypeMap, ids: string[]) => {
          const data: { [key: string]: any } = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}.json`);
              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value;
            })
          );
          return data;
        },
        set: async (data: any) => {
          const tasks: Promise<void>[] = [];
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const fileKey = `${category}-${id}.json`;
              tasks.push(value ? writeData(value, fileKey) : removeData(fileKey));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: async () => {
      return writeData(creds, 'creds.json');
    },
    clearAuth,
  };
}
