// api/evaluate-email.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-client-key');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const clientKey = req.headers['x-client-key'];
    if (!clientKey || clientKey !== process.env.ADMIN_KEY) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'only POST allowed' });

    const { emailText } = req.body || {};
    if (!emailText || typeof emailText !== 'string') {
      return res.status(400).json({ error: 'emailText required' });
    }

    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_KEY) {
      console.error('Missing OPENAI_API_KEY in env');
      return res.status(500).json({ error: 'server configuration error: missing OPENAI_API_KEY' });
    }

    const systemPrompt = `
	Evaluate the email against these three criteria:
	1. Professional and supportive tone (no blaming, shaming, or accusatory language).
	2. Offers help or asks whether anything is blocking the team member (explicit willingness to support).
	3. Mentions timing, deadlines, or a concrete follow-up/check-in (a clear reference to timing or how/when you will follow up).
	
  All three criteria must be present for the email to be considered PASS. If any single criterion is missing, mark the email NEEDS_REVISION.
	Produce a constructive feedback message of 2–3 sentences aimed at the learner. 
  
  The feedback should:
	
	The feedback must begin with one sentence that clearly describes the likely consequence of sending this exact email (neutral, realistic — e.g., it may calm the recipient, risk sounding accusatory, or leave expectations unclear). 
	After that consequence sentence include one short sentence that praises a specific strength (if any).
	Follow with one or two sentences giving concrete, prioritized suggestions for improvement (what to change and why).
	Be professional, encouraging, and actionable.
	Do not rewrite the email or invent facts not present in the email.
	Return JSON only, using exactly these keys and values. Do not include any additional keys or commentary outside the JSON.

Three criteria are present, return PASS. Otherwise return NEEDS_REVISION.

Return JSON ONLY with fields:
{"result":"PASS" or "NEEDS_REVISION", "feedback":"Two to three sentence constructive feedback."}
Do not rewrite the email. Be neutral and concise.
`.trim();

    const userContent = `Learner email:\n\n${emailText}`;

    // Call OpenAI Chat Completions
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent }
        ],
        temperature: 0.0,
        max_tokens: 250
      })
    });

    if (!resp.ok) {
      const t = await resp.text();
      console.error('OpenAI API error', resp.status, t);
      return res.status(502).json({ error: 'AI service error', detail: t.slice(0,1000) });
    }

    const json = await resp.json();
    const assistantText = (json.choices?.[0]?.message?.content || '').trim();

    let parsed;
    try {
      parsed = JSON.parse(assistantText);
    } catch (e) {
      const firstLine = (assistantText.split('\n')[0] || '').toUpperCase();
      const result = firstLine.includes('PASS') ? 'PASS' : 'NEEDS_REVISION';
      const feedback = assistantText.replace(/^PASS:?|^NEEDS_REVISION:?/i, '').trim() || 'Feedback could not be generated.';
      parsed = { result, feedback };
    }

    if (!parsed.result) parsed.result = 'NEEDS_REVISION';
    if (!parsed.feedback) parsed.feedback = 'Please clarify or add timing and next steps.';

    return res.json({ result: parsed.result, feedback: parsed.feedback });

  } catch (err) {
    console.error('Function error', err);
    return res.status(500).json({ error: 'server error', message: String(err).slice(0,500) });
  }
}
