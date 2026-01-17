import { createClient } from '@supabase/supabase-js';

const CONFIG = {
  demoUrl: 'https://ery-ai-demo-restaurang.vercel.app',
  dashboardUrl: 'https://dashboard.eryai.tech',
  salesUrl: 'https://sales.eryai.tech',
  landingUrl: 'https://eryai.tech',
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_SERVICE_KEY
};

async function checkUrl(url, name) {
  const start = Date.now();
  try {
    const response = await fetch(url, { 
      method: 'GET',
      signal: AbortSignal.timeout(10000)
    });
    return {
      name,
      url,
      status: response.ok ? 'operational' : 'degraded',
      statusCode: response.status,
      responseTime: Date.now() - start
    };
  } catch (error) {
    return {
      name,
      url,
      status: 'down',
      error: error.message,
      responseTime: Date.now() - start
    };
  }
}

async function checkApi(url, name) {
  const start = Date.now();
  try {
    const response = await fetch(url, { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'health check' }),
      signal: AbortSignal.timeout(15000)
    });
    // 200 or 400 (bad request) both mean API is responding
    const isUp = response.ok || response.status === 400;
    return {
      name,
      url,
      status: isUp ? 'operational' : 'degraded',
      statusCode: response.status,
      responseTime: Date.now() - start
    };
  } catch (error) {
    return {
      name,
      url,
      status: 'down',
      error: error.message,
      responseTime: Date.now() - start
    };
  }
}

async function checkSupabase() {
  const start = Date.now();
  try {
    const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);
    const { error } = await supabase.from('customers').select('id').limit(1);
    return {
      name: 'Supabase Database',
      status: error ? 'degraded' : 'operational',
      responseTime: Date.now() - start,
      error: error?.message
    };
  } catch (error) {
    return {
      name: 'Supabase Database',
      status: 'down',
      responseTime: Date.now() - start,
      error: error.message
    };
  }
}

export default async function handler(req, res) {
  const checks = await Promise.all([
    checkUrl(CONFIG.landingUrl, 'Landing Page'),
    checkUrl(CONFIG.demoUrl, 'Demo Restaurant'),
    checkApi(`${CONFIG.demoUrl}/api/restaurant`, 'Sofia AI API'),
    checkUrl(CONFIG.dashboardUrl, 'Customer Dashboard'),
    checkUrl(CONFIG.salesUrl, 'Sales Dashboard'),
    checkSupabase()
  ]);

  const allOperational = checks.every(c => c.status === 'operational');
  const anyDown = checks.some(c => c.status === 'down');
  
  const overallStatus = anyDown ? 'major_outage' : allOperational ? 'operational' : 'partial_outage';

  const statusEmoji = {
    operational: '🟢',
    degraded: '🟡',
    down: '🔴',
    major_outage: '🔴',
    partial_outage: '🟡'
  };

  // Return JSON if requested
  if (req.headers.accept?.includes('application/json')) {
    return res.status(200).json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      services: checks
    });
  }

  // Return HTML status page
  const html = `
<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EryAI System Status</title>
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
    h1 { font-size: 2rem; margin-bottom: 10px; }
    .overall-status {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 12px 24px;
      border-radius: 50px;
      font-weight: 600;
      margin: 20px 0 40px;
    }
    .overall-status.operational { background: #064e3b; color: #6ee7b7; }
    .overall-status.partial_outage { background: #78350f; color: #fcd34d; }
    .overall-status.major_outage { background: #7f1d1d; color: #fca5a5; }
    .services { display: flex; flex-direction: column; gap: 12px; }
    .service {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #1e293b;
      padding: 20px;
      border-radius: 12px;
    }
    .service-info { display: flex; align-items: center; gap: 12px; }
    .service-name { font-weight: 600; }
    .service-url { font-size: 0.85rem; color: #94a3b8; }
    .service-status {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.9rem;
    }
    .status-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
    }
    .status-dot.operational { background: #22c55e; }
    .status-dot.degraded { background: #eab308; }
    .status-dot.down { background: #ef4444; }
    .response-time { color: #94a3b8; font-size: 0.85rem; }
    .footer {
      margin-top: 40px;
      text-align: center;
      color: #64748b;
      font-size: 0.9rem;
    }
    .footer a { color: #94a3b8; }
  </style>
</head>
<body>
  <div class="container">
    <h1>EryAI System Status</h1>
    
    <div class="overall-status ${overallStatus}">
      ${statusEmoji[overallStatus]} 
      ${overallStatus === 'operational' ? 'All Systems Operational' : 
        overallStatus === 'partial_outage' ? 'Partial System Outage' : 'Major System Outage'}
    </div>
    
    <div class="services">
      ${checks.map(service => `
        <div class="service">
          <div class="service-info">
            <div>
              <div class="service-name">${service.name}</div>
              ${service.url ? `<div class="service-url">${service.url}</div>` : ''}
            </div>
          </div>
          <div class="service-status">
            <span class="response-time">${service.responseTime}ms</span>
            <div class="status-dot ${service.status}"></div>
            <span>${service.status === 'operational' ? 'Operational' : 
                   service.status === 'degraded' ? 'Degraded' : 'Down'}</span>
          </div>
        </div>
      `).join('')}
    </div>
    
    <div class="footer">
      <p>Last updated: ${new Date().toLocaleString('sv-SE')}</p>
      <p style="margin-top: 10px;">
        <a href="/api/test">Run Full Test Suite</a> · 
        <a href="/api/health">Health Check</a>
      </p>
    </div>
  </div>
</body>
</html>
  `;

  res.setHeader('Content-Type', 'text/html');
  return res.status(200).send(html);
}
