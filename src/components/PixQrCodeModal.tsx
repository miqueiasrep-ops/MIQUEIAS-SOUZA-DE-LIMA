import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import {
  QrCode,
  Copy,
  Check,
  Printer,
  Download,
  X,
  DollarSign,
  MessageCircle,
  Sparkles,
  ShieldCheck
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { generatePixPayload } from '../utils/pix';
import { AssociationConfig, Associate } from '../types';

export const OFFICIAL_PIX_KEY = '8a0fa350-4511-4eab-a06f-6cc3bf44475c';

interface PixQrCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: AssociationConfig;
  associate?: Associate | null;
  initialAmount?: number;
  onOpenExtractor?: () => void;
}

export function PixQrCodeModal({
  isOpen,
  onClose,
  config,
  associate,
  initialAmount = 70,
  onOpenExtractor
}: PixQrCodeModalProps) {
  const defaultFee = associate?.monthlyFee || config.defaultMonthlyFee || 70;
  const [amount, setAmount] = useState<number>(initialAmount || defaultFee);
  const [copiedPayload, setCopiedPayload] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [customAmountStr, setCustomAmountStr] = useState<string>(
    initialAmount ? initialAmount.toString() : defaultFee.toString()
  );
  const qrRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const activePixKey = (config.pixKey && config.pixKey.trim()) || OFFICIAL_PIX_KEY;
  const merchantName = config.name || 'AIAPE PERNAMBUCO';
  const merchantCity = 'RECIFE';

  const hasConfigCopiaCola = Boolean(config.pixCopiaCola && config.pixCopiaCola.trim().startsWith('000201'));

  const pixPayload = hasConfigCopiaCola && amount === defaultFee
    ? config.pixCopiaCola!.trim()
    : generatePixPayload({
        pixKey: activePixKey,
        merchantName,
        merchantCity,
        amount: amount > 0 ? amount : undefined,
        description: associate ? `MENSALIDADE ${associate.name.slice(0, 15)}` : 'MENSALIDADE AIAPE',
        txid: associate?.registrationNumber ? associate.registrationNumber.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20) : '***'
      });

  const handleCopyPayload = () => {
    navigator.clipboard.writeText(pixPayload);
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 3000);
  };

  const handleCopyKey = () => {
    navigator.clipboard.writeText(activePixKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 3000);
  };

  const handleSelectPredefinedAmount = (val: number) => {
    setAmount(val);
    setCustomAmountStr(val.toString());
  };

  const handleCustomAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCustomAmountStr(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0) {
      setAmount(num);
    } else if (val === '') {
      setAmount(0);
    }
  };

  const handleDownloadQrPng = () => {
    try {
      const svg = qrRef.current?.querySelector('svg');
      if (!svg) return;

      const svgData = new XMLSerializer().serializeToString(svg);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const blobURL = window.URL.createObjectURL(svgBlob);

      img.onload = () => {
        canvas.width = 1000;
        canvas.height = 1000;
        if (ctx) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, 1000, 1000);
          ctx.drawImage(img, 50, 50, 900, 900);
          
          const pngUrl = canvas.toDataURL('image/png');
          const downloadLink = document.createElement('a');
          downloadLink.href = pngUrl;
          downloadLink.download = `qrcode-pix-aiape-${amount > 0 ? `R$${amount.toFixed(0)}` : 'oficial'}.png`;
          document.body.appendChild(downloadLink);
          downloadLink.click();
          document.body.removeChild(downloadLink);
          window.URL.revokeObjectURL(blobURL);
        }
      };

      img.src = blobURL;
    } catch (e) {
      console.error('Erro ao baixar PNG do QR code:', e);
      alert('Não foi possível gerar a imagem. Você pode tirar um print ou copiar a chave PIX.');
    }
  };

  const handlePrintPoster = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Por favor, autorize pop-ups no navegador para imprimir a placa.');
      return;
    }

    const formattedAmount = amount > 0 
      ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount) 
      : 'Qualquer Valor';

    const svgHtml = qrRef.current?.querySelector('svg')?.outerHTML || '';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Placa Oficial de Pagamento PIX - AIAPE</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 15mm;
          }
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          }
          body {
            background-color: #f8fafc;
            color: #0f172a;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            padding: 20px;
          }
          .poster {
            width: 100%;
            max-width: 680px;
            background: #ffffff;
            border: 4px solid #1e3a8a;
            border-radius: 28px;
            padding: 36px;
            text-align: center;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
          }
          .header {
            border-bottom: 2px solid #e2e8f0;
            padding-bottom: 20px;
            margin-bottom: 24px;
          }
          .logo-badge {
            display: inline-block;
            background: #1e3a8a;
            color: #ffffff;
            font-size: 13px;
            font-weight: 800;
            padding: 6px 16px;
            border-radius: 9999px;
            letter-spacing: 1px;
            text-transform: uppercase;
            margin-bottom: 12px;
          }
          .title {
            font-size: 26px;
            font-weight: 900;
            color: #0f172a;
            line-height: 1.2;
            margin-bottom: 6px;
          }
          .subtitle {
            font-size: 14px;
            color: #475569;
            font-weight: 500;
          }
          .amount-tag {
            background: #ecfdf5;
            border: 2px solid #10b981;
            color: #065f46;
            display: inline-block;
            padding: 10px 24px;
            border-radius: 16px;
            font-size: 28px;
            font-weight: 900;
            margin: 16px 0;
          }
          .amount-label {
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: #047857;
            font-weight: 700;
            display: block;
          }
          .qr-wrapper {
            background: #ffffff;
            border: 2px solid #e2e8f0;
            border-radius: 20px;
            padding: 20px;
            display: inline-block;
            margin: 10px auto;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
          }
          .qr-wrapper svg {
            width: 260px;
            height: 260px;
            display: block;
          }
          .key-box {
            background: #f1f5f9;
            border: 1px dashed #64748b;
            border-radius: 12px;
            padding: 12px 16px;
            margin: 16px auto;
            max-width: 500px;
          }
          .key-label {
            font-size: 11px;
            font-weight: 800;
            color: #475569;
            text-transform: uppercase;
          }
          .key-val {
            font-size: 15px;
            font-weight: 800;
            font-family: monospace;
            color: #0f172a;
            margin-top: 4px;
            word-break: break-all;
          }
          .instructions {
            text-align: left;
            background: #f8fafc;
            border-radius: 14px;
            padding: 16px;
            margin-top: 20px;
            font-size: 12px;
            line-height: 1.5;
            color: #334155;
          }
          .instructions ol {
            margin-left: 20px;
          }
          .instructions li {
            margin-bottom: 4px;
          }
          .footer {
            margin-top: 20px;
            font-size: 11px;
            color: #64748b;
            border-top: 1px solid #e2e8f0;
            padding-top: 12px;
          }
          @media print {
            body {
              background: transparent;
              padding: 0;
            }
            .poster {
              box-shadow: none;
              border-width: 3px;
            }
          }
        </style>
      </head>
      <body>
        <div class="poster">
          <div class="header">
            <div class="logo-badge">PIX OFICIAL • BANCO CENTRAL DO BRASIL</div>
            <h1 class="title">PAGUE SUA MENSALIDADE AQUI</h1>
            <p class="subtitle">AIAPE - Associação dos Instrutores de Trânsito Autônomos de Pernambuco</p>
          </div>

          <div class="amount-tag">
            <span class="amount-label">VALOR DA CONTRIBUIÇÃO</span>
            ${formattedAmount}
          </div>

          <div>
            <div class="qr-wrapper">
              ${svgHtml}
            </div>
          </div>

          <div class="key-box">
            <div class="key-label">Chave PIX Oficial (Aleatória / EVP):</div>
            <div class="key-val">${activePixKey}</div>
          </div>

          <div class="instructions">
            <strong>Como Pagar:</strong>
            <ol>
              <li>Abra o aplicativo de qualquer banco (Mercado Pago, Nubank, Banco do Brasil, Itaú, etc.).</li>
              <li>Escolha a opção <strong>PIX</strong> e aponte a câmera para o <strong>QR Code</strong> acima.</li>
              <li>Confira o favorecido: <strong>${merchantName}</strong>.</li>
              <li>Confirme o pagamento e envie o comprovante para a diretoria da AIAPE.</li>
            </ol>
          </div>

          <div class="footer">
            Entidade Sem Fins Lucrativos • Recife/PE • Contato: (81) 98888-7777 • contato@aiape.org.br
          </div>
        </div>
        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleShareWhatsApp = () => {
    const formattedAmount = amount > 0 
      ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount) 
      : 'R$ 70,00';

    const message = 
      `💳 *PAGAMENTO VIA PIX - AIAPE PERNAMBUCO*\n\n` +
      `${associate ? `Olá, Instrutor(a) *${associate.name}*!\n\n` : ''}` +
      `Seguem os dados oficiais para quitação da contribuição associativa:\n\n` +
      `💰 *Valor:* ${formattedAmount}\n` +
      `🏛️ *Favorecido:* ${merchantName}\n` +
      `📍 *Cidade:* Recife - PE\n\n` +
      `🔑 *CHAVE PIX OFICIAL (Aleatória):*\n` +
      `\`${activePixKey}\`\n\n` +
      `📋 *CÓDIGO PIX COPIA E COLA:*\n` +
      `\`${pixPayload}\`\n\n` +
      `📱 *Como pagar no app do banco:*\n` +
      `1. Abra seu banco e escolha *Pix* > *Pix Copia e Cola* (ou *Chave Aleatória*)\n` +
      `2. Cole o código ou a chave acima\n` +
      `3. Confirme o pagamento e envie o comprovante por aqui para darmos a baixa imediata!\n\n` +
      `_AIAPE - Associação dos Instrutores de Trânsito de Pernambuco_`;

    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="bg-gradient-to-br from-slate-900 via-slate-950 to-blue-950 border border-blue-500/30 rounded-3xl max-w-xl w-full p-5 sm:p-7 shadow-2xl text-white space-y-6 my-auto"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-center text-emerald-400 shrink-0 shadow-lg">
              <QrCode className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                  PIX Banco Central
                </span>
                <span className="text-[11px] text-slate-400 font-mono">EMV QRCPS</span>
              </div>
              <h2 className="text-lg font-black text-white leading-tight mt-0.5">
                QR Code Oficial de Pagamento
              </h2>
              <p className="text-xs text-slate-300">
                {associate ? `Cobrança de: ${associate.name}` : 'Pague em qualquer instituição bancária instantaneamente'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Amount Selector Pills */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-300 font-semibold flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
              Selecione ou Digite o Valor da Cobrança:
            </span>
            <span className="text-emerald-400 font-black text-sm">
              R$ {amount.toFixed(2).replace('.', ',')}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => handleSelectPredefinedAmount(70)}
              className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all cursor-pointer text-center ${
                amount === 70
                  ? 'bg-emerald-600 text-white border-emerald-400 shadow-md shadow-emerald-600/30'
                  : 'bg-slate-900/80 text-slate-300 border-slate-800 hover:bg-slate-800'
              }`}
            >
              1 Mês: R$ 70
            </button>
            <button
              type="button"
              onClick={() => handleSelectPredefinedAmount(140)}
              className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all cursor-pointer text-center ${
                amount === 140
                  ? 'bg-emerald-600 text-white border-emerald-400 shadow-md shadow-emerald-600/30'
                  : 'bg-slate-900/80 text-slate-300 border-slate-800 hover:bg-slate-800'
              }`}
            >
              2 Meses: R$ 140
            </button>
            <button
              type="button"
              onClick={() => handleSelectPredefinedAmount(35)}
              className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all cursor-pointer text-center ${
                amount === 35
                  ? 'bg-emerald-600 text-white border-emerald-400 shadow-md shadow-emerald-600/30'
                  : 'bg-slate-900/80 text-slate-300 border-slate-800 hover:bg-slate-800'
              }`}
            >
              Meia: R$ 35
            </button>
            <div className="relative">
              <input
                type="number"
                step="1"
                min="0"
                value={customAmountStr}
                onChange={handleCustomAmountChange}
                placeholder="Outro"
                className="w-full h-full bg-slate-900 border border-slate-700 text-xs font-bold text-white px-2 py-2 rounded-xl text-center focus:outline-hidden focus:border-emerald-400"
                title="Digitar outro valor em R$"
              />
            </div>
          </div>
        </div>

        {/* Central Display: Visual QR Code Card */}
        <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-2xl text-slate-900 flex flex-col items-center justify-center space-y-3 relative group">
          {/* Logo Brand Header on Card */}
          <div className="flex items-center justify-between w-full border-b border-slate-100 pb-2">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider">
                PIX AIAPE PERNAMBUCO
              </span>
            </div>
            <div className="text-right">
              <span className="text-base font-black text-emerald-600 block leading-none">
                R$ {amount.toFixed(2).replace('.', ',')}
              </span>
            </div>
          </div>

          {/* QR Code Container */}
          <div 
            ref={qrRef}
            className="bg-white p-2.5 rounded-2xl border-2 border-slate-100 shadow-inner"
          >
            <QRCodeSVG
              value={pixPayload}
              size={210}
              level="M"
              includeMargin={true}
              bgColor="#FFFFFF"
              fgColor="#000000"
              className="rounded"
            />
          </div>

          <p className="text-[11px] font-semibold text-slate-500 text-center">
            Aponte a câmera do aplicativo do seu banco (Mercado Pago, Nubank, Caixa, Itaú, BB, etc.)
          </p>

          {/* Chave Aleatória PIX Box */}
          <div className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-2.5 text-left space-y-1">
            <div className="flex items-center justify-between text-[10px] text-slate-500 font-bold uppercase tracking-wider">
              <span>Chave PIX Oficial (EVP / Aleatória):</span>
              <span className="text-emerald-700 font-extrabold">Banco Central</span>
            </div>
            <div className="flex items-center justify-between gap-2 bg-white p-2 rounded-xl border border-slate-200">
              <span className="font-mono text-xs font-black text-slate-800 truncate select-all">
                {activePixKey}
              </span>
              <button
                type="button"
                onClick={handleCopyKey}
                className={`px-3 py-1.5 rounded-lg text-xs font-black shrink-0 flex items-center gap-1 transition-all cursor-pointer ${
                  copiedKey ? 'bg-emerald-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-white'
                }`}
              >
                {copiedKey ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedKey ? 'Copiada!' : 'Copiar'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Action Buttons: Copia e Cola, WhatsApp, Imprimir Placa, Baixar PNG */}
        <div className="space-y-3">
          {/* Main 1-Click Action: PIX Copia e Cola */}
          <button
            type="button"
            onClick={handleCopyPayload}
            className={`w-full py-3.5 px-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2.5 transition-all cursor-pointer shadow-xl ${
              copiedPayload
                ? 'bg-emerald-500 text-white shadow-emerald-500/30'
                : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-600/30'
            }`}
          >
            {copiedPayload ? (
              <>
                <Check className="w-5 h-5" />
                <span>Código PIX Copia e Cola Copiado com Sucesso!</span>
              </>
            ) : (
              <>
                <Copy className="w-5 h-5" />
                <span>Copiar Código PIX Copia e Cola</span>
              </>
            )}
          </button>

          {/* Secondary Actions Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={handleShareWhatsApp}
              className="flex items-center justify-center gap-2 px-3 py-2.5 bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-500/40 rounded-xl text-xs font-bold transition-all cursor-pointer"
              title="Compartilhar chave e instruções no WhatsApp"
            >
              <MessageCircle className="w-4 h-4 text-emerald-400" />
              <span>Enviar WhatsApp</span>
            </button>

            <button
              type="button"
              onClick={handlePrintPoster}
              className="flex items-center justify-center gap-2 px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
              title="Imprimir cartaz ou placa de balcão A4 para a sede ou autoescola"
            >
              <Printer className="w-4 h-4 text-blue-400" />
              <span>Imprimir Cartaz</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadQrPng}
              className="flex items-center justify-center gap-2 px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
              title="Baixar imagem PNG de alta resolução do QR Code"
            >
              <Download className="w-4 h-4 text-amber-400" />
              <span>Baixar Imagem PNG</span>
            </button>
          </div>
        </div>

        {/* Footer info & AI receipt extractor hook */}
        <div className="pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Favorecido: <strong>{merchantName}</strong> (Recife - PE)</span>
          </div>

          {onOpenExtractor && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenExtractor();
              }}
              className="text-purple-400 hover:text-purple-300 font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>Enviar Comprovante (IA)</span>
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
