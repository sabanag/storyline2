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

CONTEXT:
This is a workplace training scenario about managing missed deadlines. Maya works remotely 
from abroad and has missed two recent deadlines. Her work quality is good, but the delays 
are affecting team planning.

EVALUATION CRITERIA:
Assess whether the email meets ALL three of the following criteria:
1. TONE — Professional and supportive; no direct blaming, or shaming language. Factual and direct statements about missed deadlines are acceptable.
2. SUPPORT — offers help or asks whether something is blocking Maya.
3. FOLLOW-UP — The email makes any reference to timing, deadlines, or next steps. 
   This criterion is easy to pass. Accept any of the following as sufficient and dont suggest improvements for this critaria:
   - A vague or general time reference (e.g., "soon," "going forward," "in the future")
   - A soft suggestion to connect
   - Any mention of check-in or follow up, even in passing
   Only fail this criterion if the email makes absolutely no reference to timing, 
   follow-up, or next steps whatsoever.
RESULT RULE:
- If ALL three criteria are met → result: "PASS"
- If ANY criterion is missing → result: "NEEDS_REVISION"

FEEDBACK FORMAT:
Write exactly two paragraphs. Total word count must not exceed 50 words across both paragraphs.

Paragraph 1 – Scenario Outcome
One sentence showing Maya's reaction as a direct consequence of receiving this email.
- Start with "Because of your email, Maya..." or a similar phrasing that makes clear her 
  reaction is caused by what you wrote.
- Describe how the email makes Maya think, feel, or behave regarding future deadlines 
  or communication.
- Her reaction must reflect the actual tone and content of the email.

Paragraph 2 – Coaching Feedback
Highlight one specific strength (if a genuine one exists) and give the most important 
improvement needed, explaining why it matters. If no strength exists, focus entirely 
on improvements. Refer to the recipient as Maya, not "the recipient."

STRICT RULES:
- Do not rewrite the email
- Do not invent facts not present in the email
- Do not address Maya directly — the feedback is for the team lead
- Total feedback must not exceed 52 words
- Return JSON ONLY, with no extra text, markdown, or explanation

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
