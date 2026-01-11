{\rtf1\ansi\ansicpg1252\cocoartf2867
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\fswiss\fcharset0 Helvetica;}
{\colortbl;\red255\green255\blue255;}
{\*\expandedcolortbl;;}
\margl1440\margr1440\vieww11520\viewh8400\viewkind0
\pard\tx566\tx1133\tx1700\tx2267\tx2834\tx3401\tx3968\tx4535\tx5102\tx5669\tx6236\tx6803\pardirnatural\partightenfactor0

\f0\fs24 \cf0 // api/evaluate-email.js\
// Vercel serverless function: POST /api/evaluate-email\
import fetch from 'node-fetch';\
\
const OPENAI_KEY = process.env.OPENAI_API_KEY; // set in Vercel dashboard\
const ADMIN_KEY = process.env.ADMIN_KEY;       // set in Vercel dashboard\
\
export default async function handler(req, res) \{\
  // Allow CORS for testing - restrict in production if needed\
  res.setHeader('Access-Control-Allow-Origin', '*');\
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-client-key');\
  if (req.method === 'OPTIONS') \{\
    return res.status(204).end();\
  \}\
\
  // simple auth: check header\
  const clientKey = req.headers['x-client-key'];\
  if (!clientKey || clientKey !== ADMIN_KEY) \{\
    return res.status(401).json(\{ error: 'unauthorized' \});\
  \}\
\
  if (req.method !== 'POST') \{\
    return res.status(405).json(\{ error: 'only POST allowed' \});\
  \}\
\
  const \{ emailText \} = req.body || \{\};\
  if (!emailText || typeof emailText !== 'string') \{\
    return res.status(400).json(\{ error: 'emailText required' \});\
  \}\
\
  // Compose the system prompt\
  const systemPrompt = `\
You are an assistant that evaluates short workplace follow-up emails from a team lead.\
Context: The manager and Andrew agreed that Andrew should raise timing risks earlier, before deadlines slip.\
\
Evaluate the provided email on these criteria:\
1) Professional, supportive tone (no blaming).\
2) Reinforces early communication of risks.\
3) Mentions timing, deadlines, or a follow-up/check-in.\
\
If at least two criteria are present, return PASS. Otherwise return NEEDS_REVISION.\
\
Return JSON ONLY with fields:\
\{"result":"PASS" or "NEEDS_REVISION", "feedback":"Two to three sentence constructive feedback."\}\
Do not rewrite the email. Be neutral and concise.\
`.trim();\
\
  const userContent = `Learner email:\\n\\n$\{emailText\}`;\
\
  try \{\
    // Call OpenAI Chat Completions\
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', \{\
      method: 'POST',\
      headers: \{\
        'Authorization': `Bearer $\{OPENAI_KEY\}`,\
        'Content-Type': 'application/json'\
      \},\
      body: JSON.stringify(\{\
        model: 'gpt-4o-mini',    // change if you have another model\
        messages: [\
          \{ role: 'system', content: systemPrompt \},\
          \{ role: 'user', content: userContent \}\
        ],\
        temperature: 0.0,\
        max_tokens: 250\
      \})\
    \});\
\
    if (!openaiRes.ok) \{\
      const text = await openaiRes.text();\
      console.error('OpenAI error:', text);\
      return res.status(502).json(\{ error: 'AI service error' \});\
    \}\
\
    const openaiJson = await openaiRes.json();\
    const assistantText = openaiJson.choices?.[0]?.message?.content?.trim() || '';\
\
    // Try to parse JSON from assistant\
    let parsed;\
    try \{\
      parsed = JSON.parse(assistantText);\
    \} catch (e) \{\
      // Fallback: detect PASS/NEEDS and feedback heuristically\
      const firstLine = (assistantText.split('\\n')[0] || '').toUpperCase();\
      const result = firstLine.includes('PASS') ? 'PASS' : 'NEEDS_REVISION';\
      const feedback = assistantText.replace(/^PASS:?|^NEEDS_REVISION:?/i, '').trim() || 'Feedback could not be generated.';\
      parsed = \{ result, feedback \};\
    \}\
\
    // Sanity-check\
    if (!parsed.result) parsed.result = 'NEEDS_REVISION';\
    if (!parsed.feedback) parsed.feedback = 'Please clarify or add timing and next steps.';\
\
    return res.json(\{ result: parsed.result, feedback: parsed.feedback \});\
  \} catch (err) \{\
    console.error('Server error:', err);\
    return res.status(500).json(\{ error: 'server error' \});\
  \}\
\}}