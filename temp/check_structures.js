import { runMonidEndpoint } from '../server/monidService.js';
import fs from 'fs';

async function checkStructures() {
  console.log('Testing apify/delicious_zebu/amazon-product-details-scraper...');
  const res1 = await runMonidEndpoint({
    provider: 'apify',
    endpoint: '/delicious_zebu/amazon-product-details-scraper',
    input: { Params: ['B00008XEWG'] }
  });
  console.log('Delicious Zebu success:', res1.success);
  if (res1.success && res1.output && res1.output[0]) {
    const keys = Object.keys(res1.output[0]);
    console.log('Product Keys:', keys);
    if (res1.output[0].reviews) {
      console.log('Product reviews count in details payload:', res1.output[0].reviews.length);
      console.log('Sample review:', JSON.stringify(res1.output[0].reviews[0], null, 2));
    }
  }

  console.log('\nTesting apify/axesso_data/amazon-reviews-scraper standard input...');
  const res2 = await runMonidEndpoint({
    provider: 'apify',
    endpoint: '/axesso_data/amazon-reviews-scraper',
    input: {
      input: [
        {
          asin: 'B00008XEWG',
          domainCode: 'com',
          sortBy: 'recent',
          maxPages: 3
        }
      ]
    }
  });
  console.log('Axesso reviews success:', res2.success);
  if (res2.success && res2.output) {
    console.log('Axesso output type:', typeof res2.output, Array.isArray(res2.output));
    fs.writeFileSync('temp/sample_axesso.json', JSON.stringify(res2.output, null, 2));
    console.log('Saved sample_axesso.json');
  }
}

checkStructures();
