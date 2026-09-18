import { query } from '../config/db';

export async function addLinkedInPublishingColumns() {
  console.log('[Migration] Updating LinkedIn posts schema and statuses...');

  // Add columns if they do not exist
  await query(`
    ALTER TABLE linkedin_posts
    ADD COLUMN IF NOT EXISTS live_delivery BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS error_message TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS direct_share_url TEXT DEFAULT '';
  `);

  // Update existing posts that were falsely marked 'published' to 'ready_to_share'
  await query(`
    UPDATE linkedin_posts
    SET status = 'ready_to_share',
        live_delivery = false,
        error_message = 'Saved locally as draft. Click "Share to LinkedIn" to post to your profile.'
    WHERE live_delivery IS NOT TRUE AND status = 'published';
  `);

  // Update linkedin_accounts is_connected based on actual credentials
  await query(`
    UPDATE linkedin_accounts
    SET is_connected = (
      session_cookie IS NOT NULL AND session_cookie != ''
    ) OR (
      access_token IS NOT NULL AND access_token != ''
    )
    WHERE id = 'default_account';
  `);

  console.log('[Migration] LinkedIn schema updated and statuses corrected.');
}

if (process.argv[1]?.endsWith('add_linkedin_publishing_columns.ts') || process.argv[1]?.endsWith('add_linkedin_publishing_columns.js')) {
  addLinkedInPublishingColumns()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('LinkedIn schema migration failed:', err);
      process.exit(1);
    });
}
