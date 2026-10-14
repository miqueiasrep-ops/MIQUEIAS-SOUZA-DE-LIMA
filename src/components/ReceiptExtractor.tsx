import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  UploadCloud, 
  Sparkles, 
  FileText, 
  Check, 
  X, 
  AlertCircle, 
  Loader2,
  Calendar,
  DollarSign,
  Building2,
  User,
  Tag,
  ArrowRight,
  UserCheck,
  CheckCircle2,
  AlertTriangle,
  Eye,
  Maximize2,
  ZoomIn,
  UserPlus,
  ArrowUpRight,
  Users,
  Camera,
  RefreshCw
} from 'lucide-react';
import { 
  ExtractionResult, 
  Transaction, 
  Associate, 
  MONTH_NAMES, 
  CATEGORIES, 
  BANKS, 
  TransactionType, 
  TransactionStatus 
} from '../types';
import { parseBrazilianCurrency, formatCurrencyBRL } from '../utils/currency';

export interface ReceiptExtractorProps {
  onAddTransaction: (transaction: Omit<Transaction, 'id' | 'createdAt'>) => void;
  associates?: Associate[];
  onRegisterPayment?: (
    associate: Associate, 
    month: string, 
    value: number, 
    date: string, 
    bank: string, 
    attachmentUrl?: string, 
    attachmentName?: string
  ) => void;
  onAddAssociate?: (associate: Omit<Associate, 'id'>) => Promise<Associate> | void;
  onOpenAddModalWithData?: (prefill: {
    name?: string;
    monthlyFee?: number;
    document?: string;
    date?: string;
    notes?: string;
  }) => void;
  onGoToAssociates?: () => void;
  onCloseModal?: () => void;
}

// Client-side image downscaling to prevent timeouts and payload limits
async function downscaleImageIfNeeded(
  file: File, 
  maxDimension = 1100, 
  quality = 0.70
): Promise<{ base64Data: string; mimeType: string; previewUrl: string }> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf') || file.type.includes('pdf');
  if (isPdf) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const full = reader.result as string;
        resolve({
          base64Data: full.includes(',') ? full.split(',')[1] : full,
          mimeType: 'application/pdf',
          previewUrl: full,
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const fullOriginal = (e.target?.result || reader.result) as string;
      const img = new Image();
      img.onload = () => {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        // Downscale large camera photos while keeping text crystal clear
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        try {
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, width, height);
            const jpegDataUrl = canvas.toDataURL('image/jpeg', quality);
            resolve({
              base64Data: jpegDataUrl.includes(',') ? jpegDataUrl.split(',')[1] : jpegDataUrl,
              mimeType: 'image/jpeg',
              previewUrl: jpegDataUrl,
            });
            return;
          }
        } catch (canvasErr) {
          console.warn('Canvas resize fallback:', canvasErr);
        }

        resolve({
          base64Data: fullOriginal.includes(',') ? fullOriginal.split(',')[1] : fullOriginal,
          mimeType: file.type || 'image/jpeg',
          previewUrl: fullOriginal,
        });
      };
      img.onerror = () => {
        resolve({
          base64Data: fullOriginal.includes(',') ? fullOriginal.split(',')[1] : fullOriginal,
          mimeType: file.type || 'image/jpeg',
          previewUrl: fullOriginal,
        });
      };
      img.src = fullOriginal;
    };
    reader.onerror = () => {
      resolve({
        base64Data: '',
        mimeType: file.type || 'image/jpeg',
        previewUrl: '',
      });
    };
    reader.readAsDataURL(file);
  });
}

function isPdfFile(url: string | null, f: File | null): boolean {
  if (url?.startsWith('data:application/pdf')) return true;
  if (f?.type === 'application/pdf') return true;
  if (f?.name?.toLowerCase().endsWith('.pdf')) return true;
  return false;
}

function isImageFile(url: string | null, f: File | null): boolean {
  if (isPdfFile(url, f)) return false;
  if (url?.startsWith('data:image/') || url?.startsWith('blob:')) return true;
  if (f?.type?.startsWith('image/')) return true;
  const ext = f?.name?.split('.').pop()?.toLowerCase();
  if (ext && ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic', 'heif'].includes(ext)) return true;
  return !!url;
}

export default function ReceiptExtractor({ 
  onAddTransaction,
  associates = [],
  onRegisterPayment,
  onAddAssociate,
  onOpenAddModalWithData,
  onGoToAssociates,
  onCloseModal
}: ReceiptExtractorProps) {
  const [file, setFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [isFullscreenImage, setIsFullscreenImage] = useState<boolean>(false);

  const [isDragActive, setIsDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<{
    title: string;
    message: string;
    associateName?: string;
    type: 'baixa' | 'novo_associado' | 'fluxo';
  } | null>(null);
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  
  // State for extracted data review
  const [isReviewing, setIsReviewing] = useState(false);
  const [editedData, setEditedData] = useState<ExtractionResult>({
    pagador: '',
    cpf: '',
    banco: '',
    valor: 70,
    data: '',
    mes: '',
    tipo: 'receita',
    categoria: 'Mensalidades de Associados',
    descricao: ''
  });
  const [paymentStatus, setPaymentStatus] = useState<TransactionStatus>('pago');

  // Associate Auto-Matching State
  const [selectedAssociateId, setSelectedAssociateId] = useState<string>('');
  const [autoDischarge, setAutoDischarge] = useState<boolean>(true);
  const [associateSearchFilter, setAssociateSearchFilter] = useState<string>('');
  const [isCreatingAssociate, setIsCreatingAssociate] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper function to match associate by name or document
  const findMatchingAssociate = (pagadorStr: string, descStr: string, cpfStr?: string): Associate | null => {
    if (!associates || associates.length === 0) return null;
    const combined = `${pagadorStr || ''} ${descStr || ''}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

    // 1. First priority: CPF match if available
    if (cpfStr) {
      const cleanExtractedCpf = cpfStr.replace(/\D/g, '');
      if (cleanExtractedCpf.length >= 6) {
        const foundByCpf = associates.find(a => {
          if (!a.document) return false;
          const cleanAssocDoc = a.document.replace(/\D/g, '');
          return cleanAssocDoc.includes(cleanExtractedCpf) || cleanExtractedCpf.includes(cleanAssocDoc);
        });
        if (foundByCpf) return foundByCpf;
      }
    }

    if (!combined) return null;

    // 2. Exact or substring name match
    for (const assoc of associates) {
      const cleanName = (assoc.name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      if (cleanName && (combined.includes(cleanName) || cleanName.includes(combined))) {
        return assoc;
      }
    }
    
    // 3. First and last name match
    for (const assoc of associates) {
      const cleanName = (assoc.name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      const parts = cleanName.split(' ').filter(p => p.length > 2);
      if (parts.length >= 2) {
        const firstName = parts[0];
        const lastName = parts[parts.length - 1];
        if (combined.includes(firstName) && combined.includes(lastName)) {
          return assoc;
        }
      }
    }

    // 4. Check associate's document in extracted text
    for (const assoc of associates) {
      if (assoc.document) {
        const cleanDoc = assoc.document.replace(/\D/g, '');
        if (cleanDoc && cleanDoc.length >= 6 && combined.replace(/\D/g, '').includes(cleanDoc)) {
          return assoc;
        }
      }
    }

    return null;
  };

  // Drag handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  // Process and extract receipt
  const processFile = async (selectedFile: File) => {
    let resolvedMime = selectedFile.type;
    if (!resolvedMime || resolvedMime === 'application/octet-stream') {
      const ext = selectedFile.name.split('.').pop()?.toLowerCase();
      if (ext === 'jpg' || ext === 'jpeg') resolvedMime = 'image/jpeg';
      else if (ext === 'png') resolvedMime = 'image/png';
      else if (ext === 'webp') resolvedMime = 'image/webp';
      else if (ext === 'pdf') resolvedMime = 'application/pdf';
      else resolvedMime = 'image/jpeg';
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!validTypes.includes(resolvedMime) && !selectedFile.type.startsWith('image/')) {
      setError('Formato não suportado. Por favor, envie uma foto (JPG, PNG, WEBP) ou documento PDF.');
      return;
    }

    setFile(selectedFile);
    setError(null);
    setSuccessNotice(null);
    setLoading(true);
    setIsReviewing(false);

    // Instant preview so the user sees the document immediately during processing
    try {
      const instantReader = new FileReader();
      instantReader.onload = () => {
        if (instantReader.result) {
          setFilePreviewUrl(instantReader.result as string);
        }
      };
      instantReader.readAsDataURL(selectedFile);
    } catch (e) {
      console.warn('Instant preview creation warning:', e);
    }

    try {
      // 1. Perform high-speed client-side image downscaling for photos
      const { base64Data, mimeType, previewUrl } = await downscaleImageIfNeeded(selectedFile);
      if (previewUrl) {
        setFilePreviewUrl(previewUrl);
      }

      // 2. Call server extraction endpoint
      let extractedData: any = null;
      try {
        const response = await fetch('/api/extract', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            fileData: base64Data,
            mimeType: mimeType,
          }),
        });

        const rawText = await response.text();
        if (response.ok && rawText) {
          try {
            extractedData = JSON.parse(rawText);
          } catch (parseErr) {
            console.warn('Resposta da API não é JSON válido:', rawText.slice(0, 100));
          }
        } else if (rawText) {
          try {
            const errBody = JSON.parse(rawText);
            console.warn('API de extração retornou código não-200:', response.status, errBody);
          } catch {
            console.warn('API retornou texto ou erro HTTP:', response.status, rawText.slice(0, 100));
          }
        }
      } catch (networkErr) {
        console.warn('Falha na chamada da extração:', networkErr);
      }

      // 3. Fallback normalization if AI is unavailable or under heavy load
      const now = new Date();
      const currentMonth = MONTH_NAMES[now.getMonth()];
      const todayDate = now.toISOString().split('T')[0];

      let sanitizedDate = extractedData?.data || todayDate;
      if (extractedData?.data && extractedData.data.includes('/')) {
        const parts = extractedData.data.split('/');
        if (parts.length === 3) {
          sanitizedDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
      }

      let capitalizedMonth: string = currentMonth;
      if (extractedData?.mes) {
        const foundMonth = MONTH_NAMES.find(m => m.toLowerCase() === extractedData.mes.toLowerCase().trim());
        if (foundMonth) {
          capitalizedMonth = foundMonth;
        } else {
          const dateObj = new Date((sanitizedDate || todayDate) + 'T12:00:00');
          if (!isNaN(dateObj.getTime())) {
            capitalizedMonth = MONTH_NAMES[dateObj.getMonth()];
          }
        }
      }

      const transType: TransactionType = extractedData?.tipo === 'despesa' ? 'despesa' : 'receita';
      const matchedCategory = CATEGORIES.find(c => c.toLowerCase() === extractedData?.categoria?.toLowerCase()?.trim()) || 'Mensalidades de Associados';

      const finalExtraction: ExtractionResult = {
        pagador: (extractedData?.pagador || '').trim(),
        cpf: (extractedData?.cpf || '').trim(),
        banco: (extractedData?.banco || 'PIX').trim(),
        valor: Number(extractedData?.valor) > 0 ? Number(extractedData.valor) : 70.00,
        data: sanitizedDate,
        mes: capitalizedMonth,
        tipo: transType,
        categoria: matchedCategory,
        descricao: extractedData?.descricao || 'Comprovante PIX Mensalidade',
        fallbackMode: extractedData?.fallbackMode,
        fallbackNotice: extractedData?.fallbackNotice
      };

      // 4. Try matching associate automatically in the database
      const matchedAssoc = findMatchingAssociate(finalExtraction.pagador, finalExtraction.descricao, finalExtraction.cpf);
      if (matchedAssoc) {
        setSelectedAssociateId(matchedAssoc.id);
        setAutoDischarge(true);
        finalExtraction.tipo = 'receita';
        finalExtraction.categoria = 'Mensalidades de Associados';
        finalExtraction.pagador = matchedAssoc.name;
        if (!finalExtraction.cpf && matchedAssoc.document) {
          finalExtraction.cpf = matchedAssoc.document;
        }
      } else {
        setSelectedAssociateId('');
        setAutoDischarge(false);
      }

      setEditedData(finalExtraction);
      setFallbackNotice(extractedData?.fallbackNotice || null);
      setIsReviewing(true);
    } catch (err: any) {
      console.error('Erro na leitura do comprovante:', err);
      // Even on failure, allow manual review with the loaded image
      handleStartManualReview();
      setError('A imagem foi carregada! Você pode conferir os valores diretamente e salvar no cadastro.');
    } finally {
      setLoading(false);
    }
  };

  const handleStartManualReview = () => {
    const now = new Date();
    const currentMonth = MONTH_NAMES[now.getMonth()];
    const dateStr = now.toISOString().split('T')[0];
    const fallbackData: ExtractionResult = {
      pagador: '',
      cpf: '',
      banco: 'PIX',
      valor: 70.00,
      data: dateStr,
      mes: currentMonth,
      tipo: 'receita',
      categoria: 'Mensalidades de Associados',
      descricao: 'Comprovante PIX Mensalidade'
    };
    setEditedData(fallbackData);
    setIsReviewing(true);
  };

  const handleFieldChange = (field: keyof ExtractionResult, value: any) => {
    setEditedData(prev => ({
      ...prev,
      [field]: field === 'valor' ? parseBrazilianCurrency(value) : value
    }));
  };

  const handleDateChange = (dateVal: string) => {
    const dateObj = new Date(dateVal + 'T12:00:00');
    if (!isNaN(dateObj.getTime())) {
      const computedMonth = MONTH_NAMES[dateObj.getMonth()];
      setEditedData(prev => ({
        ...prev,
        data: dateVal,
        mes: computedMonth
      }));
    } else {
      setEditedData(prev => ({
        ...prev,
        data: dateVal
      }));
    }
  };

  const handleAssociateSelectionChange = (assocId: string) => {
    setSelectedAssociateId(assocId);
    if (assocId) {
      const found = associates.find(a => a.id === assocId);
      if (found) {
        setEditedData(prev => ({
          ...prev,
          pagador: found.name,
          cpf: found.document || prev.cpf,
          tipo: 'receita',
          categoria: 'Mensalidades de Associados'
        }));
        setAutoDischarge(true);
      }
    } else {
      setAutoDischarge(false);
    }
  };

  // ACTION 1: Dar baixa no Cadastro de um Associado existente
  const handleSaveDischargeForExisting = () => {
    const selectedAssoc = associates.find(a => a.id === selectedAssociateId);
    if (!selectedAssoc) return;

    try {
      if (onRegisterPayment) {
        onRegisterPayment(
          selectedAssoc,
          editedData.mes,
          editedData.valor || selectedAssoc.monthlyFee || 70,
          editedData.data,
          editedData.banco,
          filePreviewUrl || undefined,
          file?.name
        );
      }

      setSuccessNotice({
        title: '🎉 BAIXA DE MENSALIDADE EFETUADA COM SUCESSO!',
        message: `O cadastro do associado ${selectedAssoc.name} foi atualizado para status ATIVO.\nMensalidade de ${editedData.mes} (R$ ${Number(editedData.valor || 0).toFixed(2)}) quitada com comprovante arquivado no sistema.`,
        associateName: selectedAssoc.name,
        type: 'baixa'
      });
      setIsReviewing(false);
    } catch (err: any) {
      console.error('Erro ao registrar baixa:', err);
      setError('Erro ao registrar baixa: ' + (err?.message || 'Tente novamente.'));
    }
  };

  // ACTION 2: Enviar diretamente para O CADASTRO (Criar novo associado com os dados do comprovante)
  const handleSendDirectlyToCadastro = async () => {
    setIsCreatingAssociate(true);
    const assocName = (editedData.pagador || 'Associado Cadastrado via PIX').trim();
    const feeValue = Number(editedData.valor) > 0 ? Number(editedData.valor) : 70;

    const newAssociateData: Omit<Associate, 'id'> = {
      name: assocName,
      document: editedData.cpf || '',
      email: '',
      phone: '',
      address: '',
      category: 'Membro Efetivo',
      status: 'ativo',
      monthlyFee: feeValue,
      dueDay: 30,
      membershipDate: editedData.data || new Date().toISOString().split('T')[0],
      birthDate: '',
      password: '',
      photoUrl: '',
      senatranCredential: '',
      cnhCategory: 'AB',
      registrationNumber: `AIAPE-${Math.floor(1000 + Math.random() * 9000)}`,
      validityDate: 'DEZ/2026',
      lastPaymentDate: editedData.data,
      lastPaymentMonth: editedData.mes,
      notes: `Cadastrado automaticamente via Extrator de Comprovante Bancário (${editedData.banco || 'PIX'}).`
    };

    try {
      if (onAddAssociate) {
        await onAddAssociate(newAssociateData);
      }

      // Also register transaction in cash flow
      onAddTransaction({
        date: editedData.data,
        month: editedData.mes,
        payer: assocName,
        bank: editedData.banco || 'PIX',
        value: feeValue,
        type: 'receita',
        category: 'Mensalidades de Associados',
        description: `Mensalidade ${editedData.mes} - ${assocName} (Novo Cadastro)`,
        status: 'pago',
        attachmentName: file?.name || 'Comprovante_PIX.png',
        attachmentType: file?.type || 'image/png',
        attachmentUrl: filePreviewUrl || undefined
      });

      setSuccessNotice({
        title: '🎉 NOVO ASSOCIADO ENVIADO PARA O CADASTRO COM SUCESSO!',
        message: `O associado ${assocName} agora consta na lista oficial de associados ativos da AIAPE com mensalidade de ${editedData.mes} quitada e comprovante salvo.`,
        associateName: assocName,
        type: 'novo_associado'
      });
      setIsReviewing(false);
    } catch (err: any) {
      console.error('Erro ao enviar para o cadastro:', err);
      setError('Erro ao salvar no cadastro: ' + (err.message || 'Tente novamente.'));
    } finally {
      setIsCreatingAssociate(false);
    }
  };

  // ACTION 3: Abrir formulário completo de cadastro preenchido
  const handleOpenFullCadastroForm = () => {
    if (onOpenAddModalWithData) {
      onOpenAddModalWithData({
        name: editedData.pagador || '',
        monthlyFee: Number(editedData.valor) > 0 ? Number(editedData.valor) : 70,
        document: editedData.cpf || '',
        date: editedData.data || new Date().toISOString().split('T')[0],
        notes: `Cadastrado a partir de Comprovante ${editedData.banco || 'PIX'} (${editedData.mes})`
      });
      if (onCloseModal) {
        onCloseModal();
      }
    }
  };

  // ACTION 4: Lançar apenas no Fluxo de Caixa (sem associado)
  const handleSaveToCashFlowOnly = () => {
    try {
      onAddTransaction({
        date: editedData.data,
        month: editedData.mes,
        payer: editedData.pagador || 'Sem Identificação',
        bank: editedData.banco || 'Outros',
        value: Number(editedData.valor) || 0,
        type: editedData.tipo,
        category: editedData.categoria,
        description: editedData.descricao || 'Importado via Comprovante',
        status: paymentStatus,
        attachmentName: file?.name,
        attachmentType: file?.type,
        attachmentUrl: filePreviewUrl || undefined,
        associateId: selectedAssociateId || undefined
      });

      setSuccessNotice({
        title: '✅ LANÇAMENTO REGISTRADO NO FLUXO DE CAIXA',
        message: `Transação de R$ ${Number(editedData.valor || 0).toFixed(2)} (${editedData.categoria}) registrada com comprovante anexado.`,
        type: 'fluxo'
      });
      setIsReviewing(false);
    } catch (err: any) {
      console.error('Erro ao salvar no fluxo de caixa:', err);
      setError('Erro ao salvar no fluxo de caixa: ' + (err?.message || 'Tente novamente.'));
    }
  };

  const resetUploader = () => {
    setFile(null);
    setFilePreviewUrl(null);
    setIsReviewing(false);
    setLoading(false);
    setIsFullscreenImage(false);
    setSelectedAssociateId('');
    setError(null);
    setSuccessNotice(null);
    setFallbackNotice(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const currentMatchedAssoc = associates.find(a => a.id === selectedAssociateId);

  // Filtered associates for quick search dropdown
  const filteredAssociatesList = associates.filter(a => {
    if (!associateSearchFilter) return true;
    const term = associateSearchFilter.toLowerCase();
    return (
      (a.name || '').toLowerCase().includes(term) ||
      (a.document || '').replace(/\D/g, '').includes(term.replace(/\D/g, ''))
    );
  });

  return (
    <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-5 overflow-hidden space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-600" />
            Extrator Inteligente de Comprovantes & Envio para o Cadastro
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Lê comprovantes PIX/bancários e permite dar baixa na mensalidade ou cadastrar um novo associado com 1 clique.
          </p>
        </div>
        {file && (
          <button 
            type="button"
            onClick={resetUploader}
            className="text-xs text-slate-400 hover:text-rose-500 font-semibold transition-colors cursor-pointer"
          >
            Limpar
          </button>
        )}
      </div>

      {/* Success Notification Alert Banner */}
      {successNotice && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-emerald-50 border border-emerald-300 rounded-2xl p-5 flex flex-col sm:flex-row items-start justify-between gap-4 text-emerald-950 text-xs shadow-md"
        >
          <div className="flex items-start gap-3">
            <div className="p-2 bg-emerald-500 text-white rounded-xl shadow-xs shrink-0 mt-0.5">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <p className="font-extrabold text-sm text-emerald-900">{successNotice.title}</p>
              <p className="whitespace-pre-line leading-relaxed text-emerald-800">{successNotice.message}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto shrink-0 pt-2 sm:pt-0">
            {onGoToAssociates && (
              <button
                type="button"
                onClick={() => {
                  setSuccessNotice(null);
                  if (onCloseModal) onCloseModal();
                  onGoToAssociates();
                }}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer text-xs"
              >
                <Users className="w-4 h-4" />
                <span>Ver no Cadastro</span>
              </button>
            )}

            <button
              type="button"
              onClick={resetUploader}
              className="px-3 py-2 bg-white border border-emerald-300 hover:bg-emerald-100/50 text-emerald-900 font-bold rounded-xl transition-all cursor-pointer text-xs"
            >
              Ler Outro Comprovante
            </button>
          </div>
        </motion.div>
      )}

      <AnimatePresence mode="wait">
        {/* Upload State */}
        {!isReviewing && !loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[220px] ${
                isDragActive 
                  ? 'border-purple-500 bg-purple-50/60 scale-[0.99]' 
                  : 'border-slate-200 hover:border-purple-400 hover:bg-slate-50/50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/png, image/jpeg, image/webp, application/pdf"
                onChange={handleFileChange}
              />
              <div className="p-4 bg-purple-100 text-purple-600 rounded-2xl mb-3 shadow-xs">
                <UploadCloud className="w-8 h-8" />
              </div>
              <p className="text-sm font-bold text-slate-800">
                Arraste o comprovante PIX ou clique para <span className="text-purple-600 underline">selecionar imagem ou PDF</span>
              </p>
              <p className="text-xs text-slate-500 mt-1 max-w-md">
                A foto é redimensionada automaticamente sem perder qualidade, extraída com IA e pode ser enviada diretamente para o cadastro.
              </p>

              <div className="flex items-center gap-4 mt-4 text-[11px] font-semibold text-slate-500">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> PIX & Ted
                </span>
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Otimização para Celular
                </span>
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Baixa Imediata
                </span>
              </div>
            </div>

            {error && (
              <div className="bg-rose-50 border border-rose-200 p-4 rounded-2xl flex flex-col gap-3 text-xs text-rose-800 shadow-xs">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-bold text-sm text-rose-900">Aviso</p>
                    <p className="opacity-90 mt-0.5">{error}</p>
                  </div>
                </div>

                {filePreviewUrl && (
                  <div className="pt-2 border-t border-rose-200/80 flex flex-col sm:flex-row items-center justify-between gap-2">
                    <span className="text-[11px] text-rose-700">
                      O arquivo foi recebido. Você pode conferir a imagem e preencher os dados diretamente:
                    </span>
                    <button
                      type="button"
                      onClick={handleStartManualReview}
                      className="w-full sm:w-auto px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer shrink-0"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Conferir & Enviar ao Cadastro</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* Loading Spinner */}
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-10 relative overflow-hidden"
          >
            <div className="w-32 h-40 bg-slate-100 border-2 border-purple-300 rounded-2xl p-2 flex flex-col justify-between mb-4 relative shadow-lg overflow-hidden">
              {filePreviewUrl ? (
                isPdfFile(filePreviewUrl, file) ? (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-purple-50 text-purple-700 rounded-xl p-2">
                    <FileText className="w-10 h-10 text-purple-600 mb-1" />
                    <span className="text-[10px] font-bold text-center">Documento PDF</span>
                  </div>
                ) : (
                  <img src={filePreviewUrl} alt="Comprovante" className="w-full h-full object-contain rounded-lg" />
                )
              ) : (
                <FileText className="w-10 h-10 text-purple-500 mx-auto mt-6" />
              )}
              <div className="text-[10px] text-center text-slate-800 font-bold truncate font-mono bg-white/95 px-1 py-0.5 rounded shadow-xs mt-1">
                {file?.name || 'Comprovante'}
              </div>
              <motion.div 
                className="absolute left-0 right-0 h-1 bg-purple-500 shadow-[0_0_12px_3px_rgba(168,85,247,0.9)]"
                animate={{ 
                  top: ['5%', '92%', '5%']
                }}
                transition={{ 
                  duration: 1.6, 
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              />
            </div>

            <div className="flex items-center gap-2 mb-1.5">
              <Loader2 className="w-5 h-5 text-purple-600 animate-spin" />
              <p className="text-sm font-bold text-slate-900">Lendo Comprovante & Identificando Pagamento...</p>
            </div>
            <p className="text-xs text-slate-600 text-center max-w-[340px]">
              A IA está extraindo valor, pagador, banco, data e localizando o associado correspondente no cadastro.
            </p>
          </motion.div>
        )}

        {/* Review Screen */}
        {isReviewing && !loading && (
          <motion.div
            initial={{ opacity: 0, scale: 0.99 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            {fallbackNotice && (
              <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-xl text-xs flex items-center gap-2.5 shadow-xs">
                <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                <p>
                  <strong>Conferência Assistida:</strong> {fallbackNotice}
                </p>
              </div>
            )}

            {/* VISUAL RECEIPT IMAGE PREVIEW FOR CONFERÊNCIA */}
            <div className="bg-slate-900 rounded-2xl p-4 border border-slate-800 text-white shadow-xl overflow-hidden">
              <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-2.5 mb-3 gap-2">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-purple-400" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-purple-300">
                    Visualização do Comprovante Original
                  </h4>
                </div>
                {filePreviewUrl && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsFullscreenImage(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs"
                      title="Abrir em tela cheia"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                      <span>Ampliar Comprovante</span>
                    </button>
                    {isPdfFile(filePreviewUrl, file) && (
                      <a
                        href={filePreviewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition-all cursor-pointer"
                        title="Abrir PDF em nova aba"
                      >
                        <ArrowUpRight className="w-3.5 h-3.5 text-purple-400" />
                        <span>Abrir PDF</span>
                      </a>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                {/* Visual Receipt Preview Container */}
                <div className="lg:col-span-5 bg-slate-950/90 rounded-2xl p-3 border-2 border-slate-800 flex flex-col items-center justify-center min-h-[260px] relative group">
                  {filePreviewUrl ? (
                    isPdfFile(filePreviewUrl, file) ? (
                      <div className="w-full flex flex-col items-center gap-2">
                        <iframe
                          src={filePreviewUrl}
                          title="Visualização do Comprovante PDF"
                          className="w-full h-64 sm:h-72 rounded-xl border border-slate-700 bg-white"
                        />
                        <div className="flex items-center justify-between w-full text-[11px] text-slate-400 px-1">
                          <span className="truncate max-w-[200px]">{file?.name || 'Comprovante.pdf'}</span>
                          <button
                            type="button"
                            onClick={() => setIsFullscreenImage(true)}
                            className="text-purple-400 hover:text-purple-300 font-bold underline cursor-pointer"
                          >
                            Expandir PDF
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div 
                        onClick={() => setIsFullscreenImage(true)}
                        className="relative cursor-pointer overflow-hidden rounded-xl w-full h-64 sm:h-72 group-hover:opacity-95 transition-all flex items-center justify-center bg-slate-900 border border-slate-800"
                        title="Clique para ver o comprovante em tamanho grande"
                      >
                        <img 
                          src={filePreviewUrl} 
                          alt="Comprovante de Pagamento" 
                          className="w-full h-full object-contain p-1"
                        />
                        <div className="absolute inset-0 bg-slate-950/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-bold transition-opacity gap-1.5 backdrop-blur-[1px]">
                          <Maximize2 className="w-4 h-4 text-purple-400" />
                          <span>Clique para Ampliar / Zoom</span>
                        </div>
                      </div>
                    )
                  ) : (
                    <div className="text-center py-10 px-4">
                      <FileText className="w-12 h-12 text-purple-400 mx-auto mb-2 opacity-80" />
                      <p className="text-xs font-bold text-slate-200">{file?.name || 'Comprovante Carregado'}</p>
                      <p className="text-[10px] text-slate-400 mt-1">Carregando visualização...</p>
                    </div>
                  )}

                  <div className="flex items-center justify-between w-full mt-2 text-[10px] font-mono text-slate-400 px-1">
                    <span className="truncate max-w-[220px]">{file?.name}</span>
                    <span>{(file?.size ? (file.size / 1024).toFixed(0) : 0)} KB</span>
                  </div>
                </div>

                {/* Direct Comparison Badges & Data */}
                <div className="lg:col-span-7 space-y-3 bg-slate-800/70 p-4 rounded-2xl border border-slate-700 text-xs">
                  <div className="flex items-center justify-between border-b border-slate-700/80 pb-2">
                    <span className="text-emerald-400 font-bold flex items-center gap-1.5 text-xs">
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                      Dados Extraídos Automaticamente pela IA:
                    </span>
                    <span className="text-xs font-mono bg-emerald-500/20 text-emerald-300 px-2.5 py-1 rounded-lg font-black border border-emerald-500/30">
                      R$ {Number(editedData.valor || 0).toFixed(2)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs text-slate-300 pt-1">
                    <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                      <span className="text-slate-400 block text-[10px] font-medium">Nome no Comprovante:</span>
                      <strong className="text-white text-xs font-bold block truncate">{editedData.pagador || 'Não informado'}</strong>
                    </div>
                    <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                      <span className="text-slate-400 block text-[10px] font-medium">CPF / Documento:</span>
                      <strong className="text-purple-300 font-mono text-xs font-bold block">{editedData.cpf || 'Não identificado'}</strong>
                    </div>
                    <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                      <span className="text-slate-400 block text-[10px] font-medium">Data / Mês Referência:</span>
                      <strong className="text-white text-xs font-bold block">{editedData.data} ({editedData.mes})</strong>
                    </div>
                    <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                      <span className="text-slate-400 block text-[10px] font-medium">Banco / Instituição:</span>
                      <strong className="text-white text-xs font-bold block">{editedData.banco || 'PIX'}</strong>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-400 pt-1 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    <span>Confira a visualização do comprovante ao lado e ajuste qualquer campo no formulário abaixo se necessário.</span>
                  </p>
                </div>
              </div>
            </div>

            {/* ASSOCIATE IDENTIFICATION CARD & DISPATCH TO CADASTRO */}
            <div className={`p-4 rounded-2xl border transition-all ${
              currentMatchedAssoc 
                ? 'bg-blue-50/90 border-blue-200 text-blue-950 shadow-sm'
                : 'bg-amber-50/90 border-amber-200 text-amber-950 shadow-sm'
            }`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className={`p-2.5 rounded-xl font-bold shrink-0 ${
                    currentMatchedAssoc ? 'bg-blue-600 text-white' : 'bg-amber-500 text-white'
                  }`}>
                    {currentMatchedAssoc ? <UserCheck className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                      {currentMatchedAssoc ? '✨ Associado Localizado no Cadastro' : '⚠️ Pagador Não Cadastrado / Novo Associado'}
                    </h4>
                    
                    {currentMatchedAssoc ? (
                      <div className="mt-1">
                        <p className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                          {currentMatchedAssoc.name}
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                            currentMatchedAssoc.status === 'ativo' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}>
                            Status Atual: {currentMatchedAssoc.status}
                          </span>
                        </p>
                        <p className="text-xs text-slate-600 mt-0.5">
                          {currentMatchedAssoc.category} • CPF: {currentMatchedAssoc.document || 'Não informado'} • Mensalidade cadastrada: <strong>R$ {currentMatchedAssoc.monthlyFee.toFixed(2)}</strong>
                        </p>
                      </div>
                    ) : (
                      <div className="mt-1 space-y-1">
                        <p className="text-xs text-slate-800">
                          O depositante <strong className="text-slate-950 font-bold">{editedData.pagador || 'identificado no comprovante'}</strong> ainda não possui cadastro ou o nome difere do registro.
                        </p>
                        <p className="text-[11px] text-amber-900 font-semibold">
                          👉 Você pode <strong>Enviar para o Cadastro</strong> agora mesmo ou vincular a um membro existente abaixo.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Quick Action Selector or Linker */}
              <div className="mt-3 pt-3 border-t border-slate-200/80 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                  <div>
                    <label className="block text-xs font-bold text-slate-900 mb-1 flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-purple-600" />
                      Vincular a Associado Existente:
                    </label>
                    <select
                      value={selectedAssociateId}
                      onChange={(e) => handleAssociateSelectionChange(e.target.value)}
                      style={{ color: '#020617', backgroundColor: '#ffffff' }}
                      className="w-full bg-white border-2 border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-950 font-bold focus:outline-hidden focus:border-purple-600 focus:ring-2 focus:ring-purple-100 shadow-xs"
                    >
                      <option value="" style={{ color: '#020617', backgroundColor: '#ffffff' }} className="text-slate-800 font-semibold">-- Não vincular (Novo associado ou receita genérica) --</option>
                      {associates.map((assoc) => (
                        <option key={assoc.id} value={assoc.id} style={{ color: '#020617', backgroundColor: '#ffffff' }} className="text-slate-950 font-semibold">
                          {assoc.name} {assoc.document ? `(${assoc.document})` : ''} - [{assoc.status.toUpperCase()}]
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedAssociateId ? (
                    <div className="flex items-center gap-2 pt-1 sm:pt-4">
                      <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-purple-900 bg-white/90 p-2.5 rounded-xl border border-purple-200 w-full shadow-xs">
                        <input
                          type="checkbox"
                          checked={autoDischarge}
                          onChange={(e) => setAutoDischarge(e.target.checked)}
                          className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500 cursor-pointer"
                        />
                        <span>Atualizar status para ATIVO e quitar mensalidade ({editedData.mes})</span>
                      </label>
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1 sm:pt-4">
                      <button
                        type="button"
                        onClick={handleSendDirectlyToCadastro}
                        disabled={isCreatingAssociate}
                        className="flex-1 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-xs rounded-xl shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                      >
                        {isCreatingAssociate ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <UserPlus className="w-4 h-4" />
                        )}
                        <span>➕ Enviar para O CADASTRO (Novo Associado)</span>
                      </button>

                      {onOpenAddModalWithData && (
                        <button
                          type="button"
                          onClick={handleOpenFullCadastroForm}
                          className="px-3 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer text-center"
                          title="Abrir formulário completo para preencher telefone, CNH e endereço"
                        >
                          Ficha Completa
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* FORM FIELDS FOR VERIFICATION & EDITING */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs bg-slate-100/90 p-4 rounded-2xl border-2 border-slate-200 shadow-xs">
              {/* Pagador */}
              <div className="col-span-1 sm:col-span-2">
                <label className="block text-xs font-bold text-slate-900 mb-1 flex items-center gap-1.5">
                  <User className="w-4 h-4 text-purple-600" />
                  Nome do Pagador / Titular do Comprovante
                </label>
                <input
                  type="text"
                  value={editedData.pagador}
                  onChange={(e) => handleFieldChange('pagador', e.target.value)}
                  style={{ color: '#020617', backgroundColor: '#ffffff' }}
                  className="w-full px-3.5 py-2.5 border-2 border-slate-300 rounded-xl bg-white focus:outline-hidden focus:border-purple-600 focus:ring-2 focus:ring-purple-100 transition-colors text-sm font-bold text-slate-950 placeholder:text-slate-500 shadow-xs"
                  placeholder="Nome completo no comprovante"
                />
              </div>

              {/* CPF / Documento */}
              <div>
                <label className="block text-xs font-bold text-slate-900 mb-1 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-purple-600" />
                  CPF do Pagador (se visível no comprovante)
                </label>
                <input
                  type="text"
                  value={editedData.cpf || ''}
                  onChange={(e) => handleFieldChange('cpf', e.target.value)}
                  style={{ color: '#020617', backgroundColor: '#ffffff' }}
                  className="w-full px-3.5 py-2.5 border-2 border-slate-300 rounded-xl bg-white focus:outline-hidden focus:border-purple-600 focus:ring-2 focus:ring-purple-100 transition-colors text-sm font-mono font-bold text-slate-950 placeholder:text-slate-500 shadow-xs"
                  placeholder="000.000.000-00"
                />
              </div>

              {/* Valor */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4 text-emerald-600" />
                    Valor Pago (R$)
                  </label>
                  {editedData.valor > 0 && (
                    <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100/90 border border-emerald-300 px-2 py-0.5 rounded-md">
                      {formatCurrencyBRL(editedData.valor)}
                    </span>
                  )}
                </div>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-slate-900 font-black font-mono text-sm">R$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editedData.valor || ''}
                    onChange={(e) => handleFieldChange('valor', e.target.value)}
                    style={{ color: '#020617', backgroundColor: '#ffffff' }}
                    className="w-full pl-10 pr-3.5 py-2.5 border-2 border-slate-300 rounded-xl bg-white focus:outline-hidden focus:border-purple-600 focus:ring-2 focus:ring-purple-100 transition-colors font-mono font-black text-slate-950 text-sm shadow-xs"
                    placeholder="70,00 ou 1.500,00"
                  />
                </div>
              </div>

              {/* Banco */}
              <div>
                <label className="block text-xs font-bold text-slate-900 mb-1 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-purple-600" />
                  Banco / Instituição
                </label>
                <select
                  value={editedData.banco}
                  onChange={(e) => handleFieldChange('banco', e.target.value)}
                  style={{ color: '#020617', backgroundColor: '#ffffff' }}
                  className="w-full px-3.5 py-2.5 border-2 border-slate-300 rounded-xl bg-white focus:outline-hidden focus:border-purple-600 focus:ring-2 focus:ring-purple-100 transition-colors text-sm font-bold text-slate-950 shadow-xs"
                >
                  {BANKS.map((b) => (
                    <option key={b} value={b} style={{ color: '#020617', backgroundColor: '#ffffff' }} className="text-slate-950 font-semibold">{b}</option>
                  ))}
                  {!BANKS.includes(editedData.banco as any) && (
                    <option value={editedData.banco} style={{ color: '#020617', backgroundColor: '#ffffff' }} className="text-slate-950 font-semibold">{editedData.banco}</option>
                  )}
                </select>
              </div>

              {/* Data da Transação */}
              <div>
                <label className="block text-xs font-bold text-slate-900 mb-1 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-purple-600" />
                  Data da Transação
                </label>
                <input
                  type="date"
                  value={editedData.data}
                  onChange={(e) => handleDateChange(e.target.value)}
                  style={{ color: '#020617', backgroundColor: '#ffffff' }}
                  className="w-full px-3.5 py-2.5 border-2 border-slate-300 rounded-xl bg-white focus:outline-hidden focus:border-purple-600 focus:ring-2 focus:ring-purple-100 transition-colors text-sm font-bold text-slate-950 shadow-xs"
                />
              </div>

              {/* Mês de Referência */}
              <div>
                <label className="block text-xs font-bold text-slate-900 mb-1 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-purple-600" />
                  Mês de Referência da Mensalidade
                </label>
                <select
                  value={editedData.mes}
                  onChange={(e) => handleFieldChange('mes', e.target.value)}
                  style={{ color: '#020617', backgroundColor: '#ffffff' }}
                  className="w-full px-3.5 py-2.5 border-2 border-purple-400 rounded-xl bg-white focus:outline-hidden focus:border-purple-600 focus:ring-2 focus:ring-purple-100 transition-colors text-sm font-black text-slate-950 shadow-xs cursor-pointer"
                >
                  {MONTH_NAMES.map((m) => (
                    <option key={m} value={m} style={{ color: '#020617', backgroundColor: '#ffffff' }} className="text-slate-950 font-bold bg-white">{m}</option>
                  ))}
                </select>
              </div>

              {/* Categoria */}
              <div>
                <label className="block text-xs font-bold text-slate-900 mb-1 flex items-center gap-1.5">
                  <Tag className="w-4 h-4 text-purple-600" />
                  Categoria Financeira
                </label>
                <select
                  value={editedData.categoria}
                  onChange={(e) => handleFieldChange('categoria', e.target.value)}
                  style={{ color: '#020617', backgroundColor: '#ffffff' }}
                  className="w-full px-3.5 py-2.5 border-2 border-slate-300 rounded-xl bg-white focus:outline-hidden focus:border-purple-600 focus:ring-2 focus:ring-purple-100 transition-colors text-sm font-bold text-slate-950 shadow-xs"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c} style={{ color: '#020617', backgroundColor: '#ffffff' }} className="text-slate-950 font-semibold">{c}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* ACTION BUTTONS FOOTER */}
            <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2.5">
              <button
                type="button"
                onClick={resetUploader}
                className="px-4 py-2.5 border border-slate-300 rounded-xl hover:bg-slate-50 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
              >
                Cancelar
              </button>

              <div className="flex flex-wrap items-center gap-2">
                {selectedAssociateId ? (
                  <button
                    type="button"
                    onClick={handleSaveDischargeForExisting}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs flex items-center gap-2 transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Dar Baixa no Cadastro de {currentMatchedAssoc?.name || 'Associado'}</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleSaveToCashFlowOnly}
                      className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-bold text-xs transition-all cursor-pointer"
                    >
                      Salvar Apenas no Fluxo de Caixa
                    </button>

                    <button
                      type="button"
                      onClick={handleSendDirectlyToCadastro}
                      disabled={isCreatingAssociate}
                      className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white rounded-xl font-extrabold text-xs flex items-center gap-2 transition-all shadow-md cursor-pointer disabled:opacity-50"
                    >
                      {isCreatingAssociate ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <UserPlus className="w-4 h-4" />
                      )}
                      <span>Enviar para O CADASTRO (Novo Associado)</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FULLSCREEN RECEIPT IMAGE MODAL */}
      <AnimatePresence>
        {isFullscreenImage && filePreviewUrl && (
          <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl relative"
            >
              <div className="p-4 bg-slate-800 border-b border-slate-700 flex items-center justify-between text-white">
                <div className="flex items-center gap-2">
                  <Eye className="w-5 h-5 text-purple-400" />
                  <div>
                    <h3 className="font-bold text-sm">Visualização do Comprovante Original</h3>
                    <p className="text-[11px] text-slate-400">{file?.name}</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsFullscreenImage(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 p-4 sm:p-6 overflow-auto bg-slate-950 flex items-center justify-center min-h-[300px]">
                {isPdfFile(filePreviewUrl, file) ? (
                  <iframe
                    src={filePreviewUrl}
                    title="Visualização Completa do Comprovante PDF"
                    className="w-full h-[75vh] rounded-2xl border border-slate-800 bg-white shadow-2xl"
                  />
                ) : (
                  <img
                    src={filePreviewUrl}
                    alt="Comprovante de pagamento"
                    className="max-w-full max-h-[75vh] object-contain rounded-2xl shadow-2xl border border-slate-800 bg-slate-900"
                  />
                )}
              </div>

              <div className="p-4 bg-slate-800 border-t border-slate-700 flex items-center justify-between text-xs text-slate-300">
                <span>Comprovante anexado para auditoria e prestação de contas</span>
                <button
                  onClick={() => setIsFullscreenImage(false)}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl transition-all cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
