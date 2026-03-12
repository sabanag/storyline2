// api/evaluate-email.js

export default async function handler(req, res) {
  // 1. Security & CORS (Tells the browser Storyline is allowed to talk to this script)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-client-key');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 2. Authorization (Matches your Storyline "feryala" key)
    const clientKey = req.headers['x-client-key'];
    if (!clientKey || clientKey !== process.env.ADMIN_KEY) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const { emailText } = req.body || {};
    if (!emailText) {
      return res.status(400).json({ error: 'No email text provided' });
    }

    const OPENAI_KEY = process.env.OPENAI_API_KEY;

    // 3. YOUR EXACT AI PROMPT (Restored)
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

    // 4. OpenAI Request
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
        response_format: { type: "json_object" }, 
        temperature: 0
      })
    });

    const data = await response.json();
    const content = data.choices[0].message.content;

    // 5. Send back to Storyline
    const parsed = JSON.parse(content);
    return res.status(200).json({
      result: parsed.result || 'NEEDS_REVISION',
      feedback: parsed.feedback || 'No feedback generated.'
    });

  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
