import { NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';

export const maxDuration = 60;

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Modelos reais com cota gratuita separada (sem o 3.8-flash já esgotado hoje e sem o lite inexistente)
const MODELOS_DISPONIVEIS = [
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-4-hydrogen',
  'gemini-3.8-flash', // Mantido por último para quando a cota renovar amanhã
];

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'Nenhum PDF enviado.' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const base64Pdf = Buffer.from(bytes).toString('base64');

    const erros: string[] = [];

    for (const modelo of MODELOS_DISPONIVEIS) {
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
            'Resolva todas as questões desta prova com rigor matemático e lógico.',
          ],
          config: {
            temperature: 0.1,
            abortSignal: AbortSignal.timeout(14000), // Máximo 14s por modelo para nunca dar timeout na Vercel
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  questao: { type: Type.INTEGER },
                  calculoCurto: {
                    type: Type.STRING,
                    description: 'Conta ou dedução direta em no máximo 15 palavras.',
                  },
                  alternativaCorreta: {
                    type: Type.STRING,
                    description: 'Apenas uma letra maiúscula: A, B, C, D ou E',
                  },
                },
                required: ['questao', 'calculoCurto', 'alternativaCorreta'],
              },
            },
          },
        });

        if (response.text) {
          const questoes = JSON.parse(response.text) as Array<{
            questao: number;
            alternativaCorreta: string;
          }>;

          const gabaritoLimpo = questoes
            .sort((a, b) => a.questao - b.questao)
            .map((q) => `${q.questao} - ${q.alternativaCorreta.trim().toUpperCase()}`)
            .join('\n');

          return NextResponse.json({
            gabarito: gabaritoLimpo,
            modelo: modelo,
          });
        }
      } catch (err: any) {
        const status = err?.status || err?.code || 'timeout';
        erros.push(`${modelo}: ${status}`);
        // Se deu 429 (cota) ou 503 (pico), pula imediatamente para o próximo modelo da fila sem pausar
      }
    }

    return NextResponse.json(
      { error: `Todos os modelos falharam no momento (${erros.join(' | ')})` },
      { status: 503 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao processar PDF.' },
      { status: 500 }
    );
  }
}