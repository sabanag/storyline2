// api/evaluate-email.js

res.setHeader('Access-Control-Allow-Credentials', true);
res.setHeader('Access-Control-Allow-Origin', '*'); // This allows Storyline to talk to Vercel
res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, x-client-key');

if (req.method === 'OPTIONS') {
  res.status(200).end();
  return;
}

export default async function handler(req, res) {
  // 1. Enhanced CORS & Method Guard
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-client-key');
  
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // 2. Authorization
    const clientKey = req.headers['x-client-key'];
    if (!clientKey || clientKey !== process.env.ADMIN_KEY) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    // 3. Validation
    const { emailText } = req.body || {};
    if (!emailText || typeof emailText !== 'string' || emailText.trim().length === 0) {
      return res.status(400).json({ error: 'Valid emailText string is required' });
    }

    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_KEY) {
      console.error('[Config Error]: Missing OPENAI_API_KEY');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // Your exact prompt preserved
    const systemPrompt = `
	Produce a constructive feedback message of 3-5 sentences aimed at the learner. 
	The feedback must begin with one sentence that clearly describes a realistic positive or negative consequence of sending this exact email (what happened after the emial. neutral, realistic — e.g., it calmed the recipient, helped Maya flag any potential delays without feeling blamed, risk sounding accusatory, or did not change anything). 
	After that consequence sentence include one short sentence that praises a specific strength (if any).
	Follow with two sentences giving concrete, prioritized suggestions for improvement (what to change and why).
	Be professional, encouraging, and actionable.

Evaluate the email against these three criteria:
	1. Professional and supportive tone (no blaming, shaming, or accusatory language).
	2. Offers help or asks whether anything is blocking the team member (explicit willingness to support).
	3. Mentions timing, deadlines, or a concrete follow-up/check-in (a clear reference to timing or how/when you will follow up).
Three criteria are present, return PASS. Otherwise return NEEDS_REVISION.

Return JSON ONLY with fields:
{"result":"PASS" or "NEEDS_REVISION", "feedback":"Two to three sentence constructive feedback."}
Do not rewrite the email. Do not invent facts not present in the email.
`.trim();

    // 4. OpenAI Request with JSON Mode enabled
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Learner email content to evaluate:\n"""\n${emailText}\n"""` }
        ],
        response_format: { type: "json_object" }, // Forces valid JSON output
        temperature: 0,
        max_tokens: 300
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('[OpenAI Error]:', errorData);
      return res.status(502).json({ error: 'AI provider error', details: errorData.error?.message });
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    // 5. Safe Parsing
    try {
      const parsed = JSON.parse(content);
      return res.status(200).json({
        result: parsed.result || 'NEEDS_REVISION',
        feedback: parsed.feedback || 'Please review the email for tone and timing.'
      });
    } catch (parseError) {
      console.error('[Parse Error]: AI did not return valid JSON', content);
      return res.status(500).json({ error: 'Failed to parse AI response' });
    }

  } catch (err) {
    console.error('[Runtime Error]:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}



