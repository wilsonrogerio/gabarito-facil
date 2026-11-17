import { NextResponse } from 'next/server';

interface GroqModel {
  id: string;
}

interface RespostaQuestao {
  questao: number;
  letra: string;
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GROQ_API_KEY não configurada na Vercel (faça Redeploy após salvar).' },
        { status: 500 }
      );
    }

    const body = (await req.json()) as { textoProva?: string };
    const textoProva = body.textoProva;

    if (!textoProva || textoProva.trim().length < 20) {
      return NextResponse.json(
        { error: 'Texto do PDF vazio ou ilegível.' },
        { status: 400 }
      );
    }

    const headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };

    const modelsRes = await fetch('https://api.groq.com/openai/v1/models', { headers });
    const modelsData = (await modelsRes.json()) as {
      data?: GroqModel[];
      error?: { message?: string };
    };

    if (!modelsRes.ok || !Array.isArray(modelsData.data)) {
      return NextResponse.json(
        { error: modelsData?.error?.message || `Erro HTTP ${modelsRes.status} ao listar modelos.` },
        { status: modelsRes.status }
      );
    }

    const modelosTexto: string[] = modelsData.data
      .map((m: GroqModel) => m.id)
      .filter(
        (id: string) =>
          !id.includes('whisper') &&
          !id.includes('guard') &&
          !id.includes('tts') &&
          !id.includes('orpheus') &&
          !id.includes('playai') &&
          !id.includes('safeguard')
      );

    const prioridades = ['70b', 'llama-4', '120b', 'qwen', '32b', '27b', '8b'];
    const filaModelos = modelosTexto.sort((a: string, b: string) => {
      const idxA = prioridades.findIndex((p) => a.toLowerCase().includes(p));
      const idxB = prioridades.findIndex((p) => b.toLowerCase().includes(p));
      return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
    });

    const erros: string[] = [];

    for (const modelo of filaModelos.slice(0, 5)) {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: modelo,
          temperature: 0.1,
          messages: [
            {
              role: 'system',
              content:
                'Resolva cada questão da prova passo a passo e no final responda APENAS um JSON válido neste formato exato: {"respostas": [{"questao": 1, "calculo": "conta curta", "letra": "A"}]}',
            },
            {
              role: 'user',
              content: `Resolva todas as questões abaixo e entregue o JSON final:\n\n${textoProva}`,
            },
          ],
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        erros.push(`${modelo}: ${data?.error?.message || res.status}`);
        continue;
      }

      const rawContent: string = data?.choices?.[0]?.message?.content || '';
      // Remove tags <think>...</think> se o modelo usar raciocínio e extrai apenas o JSON
      const semThink = rawContent.replace(/<think>[\s\S]*?<\/think>/gi, '');
      const matchJson = semThink.match(/\{[\s\S]*\}/);

      if (matchJson) {
        try {
          const conteudo = JSON.parse(matchJson[0]) as { respostas?: RespostaQuestao[] };
          const lista = conteudo.respostas || [];

          if (lista.length > 0) {
            const gabarito = lista
              .sort((a: RespostaQuestao, b: RespostaQuestao) => a.questao - b.questao)
              .map((item: RespostaQuestao) => `${item.questao} - ${item.letra.trim().toUpperCase()}`)
              .join('\n');

            return NextResponse.json({ gabarito, modelo });
          }
        } catch {
          erros.push(`${modelo}: JSON inválido retornado`);
        }
      } else {
        erros.push(`${modelo}: resposta sem JSON`);
      }
    }

    return NextResponse.json(
      { error: erros.length > 0 ? erros.join(' | ') : 'Nenhum modelo retornou respostas.' },
      { status: 500 }
    );
  } catch (err: unknown) {
    const mensagem = err instanceof Error ? err.message : 'Erro interno inesperado.';
    return NextResponse.json({ error: mensagem }, { status: 500 });
  }
}