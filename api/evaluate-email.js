// api/evaluate-email.js - Vercel serverless function
import fetch from 'node-fetch';

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const ADMIN_KEY = process.env.ADMIN_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-client-key');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const clientKey = req.headers['x-client-key'];
  if (!clientKey || clientKey !== ADMIN_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'only POST allowed' });

  const { emailText } = req.body || {};
  if (!emailText || typeof emailText !== 'string') {
    return res.status(400).json({ error: 'emailText required' });
  }

  const systemPrompt = `
You are an assistant that evaluates short workplace follow-up emails from a team lead.
Context: The manager and Andrew agreed that Andrew should raise timing risks earlier, before deadlines slip.

Evaluate the provided email on these criteria:
1) Professional, supportive tone (no blaming).
2) Reinforces early communication of risks.
3) Mentions timing, deadlines, or a follow-up/check-in.

If at least two criteria are present, return PASS. Otherwise return NEEDS_REVISION.

Return JSON ONLY with fields:
{"result":"PASS" or "NEEDS_REVISION", "feedback":"Two to three sentence constructive feedback."}
Do not rewrite the email. Be neutral and concise.
`.trim();

  const userContent = `Learner email:\n\n${emailText}`;

  try {
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
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

    if (!openaiRes.ok) {
      const t = await openaiRes.text();
      console.error('OpenAI error', t);
      return res.status(502).json({ error: 'AI service error' });
    }

    const openaiJson = await openaiRes.json();
    const assistantText = (openaiJson.choices?.[0]?.message?.content || '').trim();

    let parsed;
    try { parsed = JSON.parse(assistantText); }
    catch (e) {
      const firstLine = (assistantText.split('\n')[0] || '').toUpperCase();
      const result = firstLine.includes('PASS') ? 'PASS' : 'NEEDS_REVISION';
      const feedback = assistantText.replace(/^PASS:?|^NEEDS_REVISION:?/i, '').trim() || 'Feedback could not be generated.';
      parsed = { result, feedback };
    }

    if (!parsed.result) parsed.result = 'NEEDS_REVISION';
    if (!parsed.feedback) parsed.feedback = 'Please clarify or add timing and next steps.';

    return res.json({ result: parsed.result, feedback: parsed.feedback });
  } catch (err) {
    console.error('Server error', err);
    return res.status(500).json({ error: 'server error' });
  }
}
