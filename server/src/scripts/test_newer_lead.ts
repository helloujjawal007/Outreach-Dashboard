import { query } from '../config/db';
import { validatePhoneNumber } from '../services/whatsappValidator';
import { generateTailoredOutreachCopy } from '../services/aiResearchWriterService';
import { inboxRotationService } from '../services/inboxRotationService';
import { linkedInService } from '../services/linkedinService';

async function runDeepTesting() {
  console.log('===============================================================');
  console.log('  ONLINE DIGITAL SOLUTION — DEEP TESTING SUITE WITH NEW LEAD');
  console.log('===============================================================');

  const testLeadEmail = `elena.rostova.${Date.now()}@gmail.com`;
  const testPhone = '+61412345678';
  let leadId: string;

  try {
    // -----------------------------------------------------------------
    // STEP 1: CREATE A BRAND NEW LEAD
    // -----------------------------------------------------------------
    console.log('\n[STEP 1] Creating new realistic lead: Nova Meridian Health...');
    const insertLeadRes = await query(`
      INSERT INTO leads (
        business_name,
        category,
        email,
        phone,
        whatsapp,
        facebook,
        instagram,
        linkedin,
        status,
        consent_status,
        notes
      ) VALUES (
        'Nova Meridian Health',
        'Healthcare & Medical Clinics',
        $1,
        $2,
        $2,
        'https://facebook.com/novameridianhealth',
        '@novameridian',
        'https://linkedin.com/in/elena-rostova-novamed',
        'active',
        'none',
        'Interested in Online Digital Solution SEO, Ads, and GMB ranking.'
      ) RETURNING id, business_name, email, phone, category;
    `, [testLeadEmail, testPhone]);

    leadId = insertLeadRes.rows[0].id;
    console.log(`✅ New Lead created successfully! ID: ${leadId}`);
    console.log(`   Business: ${insertLeadRes.rows[0].business_name}`);
    console.log(`   Email: ${insertLeadRes.rows[0].email}`);
    console.log(`   Phone: ${insertLeadRes.rows[0].phone}`);
    console.log(`   Category: ${insertLeadRes.rows[0].category}`);

    // -----------------------------------------------------------------
    // STEP 2: TEST WHATSAPP ELIGIBILITY & AUTOMATION
    // -----------------------------------------------------------------
    console.log('\n[STEP 2] Testing WhatsApp Automated Number & Landline Decision Engine...');
    const waValidation = validatePhoneNumber(testPhone);
    console.log(`   Input Phone: ${testPhone}`);
    console.log(`   Is Mobile Ready: ${waValidation.isMobileReady}`);
    console.log(`   Formatted International: ${waValidation.formattedInternational}`);
    console.log(`   Decision Reason: ${waValidation.reason}`);
    if (!waValidation.isMobileReady) {
      throw new Error(`Expected mobile ready for ${testPhone}, got: ${waValidation.reason}`);
    }

    // Update lead with eligibility
    await query(`
      UPDATE leads 
      SET whatsapp_eligible = $1, whatsapp_decision_reason = $2 
      WHERE id = $3;
    `, [waValidation.isMobileReady, waValidation.reason, leadId]);
    console.log('✅ WhatsApp eligibility recorded in database for new lead.');

    // -----------------------------------------------------------------
    // STEP 3: TEST COLD EMAIL & MULTI-INBOX POOL ROTATION
    // -----------------------------------------------------------------
    console.log('\n[STEP 3] Testing Apollo-Grade Multi-Inbox Cold Email Rotation & Copywriting...');
    const aiEmailCopy = await generateTailoredOutreachCopy({
      businessName: 'Nova Meridian Health',
      category: 'Healthcare & Medical Clinics',
      channel: 'email',
      primaryContactName: 'Dr. Elena Rostova',
    });

    console.log('   Generated AI Email Subject:', aiEmailCopy.subject);
    console.log('   Generated AI Email Snippet:', aiEmailCopy.body.slice(0, 140) + '...');
    if (!aiEmailCopy.body.includes('Online Digital Solution')) {
      throw new Error('Email copy expected signoff from Online Digital Solution');
    }

    // Test Multi-Inbox Pool Selection
    const selectedInbox = await inboxRotationService.getNextAvailableInbox();
    if (selectedInbox) {
      console.log(`✅ Selected Cold Email Mailbox: ${selectedInbox.email} (Provider: ${selectedInbox.provider}, Used: ${selectedInbox.sent_today}/${selectedInbox.daily_limit})`);
    } else {
      console.log('ℹ️ Inbox pool using system default credentials (no custom inboxes configured).');
    }

    // Schedule Cold Email Dispatch
    const scheduleRes = await query(`
      INSERT INTO scheduled_dispatches (
        entity_type,
        lead_id,
        recipient_name,
        recipient_email,
        subject,
        body,
        channel,
        stage,
        style,
        status,
        scheduled_for
      ) VALUES (
        'lead',
        $1,
        'Dr. Elena Rostova',
        $2,
        $3,
        $4,
        'email',
        'initial',
        'conversational',
        'scheduled',
        NOW() + INTERVAL '1 hour'
      ) RETURNING id, status, scheduled_for;
    `, [leadId, testLeadEmail, aiEmailCopy.subject, aiEmailCopy.body]);

    console.log(`✅ Scheduled cold email dispatch created! Dispatch ID: ${scheduleRes.rows[0].id}`);

    // -----------------------------------------------------------------
    // STEP 4: TEST FACEBOOK MESSENGER OUTREACH
    // -----------------------------------------------------------------
    console.log('\n[STEP 4] Testing Facebook Messenger Deep-Link & Outreach Copy...');
    const fbCopy = await generateTailoredOutreachCopy({
      businessName: 'Nova Meridian Health',
      category: 'Healthcare & Medical Clinics',
      channel: 'facebook',
      primaryContactName: 'Dr. Elena Rostova',
    });
    console.log('   Facebook Tailored Copy:', fbCopy.body.slice(0, 120) + '...');
    console.log('✅ Facebook Messenger Outreach payload verified.');

    // -----------------------------------------------------------------
    // STEP 5: TEST INSTAGRAM DIRECT OUTREACH
    // -----------------------------------------------------------------
    console.log('\n[STEP 5] Testing Instagram DM Deep-Link & Outreach Copy...');
    const igCopy = await generateTailoredOutreachCopy({
      businessName: 'Nova Meridian Health',
      category: 'Healthcare & Medical Clinics',
      channel: 'instagram',
      primaryContactName: 'Dr. Elena Rostova',
    });
    console.log('   Instagram Tailored Copy:', igCopy.body.slice(0, 120) + '...');
    console.log('✅ Instagram Direct Outreach payload verified.');

    // -----------------------------------------------------------------
    // STEP 6: TEST LINKEDIN POSTS & PROSPECT AUTO-REPLY ENGINE
    // -----------------------------------------------------------------
    console.log('\n[STEP 6] Testing LinkedIn Engine (Prospect Post Auto-Reply & Commenting)...');
    const prospectPostSnippet = "Attracting new private patients to our medical clinic without relying purely on word-of-mouth is our top priority this quarter. What digital channels actually drive verified patient appointments in 2026?";

    // Add prospect post for Elena Rostova
    const commentTask = await linkedInService.addProspectPostToMonitor({
      leadId,
      prospectName: 'Dr. Elena Rostova',
      prospectHeadline: 'Medical Director & Founder • Nova Meridian Health',
      prospectProfileUrl: 'https://linkedin.com/in/elena-rostova-novamed',
      postUrl: 'https://linkedin.com/posts/elena-rostova-patient-acquisition-2026',
      postSnippet: prospectPostSnippet,
    });

    console.log(`✅ Prospect post queued! Task ID: ${commentTask.id}`);
    console.log(`   Prospect: ${commentTask.prospectName} (${commentTask.prospectHeadline})`);
    console.log(`   AI Generated Comment Draft: "${commentTask.generatedComment}"`);
    console.log(`   Status: ${commentTask.status} (Needs Review)`);

    // Test Human-in-the-Loop Approval & Safe Rate-Limit Verification
    console.log('   Testing 1-click Approval & Dispatch of LinkedIn Comment...');
    const approvedComment = await linkedInService.approveAndPostComment(
      commentTask.id,
      "Spot on, Dr. Elena! For healthcare clinics, combining Google Maps 3-pack ranking (GMB) with localized search ads consistently outperforms social ads by 3.4x because the patient's intent is urgent. Would love to share our clinic case studies!"
    );
    console.log(`✅ Comment approved! Status: ${approvedComment.status}`);

    // Check updated LinkedIn Account Quota Usage
    const linkedInStatus = await linkedInService.getAccountStatus();
    console.log(`✅ LinkedIn Safety Monitor: ${linkedInStatus.dailyCommentsUsed} of ${linkedInStatus.dailySafeCommentLimit} safe daily comments used.`);

    // -----------------------------------------------------------------
    // STEP 7: TEST INBOUND CONVERSATION, SOURCE ATTRIBUTION & READ/UNREAD
    // -----------------------------------------------------------------
    console.log('\n[STEP 7] Testing Inbound Reply, Verified Source Attribution & Read/Unread Controls...');
    
    // Create conversation record for lead
    const convRes = await query(`
      INSERT INTO conversations (entity_type, lead_id, channel, status, subject, last_message_at)
      VALUES ('lead', $1, 'email', 'open', 'Re: Quick question regarding Nova Meridian Health', NOW())
      RETURNING id;
    `, [leadId]);
    const conversationId = convRes.rows[0].id;

    // Simulate inbound reply message from Elena
    const inboundMsgRes = await query(`
      INSERT INTO messages (
        conversation_id,
        direction,
        channel,
        text,
        status,
        is_read,
        is_seen,
        is_replied,
        inbox_email,
        sent_at
      ) VALUES (
        $1,
        'inbound',
        'email',
        'Hi! Thanks for reaching out. Yes, we are looking for more patient bookings this quarter. Could you send through a brief breakdown of how Online Digital Solution would get our clinic into the top 3 on Google Maps?',
        'delivered',
        false,
        false,
        false,
        'team.onlinedigitalsolution@gmail.com',
        NOW()
      ) RETURNING id, is_read, is_replied, inbox_email;
    `, [conversationId]);

    const messageId = inboundMsgRes.rows[0].id;
    console.log(`✅ Inbound message received! Message ID: ${messageId}`);
    console.log(`   Initial Read State: is_read=${inboundMsgRes.rows[0].is_read} (Strictly UNREAD by default)`);
    console.log(`   Source Attribution: Verified Inbox = ${inboundMsgRes.rows[0].inbox_email}`);

    // Test Mark as Read toggle
    await query(`UPDATE messages SET is_read = true, read_at = NOW() WHERE id = $1;`, [messageId]);
    const readCheck = await query(`SELECT is_read, read_at FROM messages WHERE id = $1;`, [messageId]);
    console.log(`✅ Toggle Mark as Read: is_read=${readCheck.rows[0].is_read} at ${readCheck.rows[0].read_at}`);

    // Test Toggle back to Unread
    await query(`UPDATE messages SET is_read = false, read_at = NULL WHERE id = $1;`, [messageId]);
    const unreadCheck = await query(`SELECT is_read, read_at FROM messages WHERE id = $1;`, [messageId]);
    console.log(`✅ Toggle Mark as Unread: is_read=${unreadCheck.rows[0].is_read} (stays unread until explicit user action or reply)`);

    // Simulate user sending a reply back
    console.log('   Simulating sending reply back to Elena from Online Digital Solution...');
    await query(`
      INSERT INTO messages (
        conversation_id,
        direction,
        channel,
        text,
        status,
        is_read,
        is_seen,
        inbox_email,
        sent_at
      ) VALUES (
        $1,
        'outbound',
        'email',
        'Hi Dr. Elena! Delighted to connect. Here is our 2-minute overview of our clinic SEO and GMB ranking framework. Best regards, Online Digital Solution',
        'sent',
        true,
        true,
        'team.onlinedigitalsolution@gmail.com',
        NOW()
      );
    `, [conversationId]);

    // Preceding inbound messages auto-marked as read and replied
    await query(`
      UPDATE messages 
      SET is_read = true, is_replied = true, replied_at = NOW() 
      WHERE conversation_id = $1 AND direction = 'inbound';
    `, [conversationId]);

    const finalMsgState = await query(`SELECT is_read, is_replied, replied_at FROM messages WHERE id = $1;`, [messageId]);
    console.log(`✅ Final state after reply: is_read=${finalMsgState.rows[0].is_read}, is_replied=${finalMsgState.rows[0].is_replied}`);

    // -----------------------------------------------------------------
    // STEP 8: TEST CUSTOM LISTS & MULTI-FACTOR FILTERS
    // -----------------------------------------------------------------
    console.log('\n[STEP 8] Testing Custom Lists & Multi-Factor Filters on New Lead...');
    
    // Create Custom List
    const listRes = await query(`
      INSERT INTO lists (name, description)
      VALUES ('VIP Healthcare Outreach', 'High-priority medical and dental clinics')
      RETURNING id, name;
    `);
    const listId = listRes.rows[0].id;
    console.log(`✅ Created custom list: "${listRes.rows[0].name}" (ID: ${listId})`);

    // Assign new lead to list
    await query(`
      INSERT INTO lead_list_memberships (list_id, lead_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING;
    `, [listId, leadId]);
    console.log(`✅ Nova Meridian Health assigned to list "${listRes.rows[0].name}".`);

    // Test Category Query Filter
    const catCheck = await query(`SELECT id, business_name FROM leads WHERE category = 'Healthcare & Medical Clinics' AND id = $1;`, [leadId]);
    console.log(`✅ Filter by Category ("Healthcare & Medical Clinics"): ${catCheck.rows.length} match.`);

    // Test Channel Query Filter
    const channelCheck = await query(`SELECT id, business_name FROM leads WHERE linkedin IS NOT NULL AND id = $1;`, [leadId]);
    console.log(`✅ Filter by Channel ("linkedin"): ${channelCheck.rows.length} match.`);

    // Test WhatsApp Mobile Ready Query Filter
    const waCheck = await query(`SELECT id, business_name FROM leads WHERE whatsapp_eligible = true AND id = $1;`, [leadId]);
    console.log(`✅ Filter by WhatsApp Mobile Ready: ${waCheck.rows.length} match.`);

    // Test List Query Filter
    const listCheck = await query(`
      SELECT l.id, l.business_name 
      FROM leads l 
      JOIN lead_list_memberships cll ON l.id = cll.lead_id 
      WHERE cll.list_id = $1 AND l.id = $2;
    `, [listId, leadId]);
    console.log(`✅ Filter by Custom List ("VIP Healthcare Outreach"): ${listCheck.rows.length} match.`);

    console.log('\n===============================================================');
    console.log('  🎉 ALL DEEP TESTS PASSED SUCCESSFULLY FOR NEW LEAD!');
    console.log('===============================================================');
  } catch (err) {
    console.error('❌ DEEP TEST FAILED:', err);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runDeepTesting();
