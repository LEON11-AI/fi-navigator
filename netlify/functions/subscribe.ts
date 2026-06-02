import { Handler } from '@netlify/functions';

export const handler: Handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { email, firstName, intent } = body;
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const normalizedIntent = intent === 'paid' ? 'paid' : 'free';
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!normalizedEmail || !emailPattern.test(normalizedEmail)) {
        return { 
          statusCode: 400, 
          body: JSON.stringify({ error: 'Email is required.' }) 
        };
    }

    const record = {
      email: normalizedEmail,
      firstName: typeof firstName === 'string' ? firstName.trim() : '',
      intent: normalizedIntent,
      source: 'results_cta',
      createdAt: new Date().toISOString(),
      userAgent: event.headers['user-agent'] || ''
    };

    // In a Serverless environment (like Netlify Functions), the file system is read-only.
    // For this MVP, we simply log the subscriber to the console.
    // In a real production app, you would save this `record` to a database (e.g., Supabase, Firebase) 
    // or send it to an email marketing tool API (e.g., Mailchimp, Resend).
    console.log('NEW SUBSCRIBER:', JSON.stringify(record));

    return { 
      statusCode: 200, 
      body: JSON.stringify({ success: true, message: 'You are on the list.' }) 
    };
  } catch (error) {
    console.error('Error in /api/subscribe:', error);
    return { 
      statusCode: 500, 
      body: JSON.stringify({ error: 'Failed to subscribe.' }) 
    };
  }
};