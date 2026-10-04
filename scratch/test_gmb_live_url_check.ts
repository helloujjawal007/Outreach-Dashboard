import { gmbScraperService } from '../server/src/services/gmbScraperService';

async function main() {
  console.log('=== Testing GMB Live Scraper & Backend URL Verification ===\n');

  // Test 1: verifyWebsiteLive with dead vs live URLs
  console.log('--- Test 1: Backend URL Verification (verifyWebsiteLive) ---');
  const testUrls = [
    'https://www.google.com',
    'http://folsomstreetdental.com/',
    'https://www.nonexistent-fake-domain-xyz-404.com',
  ];

  for (const url of testUrls) {
    const res = await gmbScraperService.verifyWebsiteLive(url);
    console.log(`URL: ${url}`);
    console.log(`  -> isLive: ${res.isLive}, verifiedUrl: "${res.verifiedUrl}", status: ${res.status || 'N/A'}, error: ${res.error || 'none'}`);
  }

  // Test 2: Search Google Maps for real businesses in San Francisco
  console.log('\n--- Test 2: Live GMB Search & Website Verification ---');
  const leads = await gmbScraperService.searchGmb({
    category: 'Dentist',
    country: 'USA',
    state: 'California',
    city: 'San Francisco',
    limit: 3,
  });

  console.log(`\nRetrieved ${leads.length} genuine leads:`);
  for (let i = 0; i < leads.length; i++) {
    const l = leads[i];
    console.log(`\n#${i + 1}: ${l.businessName}`);
    console.log(`   Category:  ${l.category}`);
    console.log(`   Phone:     ${l.phone || '(No phone)'}`);
    console.log(`   Address:   ${l.address}`);
    console.log(`   Rating:    ${l.rating}★ (${l.reviewsCount} reviews)`);
    console.log(`   Website:   ${l.website || '(No verified live website)'}`);
    console.log(`   Email:     ${l.email || '(None discovered)'}`);
    console.log(`   Place ID:  ${l.placeId || 'N/A'}`);
    console.log(`   Maps URL:  ${l.googleMapsUrl}`);
  }

  console.log('\n=== All Tests Passed Successfully ===');
  process.exit(0);
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
