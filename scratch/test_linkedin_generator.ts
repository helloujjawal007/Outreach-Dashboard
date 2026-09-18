import { linkedinService } from '../server/src/services/linkedinService';
import {
  toUnicodeBold,
  toUnicodeItalic,
  toPlainText,
  beautifyLinkedInPost,
  applyStyleToSelection,
} from '../src/utils/linkedinBeautifier';

async function runTests() {
  console.log('====================================================');
  console.log('🧪 TESTING LINKEDIN GENERATOR, BEAUTIFIER & SCHEDULER');
  console.log('====================================================');

  // TEST 1: Always Different Generation Test
  console.log('\n--- 1. Testing "Always Different" Generation Engine ---');
  const generatedPosts: Array<{ title: string; content: string }> = [];

  for (let i = 0; i < 5; i++) {
    const post = await linkedinService.generatePost({
      topic: 'Omni-channel client acquisition for B2B agencies',
      tone: 'thought_leadership',
    });
    generatedPosts.push(post);
    console.log(`Generated Post #${i + 1}: "${post.title}" (${post.content.length} chars)`);
  }

  // Verify all 5 posts are unique
  const uniqueTitles = new Set(generatedPosts.map((p) => p.title));
  const uniqueContents = new Set(generatedPosts.map((p) => p.content));

  if (uniqueTitles.size === 5 && uniqueContents.size === 5) {
    console.log(`✅ [Always Different] 5/5 posts generated were 100% unique in title and content!`);
  } else {
    throw new Error(`❌ Duplicates found: ${uniqueTitles.size}/5 unique titles, ${uniqueContents.size}/5 unique contents.`);
  }

  // TEST 2: Beautifier Engine Test
  console.log('\n--- 2. Testing Post Beautifier Utility ---');
  const rawInput = `Cold outbound is not dead.
Here is the 4-channel playbook:
1. WhatsApp Direct: 68% open rate within 15 minutes.
2. Multi-Inbox Rotation: Maintain 0% bounce rate.
- Low-friction follow-up: Send video demo.
* Social touchpoint: Leave authentic comment.
Old way: Spray and pray 500 emails.
New way: 50 targeted accounts with high intent.`;

  const beautified = beautifyLinkedInPost(rawInput);
  console.log('Beautified Output Preview:\n' + beautified);

  // Check Unicode bold conversion
  const boldTest = toUnicodeBold('Cold Outbound 2026');
  console.log('Bold conversion test:', boldTest);
  if (!boldTest.includes('𝗖𝗼𝗹𝗱')) {
    throw new Error('Bold conversion failed');
  }

  // Check Plain text reversion
  const plainReversion = toPlainText(boldTest);
  if (plainReversion !== 'Cold Outbound 2026') {
    throw new Error(`Plain text reversion failed: "${plainReversion}"`);
  }
  console.log(`✅ [Beautifier] Unicode Bold & Plain conversion verified!`);

  // Verify beautified text contains bold numbers (𝟭.) and aesthetic bullets (✦)
  if (beautified.includes('𝟭.') && beautified.includes('✦')) {
    console.log(`✅ [Beautifier] Numbered steps and bullets properly formatted!`);
  } else {
    throw new Error('Beautifier output missing formatted numbers or bullets');
  }

  // TEST 3: Scheduler Creation and Rescheduling Test
  console.log('\n--- 3. Testing Scheduler and Reschedule API ---');
  const targetDate = new Date();
  targetDate.setHours(targetDate.getHours() + 24);

  const scheduledPost = await linkedinService.createPost({
    title: 'Automated Scheduled Post Test',
    content: beautified,
    status: 'scheduled',
    scheduledFor: targetDate.toISOString(),
  });
  console.log(`Created scheduled post ID: ${scheduledPost.id}, status: ${scheduledPost.status}, scheduledFor: ${scheduledPost.scheduledFor}`);

  if (scheduledPost.status !== 'scheduled' || !scheduledPost.scheduledFor) {
    throw new Error('Failed to create scheduled post');
  }
  console.log(`✅ [Scheduler] Post created with status="scheduled"!`);

  // Test Reschedule (Update)
  const newDate = new Date();
  newDate.setHours(newDate.getHours() + 48);
  const updatedPost = await linkedinService.updatePost(scheduledPost.id, {
    scheduledFor: newDate.toISOString(),
    title: 'Rescheduled Test Post',
  });
  console.log(`Updated post: "${updatedPost.title}", new scheduledFor: ${updatedPost.scheduledFor}`);

  if (updatedPost.title !== 'Rescheduled Test Post' || !updatedPost.scheduledFor?.includes(newDate.toISOString().slice(0, 10))) {
    throw new Error('Failed to update scheduled post');
  }
  console.log(`✅ [Scheduler] Post rescheduled successfully!`);

  // Clean up test post
  await linkedinService.deletePost(scheduledPost.id);
  console.log(`✅ [Cleanup] Test post deleted cleanly.`);

  console.log('\n====================================================');
  console.log('🎉 ALL LINKEDIN FEATURES TESTED AND 100% WORKING!');
  console.log('====================================================\n');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
