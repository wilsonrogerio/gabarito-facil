import { NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';

export const maxDuration = 60;

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'Nenhum PDF enviado.' }, { status: 400 });
    }

    // 1. Pega apenas modelos estáveis de texto/multimodal (exclui omni, exp, lite e preview com limit: 0)
    const pager = await ai.models.list();
    const estaveis: string[] = [];
    const fallbacks: string[] = [];

    for await (const m of pager) {
      const nome = m.name?.replace('models/', '') || '';
      if (
        !nome.includes('gemini') ||
        nome.includes('embedding') ||
        nome.includes('imagen') ||
        nome.includes('veo') ||
        nome.includes('tts') ||
        nome.includes('image') ||
        nome.includes('omni') ||
        nome.includes('robotics') ||
        nome.includes('computer-use')
      ) {
        continue;
      }

      if (!nome.includes('preview') && !nome.includes('exp') && !nome.includes('lite')) {
        estaveis.push(nome);
      } else if (!nome.includes('lite')) {
        fallbacks.push(nome);
      }
    }

    // Prioriza sempre 'pro' estável primeiro, depois 'flash' estável, depois fallbacks
    const ordenar = (lista: string[]) =>
      lista.sort((a, b) => {
        const pesoA = a.includes('pro') ? 0 : 1;
        const pesoB = b.includes('pro') ? 0 : 1;
        return pesoA - pesoB || b.localeCompare(a); // Versão mais recente primeiro
      });

    const filaModelos = [...ordenar(estaveis), ...ordenar(fallbacks)];

    const bytes = await file.arrayBuffer();
    const base64Pdf = Buffer.from(bytes).toString('base64');

    const erros: string[] = [];

    // 2. Percorre a fila completa até encontrar um modelo com cota > 0
    for (const modelo of filaModelos) {
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
                    description: 'Resolução matemática/lógica completa passo a passo antes de escolher a letra.',
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
        erros.push(`${modelo}: ${err?.status || err?.code || 'erro'}`);
      }
    }

    return NextResponse.json(
      { error: `Nenhum modelo aceitou a chamada. Tentados: ${erros.join(' | ')}` },
      { status: 500 }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro interno.' }, { status: 500 });
  }
}