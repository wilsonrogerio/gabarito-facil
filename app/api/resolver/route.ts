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

    // Busca modelos disponíveis evitando versões "lite" (fracas em matemática)
    const pager = await ai.models.list();
    const disponiveis: string[] = [];
    for await (const m of pager) {
      const nome = m.name?.replace('models/', '') || '';
      if (
        nome.includes('gemini') &&
        !nome.includes('lite') &&
        !nome.includes('embedding') &&
        !nome.includes('imagen') &&
        !nome.includes('veo') &&
        !nome.includes('tts') &&
        !nome.includes('image')
      ) {
        disponiveis.push(nome);
      }
    }

    // Prioriza modelos mais fortes em matemática/lógica
    const ordemPreferencia = ['2.5-pro', '3.1-pro', '3-flash', '2.5-flash', 'pro', 'flash'];
    const modelosOrdenados = disponiveis.sort((a, b) => {
      const idxA = ordemPreferencia.findIndex((p) => a.includes(p));
      const idxB = ordemPreferencia.findIndex((p) => b.includes(p));
      return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
    });

    const bytes = await file.arrayBuffer();
    const base64Pdf = Buffer.from(bytes).toString('base64');

    let ultimoErro = '';

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

          // Formata limpo para a tela: "1 - B"
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
        ultimoErro = `[${modelo}] ${err?.message || 'Erro'}`;
      }
    }

    return NextResponse.json({ error: ultimoErro }, { status: 500 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro interno.' }, { status: 500 });
  }
}