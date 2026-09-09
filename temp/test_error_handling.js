/**
 * Objective 3 Test Suite: Error Handling, Validation, and Failure States
 */

async function runTests() {
  console.log('====================================================');
  console.log('RATINA AI — OBJECTIVE 3: ERROR HANDLING & INTEGRITY TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  // Helper for assert
  function assertTest(name, condition, details = '') {
    total++;
    if (condition) {
      passed++;
      console.log(`✅ [PASS] ${name}`);
      if (details) console.log(`   ${details}`);
    } else {
      console.error(`❌ [FAIL] ${name}`);
      if (details) console.error(`   ${details}`);
    }
  }

  // Test 1: Empty Category in Investigation
  try {
    const res = await fetch('http://localhost:3001/api/investigate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: '' })
    });
    const data = await res.json();
    assertTest(
      'Test 1: Empty Category Validation (400 rejection)',
      res.status === 400 && data.error === 'MISSING_CATEGORY',
      `Status: ${res.status} | Error: ${data.error} | Message: ${data.message}`
    );
  } catch (err) {
    assertTest('Test 1: Empty Category Validation', false, err.message);
  }

  // Test 2: Whitespace-only Category
  try {
    const res = await fetch('http://localhost:3001/api/investigate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: '   ' })
    });
    const data = await res.json();
    assertTest(
      'Test 2: Whitespace Category Validation (400 rejection)',
      res.status === 400 && data.error === 'MISSING_CATEGORY',
      `Status: ${res.status} | Error: ${data.error}`
    );
  } catch (err) {
    assertTest('Test 2: Whitespace Category Validation', false, err.message);
  }

  // Test 3: Malformed ASIN (less than 10 chars)
  try {
    const res = await fetch('http://localhost:3001/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asin: 'INVALID' })
    });
    const data = await res.json();
    assertTest(
      'Test 3: Malformed ASIN Format Validation (<10 chars)',
      res.status === 400 && data.error === 'MALFORMED_ASIN',
      `Status: ${res.status} | Error: ${data.error} | Message: ${data.message}`
    );
  } catch (err) {
    assertTest('Test 3: Malformed ASIN Format Validation', false, err.message);
  }

  // Test 4: Multiple ASINs entered into single ASIN input
  try {
    const res = await fetch('http://localhost:3001/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asin: 'B00008XEWG, B000KEM4TQ' })
    });
    const data = await res.json();
    assertTest(
      'Test 4: Comma-separated ASINs rejected with user guidance',
      res.status === 400 && data.error === 'MULTIPLE_ASINS',
      `Status: ${res.status} | Error: ${data.error} | Message: ${data.message}`
    );
  } catch (err) {
    assertTest('Test 4: Comma-separated ASINs rejected', false, err.message);
  }

  // Test 5: Health check budget endpoint
  try {
    const res = await fetch('http://localhost:3001/api/budget');
    const data = await res.json();
    assertTest(
      'Test 5: Sprint Budget Guard & Tracking Endpoint',
      res.status === 200 && typeof data.sprintBudgetRemaining === 'number',
      `Max: $${data.sprintBudgetMax} | Spent: $${data.sprintTotalSpend} | Remaining: $${data.sprintBudgetRemaining}`
    );
  } catch (err) {
    assertTest('Test 5: Budget check', false, err.message);
  }

  // Test 6: Saved Benchmark Endpoint (clearly tagged as SAVED, not LIVE)
  try {
    const res = await fetch('http://localhost:3001/api/saved-benchmark');
    const data = await res.json();
    const meta = data.data?.executionMetadata;
    assertTest(
      'Test 6: Saved Benchmark tagged as SAVED (isLiveExecution=false)',
      res.status === 200 && meta?.isLiveExecution === false && meta?.source === 'SAVED_RESULT',
      `Source: ${meta?.source} | isLive: ${meta?.isLiveExecution} | Note: ${meta?.note?.substring(0, 50)}...`
    );
  } catch (err) {
    assertTest('Test 6: Saved benchmark tag', false, err.message);
  }

  // Test 7: Export JSON endpoint
  try {
    const res = await fetch('http://localhost:3001/api/export/json');
    assertTest(
      'Test 7: Export JSON artifact endpoint responds',
      res.status === 200 || res.status === 404, // 404 if no run yet, 200 if run completed
      `Status: ${res.status} | Content-Type: ${res.headers.get('content-type')}`
    );
  } catch (err) {
    assertTest('Test 7: Export JSON', false, err.message);
  }

  // Test 8: Export Sourcing Brief endpoint
  try {
    const res = await fetch('http://localhost:3001/api/export/brief');
    assertTest(
      'Test 8: Export Sourcing Brief artifact endpoint responds',
      res.status === 200 || res.status === 404,
      `Status: ${res.status} | Content-Type: ${res.headers.get('content-type')}`
    );
  } catch (err) {
    assertTest('Test 8: Export Sourcing Brief', false, err.message);
  }

  console.log('\n====================================================');
  console.log(`RESULTS: ${passed}/${total} TESTS PASSED`);
  console.log('====================================================\n');
}

runTests();
