import { query } from '../config/db';

export async function addWhatsAppPostgresSessionTable(): Promise<void> {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS whatsapp_session_keys (
        key_id VARCHAR(255) PRIMARY KEY,
        key_data TEXT NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log('[Database Migration] ✅ whatsapp_session_keys table ready for persistent WhatsApp auth.');
  } catch (err: any) {
    console.error('[Database Migration Error] addWhatsAppPostgresSessionTable:', err?.message || err);
  }
}
