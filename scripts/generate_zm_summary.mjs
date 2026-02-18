import fs from 'node:fs/promises';
import path from 'node:path';

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('Missing OPENAI_API_KEY in your environment.');
  process.exit(1);
}

const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'zm_q3_fy2026.txt');
const outPath = path.join(process.cwd(), 'tests', 'fixtures', 'zm_q3_fy2026_summary.txt');

const sourceText = await fs.readFile(fixturePath, 'utf-8');

const payload = {
  model: 'gpt-4o-mini',
  input: [
    {
      role: 'system',
      content:
        'Summarize the earnings press release in 6 concise bullet points. You must include: (1) revenue, (2) EPS, (3) operating income or margin, (4) net income, (5) operating cash flow and free cash flow, and (6) guidance plus cash/marketable securities when present. Do not invent numbers.',
    },
    {
      role: 'user',
      content: `Press release text:\\n${sourceText}`,
    },
  ],
};

const res = await fetch('https://api.openai.com/v1/responses', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(payload),
});

if (!res.ok) {
  const errorText = await res.text();
  console.error('OpenAI request failed:', res.status, errorText);
  process.exit(1);
}

const data = await res.json();

const extractOutputText = (payload) => {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  const parts = [];
  for (const output of payload?.output ?? []) {
    for (const content of output?.content ?? []) {
      if (content?.type === 'output_text' && typeof content?.text === 'string') {
        parts.push(content.text);
      }
    }
  }
  return parts.join('\n').trim();
};

const summary = extractOutputText(data);

if (!summary) {
  console.error('No summary text returned from OpenAI.');
  process.exit(1);
}

await fs.writeFile(outPath, summary + '\n', 'utf-8');
console.log('Wrote summary to', outPath);
