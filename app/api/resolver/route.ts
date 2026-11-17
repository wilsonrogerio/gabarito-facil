import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export const maxDuration = 60;

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Tenta o mais rápido/estável primeiro e cai para os outros se houver pico de demanda
const MODELOS = [
  'gemini-3.8-flash-lite',
  'gemini-3.8-flash',
  'gemini-3.8-pro',
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

    for (const modelo of MODELOS) {
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
              'Analise todas as questões desta prova (incluindo gráficos e imagens) e retorne APENAS o gabarito final.',
            ],
            config: {
              temperature: 0.1,
              systemInstruction:
                'Você é um corretor de provas exato. Resolva cada questão internamente com rigor matemático e lógico, mas na sua resposta final escreva EXCLUSIVAMENTE o número da questão e a letra da alternativa correta, uma por linha, no formato exato: "1 - A". Não escreva explicações, introduções, saudações ou textos adicionais.',
            },
          });

          if (response.text) {
            return NextResponse.json({ gabarito: response.text });
          }
        } catch (err: any) {
          const status = err?.status || err?.code;
          if (status === 503 || status === 429) {
            await sleep(1000);
            continue;
          }
          if (status === 404) {
            break; // Pula imediatamente para o próximo modelo da lista
          }
        }
      }
    }

    return NextResponse.json({ retry: true }, { status: 503 });
  } catch {
    return NextResponse.json({ retry: true }, { status: 500 });
  }
}