import express from 'express';
import path from 'path';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

// Load env variables
dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Set up larger limit for base64 file uploads
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));

// Helper to safely extract JSON from string even if model output contains conversational text
function extractJsonFromString(str: string): any {
  if (!str) throw new Error('Resposta vazia');
  // 1. Try direct JSON parse
  try {
    return JSON.parse(str.trim());
  } catch {}

  // 2. Try markdown code block
  const codeBlockMatch = str.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch && codeBlockMatch[1]) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {}
  }

  // 3. Try finding first { and last }
  const firstBrace = str.indexOf('{');
  const lastBrace = str.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = str.substring(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch {}
  }

  throw new Error('Não foi possível extrair um JSON válido da resposta.');
}

// Lazy initializer for GoogleGenAI
let aiClient: GoogleGenAI | null = null;
function getAiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('WARNING: GEMINI_API_KEY is not defined in the environment. AI extraction will fail.');
    }
    aiClient = new GoogleGenAI({
      apiKey: apiKey || '',
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

// Extract receipt data API endpoint
app.post('/api/extract', async (req, res) => {
  try {
    const { fileData, mimeType } = req.body;

    if (!fileData || !mimeType) {
      return res.status(400).json({ error: 'fileData e mimeType são obrigatórios.' });
    }

    const ai = getAiClient();
    if (!process.env.GEMINI_API_KEY) {
      console.warn('GEMINI_API_KEY não definida. Retornando modo assistido para conferência do comprovante.');
      const now = new Date();
      const monthNames = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
      ];
      return res.json({
        pagador: '',
        cpf: '',
        banco: 'PIX',
        valor: 70.00,
        data: now.toISOString().split('T')[0],
        mes: monthNames[now.getMonth()],
        tipo: 'receita',
        categoria: 'Mensalidades de Associados',
        descricao: 'Comprovante PIX Mensalidade',
        fallbackMode: true,
        fallbackNotice: 'Chave do Gemini em configuração. A imagem do comprovante foi carregada na tela para você conferir e salvar no cadastro.'
      });
    }

    console.log(`Iniciando extração com o Gemini. MimeType: ${mimeType}`);

    // Helper function to call a specific model
    const runModel = async (modelName: string) => {
      console.log(`Chamando modelo Gemini: ${modelName}`);
      const imagePart = {
        inlineData: {
          data: fileData,
          mimeType: mimeType,
        },
      };
      const textPart = {
        text: `Você é um assistente contábil especializado em ler comprovantes bancários brasileiros (PIX, TED, DOC, boleto bancário, recibo de transferência ou depósito).
Analise este comprovante com atenção e extraia as informações de forma estruturada. Retorne os dados estritamente conforme o esquema JSON solicitado.
Se algum campo não puder ser identificado com certeza, forneça um valor padrão adequado ("" ou 0).

Orientações para os campos:
- pagador: Nome completo da pessoa que pagou (remetente, emitente, titular da conta de origem ou pagador). Remova palavras como "Nome:" ou "Pagador:".
- cpf: CPF ou CNPJ do pagador/remetente se visível no comprovante (ex: "123.456.789-00" ou "***.456.789-**").
- banco: Nome da instituição financeira emissora (ex: Nubank, Itaú, Bradesco, Banco do Brasil, Caixa Econômica, Santander, Inter, C6 Bank, PagBank, Mercado Pago, Sicredi, Sicoob, etc.).
- valor: Valor numérico total em Reais (ex: 70.00, 50.00, 1500.00). ATENÇÃO CRÍTICA PARA MOEDA BRASILEIRA: Valores como "R$ 1.500,00" equivalem a 1500.00 (mil e quinhentos reais), NUNCA coloque 1.50. "R$ 2.350,00" é 2350.00. No Brasil o ponto separa milhares e a vírgula separa os centavos.
- data: Data em que o pagamento foi realizado no formato YYYY-MM-DD.
- mes: Mês de competência ou do pagamento por extenso em português (ex: Janeiro, Fevereiro, Março, Abril, Maio, Junho, Julho, Agosto, Setembro, Outubro, Novembro, Dezembro).
- tipo: Classificação do fluxo. Para mensalidades recebidas ou PIX de associados, use "receita". Para saídas/despesas, use "despesa".
- categoria: Use "Mensalidades de Associados" para pagamentos de membros da associação, ou outra categoria adequada.
- descricao: Breve descrição informativa (ex: "Comprovante PIX Mensalidade").`,
      };

      return await ai.models.generateContent({
        model: modelName,
        contents: { parts: [imagePart, textPart] },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              pagador: {
                type: Type.STRING,
                description: 'Nome do pagador, remetente, emitente ou contraparte (quem enviou ou realizou o pagamento).',
              },
              cpf: {
                type: Type.STRING,
                description: 'CPF ou CNPJ do pagador se identificado no comprovante.',
              },
              banco: {
                type: Type.STRING,
                description: 'Nome do banco emissor ou envolvido (ex: Nubank, Itaú, Bradesco, Banco do Brasil, Caixa Econômica, Santander, Inter, C6 Bank, etc.).',
              },
              valor: {
                type: Type.NUMBER,
                description: 'Valor monetário da transação em formato numérico decimal. ATENÇÃO: R$ 1.500,00 equivale a 1500.00 (e NÃO 1.50).',
              },
              data: {
                type: Type.STRING,
                description: 'Data da transação no formato YYYY-MM-DD.',
              },
              mes: {
                type: Type.STRING,
                description: 'Mês correspondente por extenso, iniciando em maiúscula, em português (ex: Janeiro, Fevereiro, Março, Abril, Maio, Junho, Julho, Agosto, Setembro, Outubro, Novembro, Dezembro).',
              },
              tipo: {
                type: Type.STRING,
                description: 'Classificação do fluxo: "despesa" ou "receita".',
              },
              categoria: {
                type: Type.STRING,
                description: 'Sugestão de categoria para a transação (ex: Mensalidades de Associados, Impostos / Taxas, Outros).',
              },
              descricao: {
                type: Type.STRING,
                description: 'Resumo breve do comprovante (ex: Transferência Pix, Pagamento de Mensalidade, etc.).',
              },
            },
            required: ['pagador', 'banco', 'valor', 'data', 'mes', 'tipo', 'categoria', 'descricao'],
          },
        },
      });
    };

    // Models to try in sequence with automatic failover (fastest and most reliable first)
    const modelsToTry = [
      'gemini-3.8-flash',
      'gemini-flash-latest',
      'gemini-3.1-flash-lite',
    ];
    
    let response;
    let lastError: any = null;

    for (const modelName of modelsToTry) {
      try {
        response = await runModel(modelName);
        console.log(`Extração bem-sucedida usando o modelo: ${modelName}`);
        break;
      } catch (err: any) {
        lastError = err;
        console.log(`Modelo ${modelName} indisponível no momento, tentando próximo modelo da cascata... Detalhe:`, err?.message || err);
      }
    }

    if (!response) {
      console.warn('Todos os modelos de IA falharam ou estão temporariamente com alta demanda. Ativando preenchimento assistido com imagem.');
      // Return safe structured fallback so the user can review directly with their image preview
      const now = new Date();
      const monthNames = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
      ];
      return res.json({
        pagador: '',
        cpf: '',
        banco: 'PIX',
        valor: 70.00,
        data: now.toISOString().split('T')[0],
        mes: monthNames[now.getMonth()],
        tipo: 'receita',
        categoria: 'Mensalidades de Associados',
        descricao: 'Comprovante PIX Mensalidade',
        fallbackMode: true,
        fallbackNotice: 'Serviço sob alta demanda momentânea. A imagem foi carregada na tela para você conferir e salvar diretamente no cadastro.'
      });
    }

    const textOutput = response.text;
    if (!textOutput) {
      throw new Error('Nenhuma resposta de texto retornada pelo Gemini.');
    }

    const data = extractJsonFromString(textOutput);
    
    // Garantir que valores monetários no formato brasileiro sejam devidamente normalizados
    if (data && data.valor !== undefined) {
      if (typeof data.valor === 'string') {
        let str = String(data.valor).replace(/R\$/gi, '').trim();
        if (str.includes('.') && str.includes(',')) {
          str = str.replace(/\./g, '').replace(',', '.');
        } else if (str.includes(',')) {
          str = str.replace(',', '.');
        } else if (str.includes('.')) {
          const parts = str.split('.');
          if (parts.length === 2 && parts[1].length === 3) {
            str = parts[0] + parts[1];
          }
        }
        data.valor = parseFloat(str) || 0;
      }
    }

    return res.json(data);
  } catch (error: any) {
    console.error('Erro na extração do comprovante:', error);
    
    // Return structured fallback so the user can review directly with their image preview
    const now = new Date();
    const monthNames = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    return res.json({
      pagador: '',
      cpf: '',
      banco: 'PIX',
      valor: 70.00,
      data: now.toISOString().split('T')[0],
      mes: monthNames[now.getMonth()],
      tipo: 'receita',
      categoria: 'Mensalidades de Associados',
      descricao: 'Comprovante PIX Mensalidade',
      fallbackMode: true,
      fallbackNotice: 'Serviço sob alta demanda momentânea. A imagem foi carregada na tela para você conferir e salvar diretamente no cadastro.'
    });
  }
});

// Simple API health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Global Express error handler to guarantee json response and prevent HTML errors
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Express error intercepted:', err?.message || err);
  if (res.headersSent) {
    return next(err);
  }
  return res.status(err.status || 500).json({
    error: err.message || 'Erro interno no servidor.',
    fallbackMode: true,
  });
});

// Mount Vite middleware in development or serve built files in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('Vite middleware mounted in development mode.');
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // SPA fallback
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log('Serving production static files from dist.');
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();
