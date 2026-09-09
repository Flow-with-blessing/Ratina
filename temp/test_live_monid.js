import { runMonidEndpoint } from '../server/monidService.js';

async function testSingleAsin() {
  console.log('Testing live Monid endpoints for ASIN B00008XEWG...');
  
  // Test product details endpoint
  console.log('\n--- Fetching Product Details ---');
  const details = await runMonidEndpoint({
    provider: 'apify',
    endpoint: '/delicious_zebu/amazon-product-details-scraper',
    input: { Params: ['B00008XEWG'] },
    timeoutSec: 120
  });

  console.log('Product Details Success:', details.success);
  console.log('Product Details Latency:', details.latencyMs, 'ms');
  if (details.success) {
    console.log('Output preview:', JSON.stringify(details.output).substring(0, 500));
  } else {
    console.error('Product Details Error:', details.error);
  }

  // Test reviews endpoint
  console.log('\n--- Fetching Reviews ---');
  const reviews = await runMonidEndpoint({
    provider: 'apify',
    endpoint: '/axesso_data/amazon-reviews-scraper',
    input: {
      input: [
        {
          asin: 'B00008XEWG',
          domainCode: 'com',
          sortBy: 'recent',
          filterByStar: 'critical', // focus on critical / negative reviews
          maxPages: 3
        }
      ]
    },
    timeoutSec: 120
  });

  console.log('Reviews Success:', reviews.success);
  console.log('Reviews Latency:', reviews.latencyMs, 'ms');
  if (reviews.success) {
    console.log('Output preview:', JSON.stringify(reviews.output).substring(0, 500));
  } else {
    console.error('Reviews Error:', reviews.error);
  }
}

testSingleAsin();
