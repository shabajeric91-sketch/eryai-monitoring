import { createClient } from '@supabase/supabase-js';

// ============================================
// ERYAI COMPLETE TEST SUITE
// Tests ALL systems: Demo, Dashboard, Sales, Landing, Supabase, Email
// ============================================

const CONFIG = {
  // URLs
  demoUrl: 'https://ery-ai-demo-restaurang.vercel.app',
  dashboardUrl: 'https://dashboard.eryai.tech',
  salesUrl: 'https://sales.eryai.tech',
  landingUrl: 'https://eryai.tech',
  
  // Supabase
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_SERVICE_KEY,
  
  // Test data
  bellaItaliaId: '3c6d67d9-22bb-4a3e-94ca-ca552eddb08e',
  superadminEmail: 'eric@eryai.tech',
  
  // Notification settings
  notifyEmail: 'eric@eryai.tech',
  resendApiKey: process.env.RESEND_API_KEY
};

const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);

// Test results storage
const results = {
  passed: 0,
  failed: 0,
  skipped: 0,
  tests: [],
  startTime: null,
  endTime: null,
  categories: {}
};

// ============================================
// HELPER FUNCTIONS
// ============================================

function log(message, type = 'info') {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  const icons = { info: 'ℹ️', success: '✅', error: '❌', warning: '⚠️', skip: '⏭️' };
  console.log(`[${timestamp}] ${icons[type] || 'ℹ️'} ${message}`);
}

async function runTest(category, name, testFn, required = true) {
  const fullName = `[${category}] ${name}`;
  const startTime = Date.now();
  
  if (!results.categories[category]) {
    results.categories[category] = { passed: 0, failed: 0, skipped: 0 };
  }
  
  try {
    log(`Running: ${fullName}`);
    await testFn();
    const duration = Date.now() - startTime;
    results.passed++;
    results.categories[category].passed++;
    results.tests.push({ category, name, status: 'passed', duration });
    log(`${name} - PASSED (${duration}ms)`, 'success');
    return true;
  } catch (error) {
    const duration = Date.now() - startTime;
    if (required) {
      results.failed++;
      results.categories[category].failed++;
      results.tests.push({ category, name, status: 'failed', error: error.message, duration });
      log(`${name} - FAILED: ${error.message}`, 'error');
    } else {
      results.skipped++;
      results.categories[category].skipped++;
      results.tests.push({ category, name, status: 'skipped', error: error.message, duration });
      log(`${name} - SKIPPED: ${error.message}`, 'skip');
    }
    return false;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function fetchWithTimeout(url, options = {}, timeout = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// ============================================
// LANDING PAGE TESTS
// ============================================

async function testLandingPageLoads() {
  const response = await fetchWithTimeout(CONFIG.landingUrl);
  assert(response.ok, `Landing page returned ${response.status}`);
  const text = await response.text();
  assert(text.includes('Ery AI') || text.includes('EryAI') || text.includes('ery'), 'Landing page content missing');
}

async function testLandingPageLinks() {
  const response = await fetchWithTimeout(CONFIG.landingUrl);
  const html = await response.text();
  assert(html.includes('ery-ai-demo-restaurang') || html.includes('demo'), 'Demo link missing from landing page');
}

// ============================================
// DEMO RESTAURANT TESTS
// ============================================

async function testDemoPageLoads() {
  const response = await fetchWithTimeout(CONFIG.demoUrl);
  assert(response.ok, `Demo page returned ${response.status}`);
  const text = await response.text();
  assert(text.includes('Bella Italia') || text.includes('Sofia') || text.includes('restaurant'), 'Demo page content missing');
}

async function testRestaurantApiHealth() {
  const response = await fetchWithTimeout(`${CONFIG.demoUrl}/api/restaurant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'test' })
  });
  assert(response.ok || response.status === 400, `Restaurant API returned ${response.status}`);
}

async function testMessagesApiHealth() {
  const response = await fetchWithTimeout(`${CONFIG.demoUrl}/api/messages?session_id=test`);
  const data = await response.json();
  assert(response.ok || data.error === 'Invalid session_id format', `Messages API error`);
}

async function testTypingApiHealth() {
  const response = await fetchWithTimeout(`${CONFIG.demoUrl}/api/typing?session_id=00000000-0000-0000-0000-000000000000`);
  assert(response.ok || response.status === 404, `Typing API returned ${response.status}`);
}

async function testCreateChatSession() {
  const response = await fetchWithTimeout(`${CONFIG.demoUrl}/api/restaurant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: '[TEST] Hej, detta är ett automatiskt test', history: [] })
  });
  
  const data = await response.json();
  assert(response.ok, `API error: ${response.status}`);
  assert(data.sessionId, 'No sessionId returned');
  assert(data.candidates?.[0]?.content?.parts?.[0]?.text, 'No AI response');
  
  global.testSessionId = data.sessionId;
  global.testAiResponse = data.candidates[0].content.parts[0].text;
  log(`Created test session: ${data.sessionId}`, 'info');
}

async function testSessionInSupabase() {
  assert(global.testSessionId, 'No test session ID from previous test');
  
  const { data, error } = await supabase
    .from('chat_sessions')
    .select('*')
    .eq('id', global.testSessionId)
    .single();
  
  assert(!error, `Supabase error: ${error?.message}`);
  assert(data, 'Session not found in database');
  assert(data.customer_id === CONFIG.bellaItaliaId, 'Wrong customer_id');
}

async function testMessagesInSupabase() {
  assert(global.testSessionId, 'No test session ID');
  
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('session_id', global.testSessionId);
  
  assert(!error, `Supabase error: ${error?.message}`);
  assert(data.length >= 2, `Expected at least 2 messages, got ${data.length}`);
}

async function testHandoffTrigger() {
  const response = await fetchWithTimeout(`${CONFIG.demoUrl}/api/restaurant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      prompt: '[TEST] Jag vill prata med ägaren tack',
      history: []
    })
  });
  
  const data = await response.json();
  assert(response.ok, `API error: ${response.status}`);
  
  const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text?.toLowerCase() || '';
  assert(
    aiResponse.includes('kopplar') || aiResponse.includes('personal') || aiResponse.includes('dröj'),
    'Expected handoff response'
  );
  
  global.handoffSessionId = data.sessionId;
}

async function testHumanTakeover() {
  assert(global.testSessionId, 'No test session ID');
  
  // Insert human message
  await supabase.from('chat_messages').insert({
    session_id: global.testSessionId,
    role: 'assistant',
    content: '[TEST] Personalsvar',
    sender_type: 'human'
  });
  
  // Send customer message - Sofia should NOT respond
  const response = await fetchWithTimeout(`${CONFIG.demoUrl}/api/restaurant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      prompt: '[TEST] Tack!',
      history: [
        { role: 'user', content: '[TEST] Hej' },
        { role: 'assistant', content: global.testAiResponse },
        { role: 'assistant', content: '[TEST] Personalsvar', sender_type: 'human' }
      ],
      sessionId: global.testSessionId
    })
  });
  
  const data = await response.json();
  assert(data.humanTookOver === true, 'Expected humanTookOver: true');
}

// ============================================
// DASHBOARD TESTS
// ============================================

async function testDashboardLoginPageLoads() {
  const response = await fetchWithTimeout(`${CONFIG.dashboardUrl}/login`);
  assert(response.ok, `Dashboard login returned ${response.status}`);
  const text = await response.text();
  assert(text.includes('Logga in') || text.includes('login') || text.includes('EryAI'), 'Login page content missing');
}

async function testDashboardRedirectsToLogin() {
  const response = await fetchWithTimeout(CONFIG.dashboardUrl, { redirect: 'manual' });
  assert(response.status === 200 || response.status === 302 || response.status === 307, 
    `Expected redirect, got ${response.status}`);
}

// ============================================
// SALES DASHBOARD TESTS
// ============================================

async function testSalesLoginPageLoads() {
  const response = await fetchWithTimeout(`${CONFIG.salesUrl}/login`);
  assert(response.ok, `Sales login returned ${response.status}`);
  const text = await response.text();
  assert(text.includes('Logga in') || text.includes('Sales') || text.includes('EryAI'), 'Sales login content missing');
}

// ============================================
// SUPABASE TESTS
// ============================================

async function testSupabaseConnection() {
  const { data, error } = await supabase.from('customers').select('id').limit(1);
  assert(!error, `Supabase connection error: ${error?.message}`);
  assert(data !== null, 'Supabase returned null');
}

async function testBellaItaliaExists() {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', CONFIG.bellaItaliaId)
    .single();
  
  assert(!error, `Supabase error: ${error?.message}`);
  assert(data, 'Bella Italia customer not found');
  assert(data.slug === 'bella-italia', `Wrong slug: ${data.slug}`);
}

async function testRequiredTablesExist() {
  const tables = ['customers', 'dashboard_users', 'chat_sessions', 'chat_messages', 'notifications'];
  
  for (const table of tables) {
    const { error } = await supabase.from(table).select('id').limit(1);
    assert(!error, `Table '${table}' error: ${error?.message}`);
  }
}

async function testTypingColumnsExist() {
  const { data, error } = await supabase
    .from('chat_sessions')
    .select('visitor_typing, staff_typing')
    .limit(1);
  
  assert(!error, `Typing columns missing: ${error?.message}`);
}

// ============================================
// EMAIL TESTS
// ============================================

async function testResendApiKeyExists() {
  assert(CONFIG.resendApiKey, 'RESEND_API_KEY environment variable not set');
}

// ============================================
// CLEANUP
// ============================================

async function cleanup() {
  log('Cleaning up test data...', 'info');
  
  const sessionIds = [global.testSessionId, global.handoffSessionId].filter(Boolean);
  
  for (const sessionId of sessionIds) {
    await supabase.from('chat_messages').delete().eq('session_id', sessionId);
    await supabase.from('notifications').delete().eq('session_id', sessionId);
    await supabase.from('chat_sessions').delete().eq('id', sessionId);
  }
  
  log('Cleanup complete', 'success');
}

// ============================================
// NOTIFICATION ON FAILURE
// ============================================

async function sendFailureNotification() {
  if (!CONFIG.resendApiKey || results.failed === 0) return;
  
  const failedTests = results.tests.filter(t => t.status === 'failed');
  
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CONFIG.resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'EryAI Tests <tests@eryai.tech>',
        to: CONFIG.notifyEmail,
        subject: `🚨 EryAI Daily Test: ${results.failed} FAILED`,
        html: `
          <!DOCTYPE html>
          <html>
          <body style="font-family: -apple-system, sans-serif; padding: 20px;">
            <div style="background: #dc2626; color: white; padding: 20px; border-radius: 8px;">
              <h1>🚨 EryAI Test Failure</h1>
              <p>${new Date().toLocaleString('sv-SE')}</p>
            </div>
            
            <div style="display: flex; gap: 20px; margin: 20px 0;">
              <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; text-align: center;">
                <div style="font-size: 24px; font-weight: bold; color: #16a34a;">${results.passed}</div>
                <div>Passed</div>
              </div>
              <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; text-align: center;">
                <div style="font-size: 24px; font-weight: bold; color: #dc2626;">${results.failed}</div>
                <div>Failed</div>
              </div>
            </div>
            
            <h2>Failed Tests:</h2>
            ${failedTests.map(t => `
              <div style="padding: 10px; border-left: 3px solid #dc2626; margin: 10px 0; background: #fef2f2;">
                <strong>[${t.category}]</strong> ${t.name}<br>
                <small>${t.error}</small>
              </div>
            `).join('')}
            
            <p>
              <a href="https://vercel.com/eryais-projects">Vercel Dashboard</a> |
              <a href="https://supabase.com/dashboard/project/tjqxseptmeypfsymrrln">Supabase</a>
            </p>
          </body>
          </html>
        `
      })
    });
    log('Failure notification sent', 'info');
  } catch (err) {
    log(`Failed to send notification: ${err.message}`, 'error');
  }
}

// ============================================
// REPORT GENERATION
// ============================================

function generateReport() {
  const duration = results.endTime - results.startTime;
  const total = results.passed + results.failed + results.skipped;
  const successRate = total > 0 ? ((results.passed / total) * 100).toFixed(1) : 0;
  
  console.log('\n' + '═'.repeat(60));
  console.log('📊 ERYAI COMPLETE TEST REPORT');
  console.log('═'.repeat(60));
  console.log(`⏱️  Duration: ${(duration / 1000).toFixed(2)}s`);
  console.log(`✅ Passed:   ${results.passed}`);
  console.log(`❌ Failed:   ${results.failed}`);
  console.log(`⏭️  Skipped:  ${results.skipped}`);
  console.log(`📈 Success:  ${successRate}%`);
  console.log('─'.repeat(60));
  
  console.log('\n📁 BY CATEGORY:');
  Object.entries(results.categories).forEach(([cat, stats]) => {
    const catTotal = stats.passed + stats.failed + stats.skipped;
    const catRate = catTotal > 0 ? ((stats.passed / catTotal) * 100).toFixed(0) : 0;
    const status = stats.failed > 0 ? '❌' : '✅';
    console.log(`  ${status} ${cat}: ${stats.passed}/${catTotal} (${catRate}%)`);
  });
  
  if (results.failed > 0) {
    console.log('\n❌ FAILED TESTS:');
    results.tests.filter(t => t.status === 'failed').forEach(t => {
      console.log(`  • [${t.category}] ${t.name}`);
      console.log(`    └─ ${t.error}`);
    });
  }
  
  console.log('\n' + '═'.repeat(60));
  
  return {
    success: results.failed === 0,
    passed: results.passed,
    failed: results.failed,
    skipped: results.skipped,
    successRate: parseFloat(successRate),
    duration,
    categories: results.categories,
    tests: results.tests,
    timestamp: new Date().toISOString()
  };
}

// ============================================
// MAIN TEST RUNNER
// ============================================

export default async function handler(req, res) {
  // Reset results
  results.passed = 0;
  results.failed = 0;
  results.skipped = 0;
  results.tests = [];
  results.categories = {};
  results.startTime = Date.now();
  global.testSessionId = null;
  global.handoffSessionId = null;
  
  console.log('\n🚀 ERYAI COMPLETE TEST SUITE');
  console.log(`📅 ${new Date().toLocaleString('sv-SE')}`);
  console.log('═'.repeat(60) + '\n');
  
  try {
    // ========== LANDING PAGE ==========
    await runTest('Landing', 'Page loads', testLandingPageLoads);
    await runTest('Landing', 'Demo link exists', testLandingPageLinks);
    
    // ========== DEMO RESTAURANT ==========
    await runTest('Demo', 'Page loads', testDemoPageLoads);
    await runTest('Demo', 'Restaurant API health', testRestaurantApiHealth);
    await runTest('Demo', 'Messages API health', testMessagesApiHealth);
    await runTest('Demo', 'Typing API health', testTypingApiHealth);
    await runTest('Demo', 'Create chat session', testCreateChatSession);
    await runTest('Demo', 'Session saved in Supabase', testSessionInSupabase);
    await runTest('Demo', 'Messages saved in Supabase', testMessagesInSupabase);
    await runTest('Demo', 'Handoff trigger works', testHandoffTrigger);
    await runTest('Demo', 'Human takeover works', testHumanTakeover);
    
    // ========== DASHBOARD ==========
    await runTest('Dashboard', 'Login page loads', testDashboardLoginPageLoads);
    await runTest('Dashboard', 'Redirects to login', testDashboardRedirectsToLogin);
    
    // ========== SALES ==========
    await runTest('Sales', 'Login page loads', testSalesLoginPageLoads);
    
    // ========== SUPABASE ==========
    await runTest('Supabase', 'Connection works', testSupabaseConnection);
    await runTest('Supabase', 'Bella Italia exists', testBellaItaliaExists);
    await runTest('Supabase', 'Required tables exist', testRequiredTablesExist);
    await runTest('Supabase', 'Typing columns exist', testTypingColumnsExist);
    
    // ========== EMAIL ==========
    await runTest('Email', 'Resend API key exists', testResendApiKeyExists, false);
    
    // ========== CLEANUP ==========
    await cleanup();
    
  } catch (error) {
    log(`Test suite error: ${error.message}`, 'error');
  }
  
  results.endTime = Date.now();
  
  // Send notification if failures
  await sendFailureNotification();
  
  // Generate report
  const report = generateReport();

  // Return JSON if requested
  if (req.headers?.accept?.includes('application/json')) {
    const statusCode = report.success ? 200 : 500;
    return res.status(statusCode).json(report);
  }

  // Return HTML report
  const html = generateHtmlReport(report);
  res.setHeader('Content-Type', 'text/html');
  return res.status(200).send(html);
}

function generateHtmlReport(report) {
  const statusColor = report.success ? '#16a34a' : '#dc2626';
  const statusText = report.success ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED';
  const statusBg = report.success ? '#064e3b' : '#7f1d1d';

  return `
<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EryAI Test Results</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a; 
      color: #e2e8f0;
      min-height: 100vh;
      padding: 40px 20px;
    }
    .container { max-width: 900px; margin: 0 auto; }
    h1 { font-size: 2rem; margin-bottom: 10px; }
    .overall-status {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 16px 32px;
      border-radius: 12px;
      font-weight: 600;
      font-size: 1.2rem;
      margin: 20px 0 30px;
      background: ${statusBg};
      color: ${report.success ? '#6ee7b7' : '#fca5a5'};
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-bottom: 30px;
    }
    .stat {
      background: #1e293b;
      padding: 20px;
      border-radius: 12px;
      text-align: center;
    }
    .stat-value { font-size: 2rem; font-weight: bold; }
    .stat-value.passed { color: #22c55e; }
    .stat-value.failed { color: #ef4444; }
    .stat-value.skipped { color: #eab308; }
    .stat-label { color: #94a3b8; margin-top: 5px; }
    .category { margin-bottom: 24px; }
    .category-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: #1e293b;
      border-radius: 8px 8px 0 0;
      font-weight: 600;
    }
    .category-stats { color: #94a3b8; }
    .tests { background: #0f172a; border: 1px solid #334155; border-top: none; border-radius: 0 0 8px 8px; }
    .test {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid #1e293b;
    }
    .test:last-child { border-bottom: none; }
    .test-name { display: flex; align-items: center; gap: 10px; }
    .test-status { font-size: 1.1rem; }
    .test-duration { color: #64748b; font-size: 0.85rem; }
    .test-error { 
      color: #fca5a5; 
      font-size: 0.85rem; 
      margin-top: 4px;
      padding-left: 26px;
    }
    .footer {
      margin-top: 40px;
      text-align: center;
      color: #64748b;
    }
    .footer a { color: #94a3b8; margin: 0 10px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🧪 EryAI Test Results</h1>
    
    <div class="overall-status">
      ${statusText}
    </div>
    
    <div class="stats">
      <div class="stat">
        <div class="stat-value passed">${report.passed}</div>
        <div class="stat-label">Passed</div>
      </div>
      <div class="stat">
        <div class="stat-value failed">${report.failed}</div>
        <div class="stat-label">Failed</div>
      </div>
      <div class="stat">
        <div class="stat-value skipped">${report.skipped}</div>
        <div class="stat-label">Skipped</div>
      </div>
      <div class="stat">
        <div class="stat-value">${(report.duration / 1000).toFixed(1)}s</div>
        <div class="stat-label">Duration</div>
      </div>
    </div>
    
    ${Object.entries(report.categories).map(([category, stats]) => `
      <div class="category">
        <div class="category-header">
          <span>${stats.failed > 0 ? '❌' : '✅'} ${category}</span>
          <span class="category-stats">${stats.passed}/${stats.passed + stats.failed + stats.skipped} passed</span>
        </div>
        <div class="tests">
          ${report.tests.filter(t => t.category === category).map(test => `
            <div class="test">
              <div>
                <div class="test-name">
                  <span class="test-status">${test.status === 'passed' ? '✅' : test.status === 'failed' ? '❌' : '⏭️'}</span>
                  <span>${test.name}</span>
                </div>
                ${test.error ? `<div class="test-error">${test.error}</div>` : ''}
              </div>
              <span class="test-duration">${test.duration}ms</span>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('')}
    
    <div class="footer">
      <p>Test run: ${new Date(report.timestamp).toLocaleString('sv-SE')}</p>
      <p style="margin-top: 10px;">
        <a href="/api/status">System Status</a>
        <a href="/api/health">Health Check</a>
        <a href="/api/test">Run Again</a>
      </p>
    </div>
  </div>
</body>
</html>
  `;
}
