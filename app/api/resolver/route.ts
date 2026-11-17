import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export const maxDuration = 60;

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(req: Request) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY não encontrada nas variáveis de ambiente da Vercel.' },
        { status: 500 }
      );
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'Nenhum PDF enviado.' }, { status: 400 });
    }

    // 1. Descobre dinamicamente os modelos válidos para a sua chave atual
    const pager = await ai.models.list();
    const disponiveis: string[] = [];
    for await (const m of pager) {
      const nome = m.name?.replace('models/', '') || '';
      if (
        nome.includes('gemini') &&
        !nome.includes('embedding') &&
        !nome.includes('imagen') &&
        !nome.includes('veo') &&
        !nome.includes('tts') &&
        !nome.includes('image')
      ) {
        disponiveis.push(nome);
      }
    }

    // Ordena priorizando versões flash estáveis (mais rápidas e maior cota gratuita)
    const prioridades = ['flash', 'pro'];
    const modelosOrdenados = disponiveis.sort((a, b) => {
      const scoreA = prioridades.findIndex((p) => a.includes(p));
      const scoreB = prioridades.findIndex((p) => b.includes(p));
      return (scoreA === -1 ? 99 : scoreA) - (scoreB === -1 ? 99 : scoreB);
    });

    if (modelosOrdenados.length === 0) {
      return NextResponse.json(
        { error: 'Nenhum modelo Gemini disponível para esta API Key.' },
        { status: 500 }
      );
    }

    const bytes = await file.arrayBuffer();
    const base64Pdf = Buffer.from(bytes).toString('base64');

    let ultimoErro = '';

    // 2. Testa os modelos reais da sua conta até o primeiro responder
    for (const modelo of modelosOrdenados.slice(0, 4)) {
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
            'Resolva todas as questões desta prova (incluindo gráficos e imagens) e retorne APENAS o gabarito final.',
          ],
          config: {
            temperature: 0.1,
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
        ultimoErro = `[${modelo}] ${err?.message || 'Erro desconhecido'}`;
      }
    }

    return NextResponse.json({ error: ultimoErro }, { status: 500 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao processar requisição.' },
      { status: 500 }
    );
  }
}