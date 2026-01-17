import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const startTime = Date.now();
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {}
  };

  // Check Supabase
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
    
    const { error } = await supabase
      .from('customers')
      .select('id')
      .limit(1);
    
    health.services.supabase = error ? { status: 'error', error: error.message } : { status: 'ok' };
  } catch (err) {
    health.services.supabase = { status: 'error', error: err.message };
    health.status = 'degraded';
  }

  // Check Gemini API key exists
  health.services.gemini = process.env.GEMINI_API_KEY 
    ? { status: 'ok' } 
    : { status: 'error', error: 'API key missing' };

  // Check Resend API key exists
  health.services.resend = process.env.RESEND_API_KEY 
    ? { status: 'ok' } 
    : { status: 'warning', error: 'API key missing (emails disabled)' };

  // Calculate response time
  health.responseTime = Date.now() - startTime;

  // Set overall status
  const hasErrors = Object.values(health.services).some(s => s.status === 'error');
  if (hasErrors) health.status = 'error';

  const statusCode = health.status === 'ok' ? 200 : health.status === 'degraded' ? 200 : 500;
  
  res.status(statusCode).json(health);
}
