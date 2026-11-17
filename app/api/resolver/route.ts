import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { textoProva } = await req.json();

    if (!textoProva || textoProva.trim().length < 20) {
      return NextResponse.json(
        { error: 'Não foi possível ler o texto do PDF.' },
        { status: 400 }
      );
    }

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Você é um professor exato de matemática e lógica. Resolva cada questão da prova passo a passo internamente e retorne um JSON estrito no formato: {"respostas": [{"questao": 1, "calculo": "conta curta", "letra": "A"}]}.',
          },
          {
            role: 'user',
            content: `Resolva todas as questões abaixo:\n\n${textoProva}`,
          },
        ],
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { error: data?.error?.message || 'Erro na API da Groq' },
        { status: res.status }
      );
    }

    const conteudo = JSON.parse(data.choices[0].message.content);
    const lista = conteudo.respostas as Array<{ questao: number; letra: string }>;

    const gabarito = lista
      .sort((a, b) => a.questao - b.questao)
      .map((item) => `${item.questao} - ${item.letra.trim().toUpperCase()}`)
      .join('\n');

    return NextResponse.json({ gabarito });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Erro interno no servidor.' },
      { status: 500 }
    );
  }
}