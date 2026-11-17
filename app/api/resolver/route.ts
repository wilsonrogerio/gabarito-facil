import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export const maxDuration = 60;

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Modelos Pro reais da API (do mais novo para o estável)
const MODELOS_PRO = [
  'gemini-3.1-pro-preview',
  'gemini-2.5-pro',
  'gemini-3-flash-preview',
];

export async function POST(req: Request) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY não configurada na Vercel.' },
        { status: 500 }
      );
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'Nenhum PDF enviado.' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const base64Pdf = Buffer.from(bytes).toString('base64');

    let ultimoErroMsg = 'Falha desconhecida';

    for (const modelo of MODELOS_PRO) {
      try {
        const response = await ai.models.generateContent({
          model: modelo,
          contents: [
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: base64Pdf,
              },
            },
            'Resolva todas as questões desta prova e retorne APENAS o gabarito final.',
          ],
          config: {
            temperature: 0.1,
            thinkingConfig: {
              thinkingBudget: 1024, // Garante raciocínio matemático sem demorar 40s
            },
            systemInstruction:
              'Você é um corretor de provas exato. Resolva cada questão internamente com rigor matemático e lógico, mas na sua resposta final escreva EXCLUSIVAMENTE o número da questão e a letra da alternativa correta, uma por linha, no formato exato: "1 - A". Não escreva explicações, introduções, saudações ou textos adicionais.',
          },
        });

        if (response.text) {
          return NextResponse.json({
            gabarito: response.text.trim(),
            modelo: modelo,
          });
        }
      } catch (err: any) {
        ultimoErroMsg = `[${modelo}] ${err?.message || JSON.stringify(err)}`;
        console.error(ultimoErroMsg);
        // Continua imediatamente para o próximo modelo da lista
      }
    }

    return NextResponse.json({ error: ultimoErroMsg }, { status: 500 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Erro interno no servidor.' },
      { status: 500 }
    );
  }
}