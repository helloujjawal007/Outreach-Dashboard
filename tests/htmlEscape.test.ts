import assert from 'assert';
import { escapeHtml, buildHumanoidHtml } from '../server/src/adapters/emailAdapter';

function testHtmlEscaping() {
  console.log('Testing HTML entity escaping in emailAdapter.ts...');

  // Test 1: escapeHtml handles all 5 critical HTML entities
  const rawString = `<script>alert("XSS & 'injection'")</script>`;
  const escaped = escapeHtml(rawString);
  assert.strictEqual(escaped, `&lt;script&gt;alert(&quot;XSS &amp; &#39;injection&#39;&quot;)&lt;/script&gt;`);
  console.log('✓ escapeHtml correctly escapes &, <, >, ", and \'');

  // Test 2: Paragraph block escaping in buildHumanoidHtml
  const bodyText = `Hi "Marcus" & <Team>,\n\nI noticed your site has a <script>alert(1)</script> issue.\n\n• Point 1: 50% < 100% & "speed"\n• Point 2: Core Web Vitals <lcp>\n\nBest regards,\nJohn & 'Partner'\nCloud Consultancy <team@domain.com>`;
  const html = buildHumanoidHtml(bodyText);

  // Assert no raw malicious tags exist
  assert(!html.includes('<script>'), 'Must not contain raw <script>');
  assert(!html.includes('</script>'), 'Must not contain raw </script>');
  assert(html.includes('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;') || html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'Script tag must be escaped');
  assert(html.includes('&quot;Marcus&quot; &amp; &lt;Team&gt;'), 'Lead name tokens must be escaped');
  assert(html.includes('&lt;li style="margin-bottom: 6px;"&gt;') === false, 'li tags should be raw HTML container tags');
  assert(html.includes('<li style="margin-bottom: 6px;">Point 1: 50% &lt; 100% &amp; &quot;speed&quot;</li>'), 'List items must escape dynamic content');
  assert(html.includes('<li style="margin-bottom: 6px;">Point 2: Core Web Vitals &lt;lcp&gt;</li>'), 'List item brackets must be escaped');
  assert(html.includes('John &amp; &#39;Partner&#39;'), 'Signature name must be escaped');
  assert(html.includes('&lt;team@domain.com&gt;'), 'Signature contact must be escaped');

  console.log('✓ buildHumanoidHtml successfully escapes all dynamic paragraph, list item, and signature text');
  console.log('All HTML escaping tests passed!');
}

testHtmlEscaping();
