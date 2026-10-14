/**
 * Utilitários para tratamento e conversão robusta de valores monetários no padrão brasileiro (BRL).
 * 
 * Resolve casos em que "1.500,00" ou "1.500" era interpretado erroneamente como "1,50"
 * pelo JavaScript nativo (devido à separação de milhares por ponto e decimais por vírgula).
 */

/**
 * Converte qualquer entrada (string formatada com moeda brasileira, texto com pontos/vírgulas ou número)
 * de forma 100% segura para um número decimal em JavaScript.
 *
 * Exemplos:
 * "1.500,00" -> 1500
 * "1.500"    -> 1500 (reconhece ponto como separador de milhar)
 * "1500,00"  -> 1500
 * "1500.00"  -> 1500
 * "1500"     -> 1500
 * "1,50"     -> 1.50
 * "1.50"     -> 1.50
 * "R$ 1.500,00" -> 1500
 * 1500       -> 1500
 */
export function parseBrazilianCurrency(input: string | number | null | undefined): number {
  if (input === null || input === undefined || input === '') return 0;
  if (typeof input === 'number') {
    return isNaN(input) ? 0 : input;
  }

  let str = String(input).trim();
  // Remove prefixos como "R$", espaços em branco
  str = str.replace(/R\$/gi, '').replace(/\s+/g, '');

  if (!str) return 0;

  // Se contiver tanto ponto quanto vírgula (ex: "1.500,00" ou "1,500.00")
  if (str.includes('.') && str.includes(',')) {
    const lastDot = str.lastIndexOf('.');
    const lastComma = str.lastIndexOf(',');
    if (lastComma > lastDot) {
      // Padrão brasileiro: "1.500,00" -> remove pontos e troca vírgula por ponto
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      // Padrão internacional: "1,500.00" -> remove vírgulas
      str = str.replace(/,/g, '');
    }
  } else if (str.includes(',')) {
    // Apenas vírgula: "1500,00" ou "1,50" -> troca por ponto
    str = str.replace(',', '.');
  } else if (str.includes('.')) {
    // Apenas ponto: "1.500" ou "1.500.000" ou "1500.00"
    const parts = str.split('.');
    if (parts.length > 2) {
      // Ex: "1.500.000" -> separador de milhar
      str = str.replace(/\./g, '');
    } else if (parts.length === 2) {
      // Se tiver exatamente 3 dígitos após o ponto (ex: "1.500", "2.000", "10.000"),
      // na moeda brasileira é separador de milhar!
      if (parts[1].length === 3) {
        str = parts[0] + parts[1];
      }
      // Se tiver 1 ou 2 dígitos (ex: "1.5" ou "1.50"), mantém como decimal
    }
  }

  // Remove qualquer caractere inválido restante exceto dígitos, ponto e hífen
  str = str.replace(/[^0-9.-]/g, '');

  const val = parseFloat(str);
  return isNaN(val) ? 0 : val;
}

/**
 * Formata um valor numérico para exibição em moeda brasileira (BRL).
 * Exemplo: 1500 -> "R$ 1.500,00" (ou "1.500,00" sem símbolo)
 */
export function formatCurrencyBRL(value: number, withSymbol = true): string {
  const formatted = (value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return withSymbol ? `R$ ${formatted}` : formatted;
}
