import { Handler } from '@netlify/functions';
import { GoogleGenAI, Type } from '@google/genai';
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';

// Configure global proxy for Node.js 18+ fetch (used for local dev in China)
if (process.env.HTTP_PROXY || process.env.HTTPS_PROXY) {
  const envAgent = new EnvHttpProxyAgent();
  setGlobalDispatcher(envAgent);
  console.log('Global proxy dispatcher configured via undici for Netlify Function');
}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

export const handler: Handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { text } = body;

    if (!text || typeof text !== 'string') {
      return { 
        statusCode: 400, 
        body: JSON.stringify({ error: 'Text prompt is required.' }) 
      };
    }

    if (!process.env.GEMINI_API_KEY) {
      return { 
        statusCode: 503, 
        body: JSON.stringify({ error: 'Smart input is not configured. Enter your numbers manually.' }) 
      };
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: text,
      config: {
        systemInstruction: "Extract structured personal finance fields from the user's text. Return JSON only. Do not provide financial advice. Do not recommend securities, funds, insurance, loans, or tax actions. If a value is missing or ambiguous, set it to null and include the field in missingFields. Use USD as default currency unless the user states otherwise. Do not derive monthlyInvesting from income minus expenses or from general surplus. Only fill monthlyInvesting when the user explicitly states a recurring monthly amount they invest, save, contribute, or put into assets. Do not infer expectedAnnualRealReturn, safeWithdrawalRate, or targetMonthlySpending from generic FIRE conventions. Only fill those assumption fields when the user explicitly states them.",
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            monthlyIncome: { type: Type.NUMBER, description: 'Monthly income after taxes' },
            monthlyExpenses: { type: Type.NUMBER, description: 'Current monthly expenses' },
            investedAssets: { type: Type.NUMBER, description: 'Invested assets, excluding primary home/consumer goods' },
            liquidSavings: { type: Type.NUMBER, description: 'Cash, checking, short-term savings' },
            debt: { type: Type.NUMBER, description: 'Total debt' },
            highInterestDebt: { type: Type.NUMBER, description: 'High-interest debt like credit cards' },
            passiveIncome: { type: Type.NUMBER, description: 'Monthly passive income' },
            monthlyInvesting: { type: Type.NUMBER, description: 'Monthly amount explicitly invested or contributed to assets. Do not infer from income minus expenses.' },
            targetMonthlySpending: { type: Type.NUMBER, description: 'Target monthly spending after reaching FI. Only fill when explicitly stated.' },
            expectedAnnualRealReturn: { type: Type.NUMBER, description: 'Expected annual real return (e.g., 0.05 for 5%). Only fill when explicitly stated.' },
            safeWithdrawalRate: { type: Type.NUMBER, description: 'Safe withdrawal rate (e.g., 0.04 for 4%). Only fill when explicitly stated.' },
            currency: { type: Type.STRING, description: 'Currency code, e.g., USD' },
            confidence: { type: Type.STRING, description: 'Confidence level: high, medium, low' },
            missingFields: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'List of key fields that were missing'
            }
          },
          required: ['currency', 'confidence', 'missingFields']
        }
      }
    });

    const jsonStr = response.text?.trim() || '{}';
    let data = {};
    try {
      data = JSON.parse(jsonStr);
    } catch (err) {
       console.error('Failed to parse Gemini output as JSON:', jsonStr);
       return { 
         statusCode: 500, 
         body: JSON.stringify({ error: 'Failed to process the input.' }) 
       };
    }

    return { 
      statusCode: 200, 
      body: JSON.stringify(data) 
    };
  } catch (error) {
    console.error('Error in /api/parse:', error);
    return { 
      statusCode: 500, 
      body: JSON.stringify({ error: 'Failed to process request.' }) 
    };
  }
};
