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

You are evaluating a short email written by a team lead to a team member named Maya.

Context:
This email is part of a training scenario about how to deal with missed deadlines as a team lead. Maya works remotely from abroad and has missed two recent deadlines. The quality of her work is good, but the delays are starting to affect team planning. The team lead wants to address the issue while encouraging Maya to raise potential delays earlier in the future.
Write the feedback in two paragraphs.

Paragraph 1 – Scenario Outcome
Start with one sentence describing what happens when Maya reads the email, written like a brief moment from the scenario. Describe Maya’s likely reaction and how the message might affect communication or future deadlines.

For example, the sentence might describe that when Maya reads the email she:
	•	feels comfortable replying and flags a potential delay earlier,
	•	understands the concern but remains unsure about expectations,
	•	feels slightly defensive because the tone sounds accusatory,
	•	acknowledges the email but nothing about the situation really changes.

Focus on what the email causes Maya to think, feel, or do next.

Paragraph 2 – Coaching Feedback
Write three sentences:
	•	First, one short sentence praising a specific strength in the email, if one exists.
	•	Then two sentences giving clear, prioritized suggestions for improvement, explaining what could be clearer or more effective and why.

Keep the tone professional, supportive, and actionable, as if coaching a team lead on improving their communication.

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
