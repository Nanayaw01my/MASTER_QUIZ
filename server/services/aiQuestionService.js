const Anthropic = require('@anthropic-ai/sdk');

/** Whether AI question generation is configured. */
const isConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);

// Strict JSON schema the model must return (structured outputs).
const schema = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['mcq', 'truefalse', 'fillblank'] },
          text: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
          correctAnswer: { type: 'string' },
          difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
          marks: { type: 'number' },
        },
        required: ['type', 'text', 'options', 'correctAnswer', 'difficulty', 'marks'],
        additionalProperties: false,
      },
    },
  },
  required: ['questions'],
  additionalProperties: false,
};

/**
 * Generate exam questions with Claude.
 * @returns {Promise<Array>} raw question objects (validated/normalized by the caller)
 */
const generateQuestions = async ({ subjectName, topic, count = 5, difficulty = 'mixed', type = 'mixed' }) => {
  if (!isConfigured()) throw new Error('ANTHROPIC_API_KEY is not set');

  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

  const typeLine =
    type === 'mixed'
      ? 'Use a mix of question types: "mcq" (multiple choice), "truefalse", and "fillblank".'
      : `All questions must be of type "${type}".`;
  const diffLine =
    difficulty === 'mixed'
      ? 'Vary the difficulty across "easy", "medium" and "hard".'
      : `All questions must be "${difficulty}" difficulty.`;

  const prompt = `You are an experienced examiner creating quiz questions for students.

Generate exactly ${count} exam questions for the subject "${subjectName}"${topic ? `, focused on the topic "${topic}"` : ''}.

Requirements:
- ${typeLine}
- ${diffLine}
- For "mcq": provide exactly 4 plausible options in the "options" array, and "correctAnswer" must be the exact text of the correct option.
- For "truefalse": "options" must be ["True","False"] and "correctAnswer" must be exactly "True" or "False".
- For "fillblank": "options" must be an empty array [] and "correctAnswer" is the exact expected answer text (keep it short, one or few words).
- "marks" is a number between 1 and 5 reflecting difficulty.
- Questions must be accurate, unambiguous, age-appropriate for school students, and free of duplicates.
- Keep each question self-contained (no "as shown above" references).

Return only the structured JSON.`;

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 8000,
    output_config: { format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content: prompt }],
  });

  if (response.stop_reason === 'refusal') throw new Error('The request was declined by the model');

  const textBlock = (response.content || []).find((b) => b.type === 'text');
  if (!textBlock) throw new Error('No content returned by the model');

  let parsed;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch (err) {
    throw new Error('Model returned malformed JSON');
  }
  if (!parsed || !Array.isArray(parsed.questions)) throw new Error('Model returned no questions');
  return parsed.questions;
};

module.exports = { generateQuestions, isConfigured };
