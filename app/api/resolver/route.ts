import { NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';

export const maxDuration = 60;

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Os 3 modelos que respondem na sua chave rodam juntos; o primeiro que vencer retorna
const MODELOS_PARALELOS = [
  'gemini-3.8-flash-lite',
  'gemini-3.8-flash',
  'gemini-3.7-flash',
];

async function tentarModelo(modelo: string, base64Pdf: string) {
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
      abortSignal: AbortSignal.timeout(25000), // Corta se travar por mais de 25s
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

  if (!response.text) {
    throw new Error(`${modelo}: resposta vazia`);
  }

  const questoes = JSON.parse(response.text) as Array<{
    questao: number;
    alternativaCorreta: string;
  }>;

  const gabaritoLimpo = questoes
    .sort((a, b) => a.questao - b.questao)
    .map((q) => `${q.questao} - ${q.alternativaCorreta.trim().toUpperCase()}`)
    .join('\n');

  return { gabarito: gabaritoLimpo, modelo };
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'Nenhum PDF enviado.' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const base64Pdf = Buffer.from(bytes).toString('base64');

    // Executa os 3 modelos simultaneamente e pega o primeiro que responder com sucesso
    const vencedor = await Promise.any(
      MODELOS_PARALELOS.map((modelo) => tentarModelo(modelo, base64Pdf))
    );

    return NextResponse.json(vencedor);
  } catch (err: any) {
    const detalhes = err?.errors
      ? err.errors.map((e: any) => e?.message || 'erro').join(' | ')
      : err?.message || 'Erro ao processar PDF';

    return NextResponse.json({ error: detalhes }, { status: 503 });
  }
}