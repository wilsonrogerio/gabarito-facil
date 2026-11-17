import { NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';

export const maxDuration = 60;

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Apenas modelos que existem na sua chave e não têm limit:0
const MODELOS_ATIVOS = [
  'gemini-3.8-flash',
  'gemini-3.8-flash-lite',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-4-hydrogen',
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

    for (const modelo of MODELOS_ATIVOS) {
      // Tenta até 2 vezes com pausa para vencer o pico de 503
      for (let tentativa = 1; tentativa <= 2; tentativa++) {
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
              'Resolva cada questão desta prova com atenção máxima aos cálculos, sinais, gráficos e alternativas.',
            ],
            config: {
              temperature: 0.1,
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.ARRAY,
                description: 'Lista ordenada das questões resolvidas',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    questao: { type: Type.INTEGER },
                    raciocinio: {
                      type: Type.STRING,
                      description: 'Resolução matemática/lógica passo a passo antes de escolher a letra.',
                    },
                    alternativaCorreta: {
                      type: Type.STRING,
                      description: 'Apenas uma letra maiúscula: A, B, C, D ou E',
                    },
                  },
                  required: ['questao', 'raciocinio', 'alternativaCorreta'],
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
          const status = err?.status || err?.code || 'erro';
          erros.push(`${modelo}(t${tentativa}): ${status}`);

          if (status === 503 || status === 429) {
            await sleep(1500);
            continue;
          }
          break; // Se for 404, pula direto para o próximo modelo
        }
      }
    }

    return NextResponse.json(
      { error: `Pico de demanda no Google. Log: ${erros.join(' | ')}` },
      { status: 503 }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro interno.' }, { status: 500 });
  }
}