import { createClient } from '@supabase/supabase-js';

// ============================================
// ERYAI HEALTH CHECK - FULL SERVICE VALIDATION
// Tests actual connectivity to ALL services
// ============================================

const CONFIG = {
  demoUrl: 'https://ery-ai-demo-restaurang.vercel.app',
  dashboardUrl: 'https://dashboard.eryai.tech',
  salesUrl: 'https://sales.eryai.tech',
  landingUrl: 'https://eryai.tech',
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_SERVICE_KEY,
  geminiKey: process.env.GEMINI_API_KEY,
  resendKey: process.env.RESEND_API_KEY
};

async function checkWithTimeout(name, checkFn, timeout = 10000) {
  const start = Date.now();
  try {
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout')), timeout)
    );
    await Promise.race([checkFn(), timeoutPromise]);
    return { 
      name, 
      status: 'ok', 
      responseTime: Date.now() - start 
    };
  } catch (error) {
    return { 
      name, 
      status: 'error', 
      error: error.message, 
      responseTime: Date.now() - start 
    };
  }
}

// ============================================
// SERVICE CHECKS
// ============================================

async function checkSupabase() {
  const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);
  const { error } = await supabase.from('customers').select('id').limit(1);
  if (error) throw new Error(error.message);
}

async function checkGemini() {
  if (!CONFIG.geminiKey) throw new Error('API key missing');
  
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${CONFIG.geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Reply with OK' }] }],
        generationConfig: { maxOutputTokens: 5 }
      })
    }
  );
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error: ${response.status}`);
  }
}

async function checkResend() {
  if (!CONFIG.resendKey) throw new Error('API key missing');
  
  // Check API key validity by calling domains endpoint (doesn't send email)
  const response = await fetch('https://api.resend.com/domains', {
    headers: { 'Authorization': `Bearer ${CONFIG.resendKey}` }
  });
  
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
}

async function checkUrl(url) {
  const response = await fetch(url, { 
    method: 'GET',
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

async function checkRestaurantApi() {
  const response = await fetch(`${CONFIG.demoUrl}/api/restaurant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'health check' })
  });
  // 200 or 400 both mean API is responding
  if (!response.ok && response.status !== 400) {
    throw new Error(`HTTP ${response.status}`);
  }
}

async function checkMessagesApi() {
  const response = await fetch(`${CONFIG.demoUrl}/api/messages?session_id=00000000-0000-0000-0000-000000000000`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

async function checkTypingApi() {
  const response = await fetch(`${CONFIG.demoUrl}/api/typing?session_id=00000000-0000-0000-0000-000000000000`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

// ============================================
// MAIN HANDLER
// ============================================

export default async function handler(req, res) {
  const startTime = Date.now();
  
  // Run all checks in parallel
  const checks = await Promise.all([
    // Infrastructure
    checkWithTimeout('Supabase Database', checkSupabase),
    checkWithTimeout('Gemini AI API', checkGemini),
    checkWithTimeout('Resend Email API', checkResend),
    
    // Websites
    checkWithTimeout('Landing Page', () => checkUrl(CONFIG.landingUrl)),
    checkWithTimeout('Demo Restaurant', () => checkUrl(CONFIG.demoUrl)),
    checkWithTimeout('Customer Dashboard', () => checkUrl(CONFIG.dashboardUrl)),
    checkWithTimeout('Sales Dashboard', () => checkUrl(CONFIG.salesUrl)),
    
    // APIs
    checkWithTimeout('Sofia AI API', checkRestaurantApi, 15000),
    checkWithTimeout('Messages API', checkMessagesApi),
    checkWithTimeout('Typing API', checkTypingApi),
  ]);

  // Calculate overall status
  const errors = checks.filter(c => c.status === 'error');
  const allOk = errors.length === 0;
  const criticalServices = ['Supabase Database', 'Gemini AI API', 'Sofia AI API'];
  const criticalDown = errors.some(e => criticalServices.includes(e.name));

  let overallStatus = 'ok';
  if (criticalDown) overallStatus = 'critical';
  else if (errors.length > 0) overallStatus = 'degraded';

  const health = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    totalResponseTime: Date.now() - startTime,
    summary: {
      total: checks.length,
      ok: checks.filter(c => c.status === 'ok').length,
      errors: errors.length
    },
    services: {}
  };

  // Group by category
  checks.forEach(check => {
    health.services[check.name] = {
      status: check.status,
      responseTime: check.responseTime,
      ...(check.error && { error: check.error })
    };
  });

  // Return JSON if requested
  if (req.headers?.accept?.includes('application/json')) {
    const statusCode = overallStatus === 'critical' ? 503 : overallStatus === 'degraded' ? 200 : 200;
    return res.status(statusCode).json(health);
  }

  // Return HTML
  const statusColors = {
    ok: { bg: '#064e3b', text: '#6ee7b7', dot: '#22c55e' },
    degraded: { bg: '#78350f', text: '#fcd34d', dot: '#eab308' },
    critical: { bg: '#7f1d1d', text: '#fca5a5', dot: '#ef4444' },
    error: { bg: '#7f1d1d', text: '#fca5a5', dot: '#ef4444' }
  };

  const html = `
<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="30">
  <title>EryAI Health Check</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a; 
      color: #e2e8f0;
      min-height: 100vh;
      padding: 40px 20px;
    }
    .container { max-width: 800px; margin: 0 auto; }
    h1 { font-size: 1.8rem; margin-bottom: 8px; }
    .subtitle { color: #64748b; margin-bottom: 20px; }
    .overall {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 14px 28px;
      border-radius: 50px;
      font-weight: 600;
      margin-bottom: 30px;
      background: ${statusColors[overallStatus].bg};
      color: ${statusColors[overallStatus].text};
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 30px;
    }
    .stat {
      background: #1e293b;
      padding: 16px;
      border-radius: 10px;
      text-align: center;
    }
    .stat-value { font-size: 1.8rem; font-weight: bold; }
    .stat-value.ok { color: #22c55e; }
    .stat-value.error { color: #ef4444; }
    .stat-label { color: #94a3b8; font-size: 0.9rem; margin-top: 4px; }
    .section { margin-bottom: 24px; }
    .section-title { 
      font-size: 0.9rem; 
      color: #64748b; 
      text-transform: uppercase; 
      letter-spacing: 1px;
      margin-bottom: 12px;
    }
    .services { display: flex; flex-direction: column; gap: 8px; }
    .service {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #1e293b;
      padding: 14px 18px;
      border-radius: 10px;
    }
    .service-left { display: flex; align-items: center; gap: 12px; }
    .service-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }
    .service-dot.ok { background: #22c55e; }
    .service-dot.error { background: #ef4444; }
    .service-name { font-weight: 500; }
    .service-error { color: #f87171; font-size: 0.8rem; margin-top: 2px; }
    .service-time { color: #64748b; font-size: 0.85rem; }
    .footer {
      margin-top: 40px;
      text-align: center;
      color: #475569;
      font-size: 0.85rem;
    }
    .footer a { color: #64748b; margin: 0 8px; }
    .refresh { color: #475569; font-size: 0.8rem; margin-top: 10px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🏥 EryAI Health Check</h1>
    <p class="subtitle">Real-time service monitoring</p>
    
    <div class="overall">
      ${overallStatus === 'ok' ? '✅ All Systems Operational' : 
        overallStatus === 'degraded' ? '⚠️ Partial Degradation' : 
        '🚨 Critical Issues Detected'}
    </div>
    
    <div class="stats">
      <div class="stat">
        <div class="stat-value ok">${health.summary.ok}</div>
        <div class="stat-label">Services OK</div>
      </div>
      <div class="stat">
        <div class="stat-value error">${health.summary.errors}</div>
        <div class="stat-label">Errors</div>
      </div>
      <div class="stat">
        <div class="stat-value">${health.totalResponseTime}ms</div>
        <div class="stat-label">Total Time</div>
      </div>
    </div>
    
    <div class="section">
      <div class="section-title">Infrastructure</div>
      <div class="services">
        ${['Supabase Database', 'Gemini AI API', 'Resend Email API'].map(name => {
          const s = health.services[name];
          return `
            <div class="service">
              <div class="service-left">
                <div class="service-dot ${s.status}"></div>
                <div>
                  <div class="service-name">${name}</div>
                  ${s.error ? `<div class="service-error">${s.error}</div>` : ''}
                </div>
              </div>
              <div class="service-time">${s.responseTime}ms</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
    
    <div class="section">
      <div class="section-title">Websites</div>
      <div class="services">
        ${['Landing Page', 'Demo Restaurant', 'Customer Dashboard', 'Sales Dashboard'].map(name => {
          const s = health.services[name];
          return `
            <div class="service">
              <div class="service-left">
                <div class="service-dot ${s.status}"></div>
                <div>
                  <div class="service-name">${name}</div>
                  ${s.error ? `<div class="service-error">${s.error}</div>` : ''}
                </div>
              </div>
              <div class="service-time">${s.responseTime}ms</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
    
    <div class="section">
      <div class="section-title">APIs</div>
      <div class="services">
        ${['Sofia AI API', 'Messages API', 'Typing API'].map(name => {
          const s = health.services[name];
          return `
            <div class="service">
              <div class="service-left">
                <div class="service-dot ${s.status}"></div>
                <div>
                  <div class="service-name">${name}</div>
                  ${s.error ? `<div class="service-error">${s.error}</div>` : ''}
                </div>
              </div>
              <div class="service-time">${s.responseTime}ms</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
    
    <div class="footer">
      <p>Last check: ${new Date().toLocaleString('sv-SE')}</p>
      <p class="refresh">Auto-refreshes every 30 seconds</p>
      <p style="margin-top: 10px;">
        <a href="/api/status">Status Page</a>
        <a href="/api/test">Full Test Suite</a>
        <a href="/api/health">Refresh Now</a>
      </p>
    </div>
  </div>
</body>
</html>
  `;

  res.setHeader('Content-Type', 'text/html');
  return res.status(200).send(html);
}
