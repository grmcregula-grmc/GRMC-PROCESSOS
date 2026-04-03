"use client";

import React, { useState, useCallback, useMemo, useEffect, Component, ReactNode, ErrorInfo } from 'react';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
import localforage from 'localforage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { UploadCloud, Plus, Trash2, FileText, Download, Save, CheckCircle, Layers, Search, Edit, BarChart3, List, FileUp, ChevronLeft, ChevronRight, Brain, MessageSquare, Send, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { GoogleGenAI, Type } from '@google/genai';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, AreaChart, Area, Legend 
} from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getSupabase } from '@/lib/supabase';
import { User, PostgrestError, RealtimeChannel } from '@supabase/supabase-js';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface SupabaseErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
  }
}

function handleSupabaseError(error: PostgrestError | Error | { message: string } | unknown, operationType: OperationType, path: string | null, user: User | null) {
  const message = (error as { message?: string })?.message || String(error);
  const errInfo: SupabaseErrorInfo = {
    error: message,
    authInfo: {
      userId: user?.id,
      email: user?.email,
    },
    operationType,
    path
  }
  console.error('Supabase Error: ', JSON.stringify(errInfo));
  toast.error(`Erro no banco de dados: ${errInfo.error}`);
}

async function testConnection() {
  try {
    const supabase = getSupabase();
    const { error } = await supabase.from('processes').select('id').limit(1);
    if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows returned" which is fine
       // If it's a connection error, it will likely be different
    }
  } catch (error) {
    console.error("Supabase connection test failed:", error);
    // Don't show toast for connection failure if it's just missing config
    if (error instanceof Error && (error.message.includes('NEXT_PUBLIC_SUPABASE_URL') || error.message.includes('NEXT_PUBLIC_SUPABASE_ANON_KEY'))) {
      console.warn("Supabase configuration missing.");
    } else {
      toast.error("Erro de conexão com o Supabase. Verifique sua configuração.");
    }
  }
}

interface ExtractedData {
  id: string;
  files: File[];
  fileUrls?: string[];
  data: Record<string, string>;
  status: 'pending' | 'processing' | 'success' | 'error';
  error?: string;
}

const DEFAULT_COLUMNS = [
  'Nº E-DOC', 'ASSUNTO', 'REMETENTE', 'DATA DE RECEBIMENTO',
  'DOCUMENTOS DE ENTRADA - TIPO', 'DOCUMENTOS DE ENTRADA - LINK',
  'PRAZOS - INTERNO', 'PRAZOS - EXTERNO',
  'TRÂMITES GRMC - AÇÃO', 'TRÂMITES GRMC - DATA', 'TRÂMITES GRMC - ACOMPANHAMENTO',
  'SEQUÊNCIA DE TRÂMITES (UNIDADES)',
  'DOCUMENTOS GERADOS - TIPO', 'DOCUMENTOS GERADOS - LINK',
  'SITUAÇÃO - STATUS', 'SITUAÇÃO - DATA FINAL', 'SITUAÇÃO - DESCRIÇÃO FINAL'
];

const EXTRACTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    'Nº E-DOC': { type: Type.STRING },
    'ASSUNTO': { type: Type.STRING },
    'REMETENTE': { type: Type.STRING },
    'DATA DE RECEBIMENTO': { type: Type.STRING },
    'DOCUMENTOS DE ENTRADA - TIPO': { type: Type.STRING },
    'DOCUMENTOS DE ENTRADA - LINK': { type: Type.STRING },
    'PRAZOS - INTERNO': { type: Type.STRING },
    'PRAZOS - EXTERNO': { type: Type.STRING },
    'TRÂMITES GRMC - AÇÃO': { type: Type.STRING },
    'TRÂMITES GRMC - DATA': { type: Type.STRING },
    'TRÂMITES GRMC - ACOMPANHAMENTO': { type: Type.STRING },
    'SEQUÊNCIA DE TRÂMITES (UNIDADES)': { type: Type.STRING },
    'DOCUMENTOS GERADOS - TIPO': { type: Type.STRING },
    'DOCUMENTOS GERADOS - LINK': { type: Type.STRING },
    'SITUAÇÃO - STATUS': { type: Type.STRING },
    'SITUAÇÃO - DATA FINAL': { type: Type.STRING },
    'SITUAÇÃO - DESCRIÇÃO FINAL': { type: Type.STRING }
  },
  required: [
    'Nº E-DOC', 'ASSUNTO', 'REMETENTE', 'DATA DE RECEBIMENTO',
    'DOCUMENTOS DE ENTRADA - TIPO', 'DOCUMENTOS DE ENTRADA - LINK',
    'PRAZOS - INTERNO', 'PRAZOS - EXTERNO',
    'TRÂMITES GRMC - AÇÃO', 'TRÂMITES GRMC - DATA', 'TRÂMITES GRMC - ACOMPANHAMENTO',
    'SEQUÊNCIA DE TRÂMITES (UNIDADES)',
    'DOCUMENTOS GERADOS - TIPO', 'DOCUMENTOS GERADOS - LINK',
    'SITUAÇÃO - STATUS', 'SITUAÇÃO - DATA FINAL', 'SITUAÇÃO - DESCRIÇÃO FINAL'
  ],
};

const NORMATIVO_CATEGORIES = ['Contratos', 'Leis', 'Normas', 'Portarias', 'Notas Técnicas', 'Relatórios'];

const GRMC_CONTEXT = `O sistema atua como o 'Cérebro Digital' da GRMC (Gerência de Regulação e Monitoramento Contratual da Companhia de Saneamento de Sergipe - DESO). 
A GRMC é responsável pela gestão estratégica, regulação de contratos, acompanhamento de processos administrativos e conformidade normativa da DESO. 
As análises devem ser técnicas, profissionais, estratégicas e alinhadas aos objetivos de eficiência operacional e segurança jurídica da companhia.`;

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center min-h-screen flex flex-col items-center justify-center bg-slate-50">
          <Card className="w-full max-w-2xl">
            <CardHeader>
              <CardTitle className="text-2xl font-bold text-red-600">Algo deu errado</CardTitle>
              <CardDescription>Ocorreu um erro inesperado na aplicação.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-slate-100 p-4 rounded text-left overflow-auto max-h-64 mb-4 font-mono text-sm">
                {this.state.error?.message || String(this.state.error)}
              </div>
            </CardContent>
            <CardFooter className="flex justify-center">
              <Button onClick={() => window.location.reload()}>Recarregar Página</Button>
            </CardFooter>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function ExtratorApp() {
  return (
    <ErrorBoundary>
      <ExtratorAppContent />
    </ErrorBoundary>
  );
}

function ExtratorAppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authLoading, setAuthLoading] = useState(false);
  const [csvData, setCsvData] = useState<Record<string, string>[]>([]);
  const [columns, setColumns] = useState<string[]>(DEFAULT_COLUMNS);
  const [extractedFiles, setExtractedFiles] = useState<ExtractedData[]>([]);
  const [newColumnName, setNewColumnName] = useState('');
  const [isColumnDialogOpen, setIsColumnDialogOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ index: number } | null>(null);
  
  const [activeTab, setActiveTab] = useState<'extract' | 'table' | 'normativos' | 'dashboard' | 'dashboard_normativos' | 'reports'>('extract');
  const [extractionType, setExtractionType] = useState<'processo' | 'normativo'>('processo');
  
  // Normativos State
  const [normativosData, setNormativosData] = useState<Record<string, string>[]>([]);
  const [normativosColumns, setNormativosColumns] = useState<string[]>(['CATEGORIA', 'TÍTULO']);
  const [normativosFiles, setNormativosFiles] = useState<Record<string, File[]>>({});
  const [normativosDeletedRows, setNormativosDeletedRows] = useState<Record<string, string>[]>([]);
  const [normativosDeletedFiles, setNormativosDeletedFiles] = useState<Record<string, File[]>>({});
  const [normativosDeleteConfirmation, setNormativosDeleteConfirmation] = useState<{ index: number } | null>(null);
  const [isNormativosTrashDialogOpen, setIsNormativosTrashDialogOpen] = useState(false);
  const [isEmptyNormativosTrashConfirmationOpen, setIsEmptyNormativosTrashConfirmationOpen] = useState(false);
  
  const [normativosSummaries, setNormativosSummaries] = useState<Record<string, string>>({});
  const [isGeneratingNormativoSummary, setIsGeneratingNormativoSummary] = useState<Record<string, boolean>>({});
  const [generalNormativosSummary, setGeneralNormativosSummary] = useState<string | null>(null);
  const [isGeneratingGeneralNormativosSummary, setIsGeneratingGeneralNormativosSummary] = useState(false);
  const [combinedAnalysis, setCombinedAnalysis] = useState<string | null>(null);
  const [isGeneratingCombinedAnalysis, setIsGeneratingCombinedAnalysis] = useState(false);

  // Global Summaries & Custom Reports
  const [globalProcessSummary, setGlobalProcessSummary] = useState<string | null>(null);
  const [isGeneratingGlobalProcessSummary, setIsGeneratingGlobalProcessSummary] = useState(false);
  const [globalNormativoSummary, setGlobalNormativoSummary] = useState<string | null>(null);
  const [isGeneratingGlobalNormativoSummary, setIsGeneratingGlobalNormativoSummary] = useState(false);
  
  const [customReportPrompt, setCustomReportPrompt] = useState('');
  const [customReportResult, setCustomReportResult] = useState<string | null>(null);
  const [isGeneratingCustomReport, setIsGeneratingCustomReport] = useState(false);
  const [customReportType, setCustomReportType] = useState<'processo' | 'normativo' | 'combined'>('combined');

  const [processDynamicInsights, setProcessDynamicInsights] = useState<{label: string, value: string, color?: string}[]>([]);
  const [isGeneratingProcessInsights, setIsGeneratingProcessInsights] = useState(false);
  const [normativosDynamicInsights, setNormativosDynamicInsights] = useState<{label: string, value: string, color?: string}[]>([]);
  const [isGeneratingNormativosInsights, setIsGeneratingNormativosInsights] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    testConnection();
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const [searchTerm, setSearchTerm] = useState('');
  const [normativosSearchTerm, setNormativosSearchTerm] = useState('');
  
  const [isTrashDialogOpen, setIsTrashDialogOpen] = useState(false);
  const [isEmptyTrashConfirmationOpen, setIsEmptyTrashConfirmationOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{role: 'user' | 'assistant', content: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);
  const [editingRowData, setEditingRowData] = useState<Record<string, string>>({});
  const [isGeneratingGeneralSummary, setIsGeneratingGeneralSummary] = useState(false);
  const [generalSummary, setGeneralSummary] = useState<string | null>(null);
  const [summarySearchTerm, setSummarySearchTerm] = useState('');
  const [reportSubTab, setReportSubTab] = useState('reports_custom');
  const [selectedFilesForAnalysis, setSelectedFilesForAnalysis] = useState<{id: string, name: string, type: 'processo' | 'normativo', file: File}[]>([]);

  const emptyTrash = () => {
    setDeletedRows([]);
    setDeletedFiles({});
    setIsEmptyTrashConfirmationOpen(false);
    setIsTrashDialogOpen(false);
    toast.success("Lixeira de processos esvaziada.");
  };

  const emptyNormativosTrash = () => {
    setNormativosDeletedRows([]);
    setNormativosDeletedFiles({});
    setIsEmptyNormativosTrashConfirmationOpen(false);
    setIsNormativosTrashDialogOpen(false);
    toast.success("Lixeira de normativos esvaziada.");
  };

  const [processFiles, setProcessFiles] = useState<Record<string, File[]>>({});
  const [deletedFiles, setDeletedFiles] = useState<Record<string, File[]>>({});
  const [deletedRows, setDeletedRows] = useState<Record<string, string>[]>([]);
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const [isGeneratingSummary, setIsGeneratingSummary] = useState<Record<string, boolean>>({});
  const [duplicateResolution, setDuplicateResolution] = useState<{ extractionId: string, existingIndex: number } | null>(null);
  const [viewingFilesRowId, setViewingFilesRowId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let subscription: { unsubscribe: () => void } | null = null;
    
    try {
      const supabase = getSupabase();
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ?? null);
        setIsAuthReady(true);
      });
      subscription = data.subscription;
    } catch {
      console.warn("Supabase not configured, skipping auth listener.");
      setIsAuthReady(true); // Allow app to load even without Supabase
    }

    return () => subscription?.unsubscribe();
  }, []);

  const handleLogin = async () => {
    if (!authEmail || !authPassword) {
      toast.error('Preencha o e-mail e a senha.');
      return;
    }
    setAuthLoading(true);
    try {
      const supabase = getSupabase();
      const { error } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: authPassword,
      });
      if (error) throw error;
    } catch (error) {
      const msg = (error as Error).message;
      if (msg.includes('Invalid login credentials')) {
        toast.error('E-mail ou senha incorretos.');
      } else {
        toast.error(`Erro ao entrar: ${msg}`);
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!authEmail || !authPassword) {
      toast.error('Preencha o e-mail e a senha.');
      return;
    }
    if (authPassword.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    setAuthLoading(true);
    try {
      const supabase = getSupabase();
      const { error } = await supabase.auth.signUp({
        email: authEmail,
        password: authPassword,
      });
      if (error) throw error;
      toast.success('Conta criada! Verifique seu e-mail para confirmar o cadastro.');
      setAuthMode('login');
    } catch (error) {
      const msg = (error as Error).message;
      if (msg.includes('already registered')) {
        toast.error('Este e-mail já está cadastrado. Faça login.');
        setAuthMode('login');
      } else {
        toast.error(`Erro ao cadastrar: ${msg}`);
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      const supabase = getSupabase();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      toast.success('Logout realizado.');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const fetchProcesses = useCallback(async (currentUser: User) => {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('processes')
        .select('*')
        .eq('userId', currentUser.id);
      if (error) {
        handleSupabaseError(error, OperationType.LIST, 'processes', currentUser);
      } else {
        setCsvData(data.map(row => ({ ...row.data, _id: row.id, _fileUrls: row.fileUrls || [] })));
      }
    } catch (error) {
      console.error("Error fetching processes:", error);
    }
  }, []);

  const fetchNormativos = useCallback(async (currentUser: User) => {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('normativos')
        .select('*')
        .eq('userId', currentUser.id);
      if (error) {
        handleSupabaseError(error, OperationType.LIST, 'normativos', currentUser);
      } else {
        setNormativosData(data.map(row => ({ ...row.data, _id: row.id, _fileUrls: row.fileUrls || [] })));
      }
    } catch (error) {
      console.error("Error fetching normativos:", error);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setCsvData([]);
      setNormativosData([]);
      return;
    }

    let processesChannel: RealtimeChannel | null = null;
    let normativosChannel: RealtimeChannel | null = null;

    fetchProcesses(user);
    fetchNormativos(user);

    try {
      const supabase = getSupabase();
      processesChannel = supabase
        .channel('processes-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'processes' }, () => {
          fetchProcesses(user);
        })
        .subscribe();

      normativosChannel = supabase
        .channel('normativos-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'normativos' }, () => {
          fetchNormativos(user);
        })
        .subscribe();
    } catch {
      console.warn("Supabase real-time not available.");
    }

    return () => {
      if (processesChannel) getSupabase().removeChannel(processesChannel);
      if (normativosChannel) getSupabase().removeChannel(normativosChannel);
    };
  }, [user, refreshTrigger, fetchProcesses, fetchNormativos]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const storedCsv = await localforage.getItem<Record<string, string>[]>('grmc_csvData');
        const storedDeletedRows = await localforage.getItem<Record<string, string>[]>('grmc_deletedRows');
        const storedFiles = await localforage.getItem<Record<string, File[]>>('grmc_processFiles');
        const storedDeletedFiles = await localforage.getItem<Record<string, File[]>>('grmc_deletedFiles');
        const storedCols = await localforage.getItem<string[]>('grmc_columns');
        
        // Load Normativos Data
        const storedNormativosCsv = await localforage.getItem<Record<string, string>[]>('grmc_normativosData');
        const storedNormativosCols = await localforage.getItem<string[]>('grmc_normativosColumns');
        const storedNormativosFiles = await localforage.getItem<Record<string, File[]>>('grmc_normativosFiles');
        const storedNormativosDeletedRows = await localforage.getItem<Record<string, string>[]>('grmc_normativosDeletedRows');
        
        if (storedCsv) setCsvData(storedCsv);
        if (storedDeletedRows) setDeletedRows(storedDeletedRows);
        if (storedFiles) setProcessFiles(storedFiles);
        if (storedDeletedFiles) setDeletedFiles(storedDeletedFiles);
        if (storedCols) setColumns(storedCols);

        if (storedNormativosCsv) setNormativosData(storedNormativosCsv);
        if (storedNormativosCols) setNormativosColumns(storedNormativosCols);
        if (storedNormativosFiles) setNormativosFiles(storedNormativosFiles);
        if (storedNormativosDeletedRows) setNormativosDeletedRows(storedNormativosDeletedRows);
      } catch (error) {
        console.error("Erro ao carregar dados locais:", error);
      } finally {
        setIsLoaded(true);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    if (isLoaded) {
      localforage.setItem('grmc_csvData', csvData);
      localforage.setItem('grmc_deletedRows', deletedRows);
      localforage.setItem('grmc_normativosData', normativosData);
      localforage.setItem('grmc_normativosDeletedRows', normativosDeletedRows);
    }
  }, [csvData, deletedRows, normativosData, normativosDeletedRows, isLoaded]);

  useEffect(() => {
    if (isLoaded) {
      localforage.setItem('grmc_processFiles', processFiles);
      localforage.setItem('grmc_deletedFiles', deletedFiles);
      localforage.setItem('grmc_normativosFiles', normativosFiles);
    }
  }, [processFiles, deletedFiles, normativosFiles, isLoaded]);

  useEffect(() => {
    if (isLoaded) {
      localforage.setItem('grmc_columns', columns);
      localforage.setItem('grmc_normativosColumns', normativosColumns);
    }
  }, [columns, normativosColumns, isLoaded]);

  const handleCsvUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.meta.fields) {
            setColumns(results.meta.fields);
          }
          const cleanedData = (results.data as Record<string, string>[]).map(row => {
            const newRow: Record<string, string> = { _id: Math.random().toString(36).substring(7) };
            for (const key in row) {
              newRow[key] = (row[key] === 'null' || row[key] === null) ? '' : row[key];
            }
            return newRow;
          });
          setCsvData(cleanedData);
          toast.success('CSV carregado com sucesso!');
        },
        error: (error) => {
          toast.error(`Erro ao carregar CSV: ${error.message}`);
        }
      });
    }
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    
    // Check total size (Limit to 40MB to stay safe under 50MB limit)
    const totalSize = acceptedFiles.reduce((acc, file) => acc + file.size, 0);
    const MAX_SIZE = 40 * 1024 * 1024; // 40MB
    
    if (totalSize > MAX_SIZE) {
      toast.error(`O tamanho total dos arquivos (${(totalSize / 1024 / 1024).toFixed(1)}MB) excede o limite de 40MB. Por favor, envie arquivos menores ou em menor quantidade.`);
      return;
    }

    if (acceptedFiles.length > 9) {
      toast.error('Você pode enviar no máximo 9 arquivos por vez.');
      return;
    }

    const newExtraction: ExtractedData = {
      id: Math.random().toString(36).substring(7),
      files: acceptedFiles,
      data: {},
      status: 'processing'
    };

    setExtractedFiles(prev => [...prev, newExtraction]);

    try {
      const pdfParts = await Promise.all(acceptedFiles.map(async (file) => {
        const base64String = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = (reader.result as string).split(',')[1];
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        return {
          inlineData: {
            mimeType: 'application/pdf',
            data: base64String,
          },
        };
      }));

      const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('Chave da API do Gemini não configurada (NEXT_PUBLIC_GEMINI_API_KEY).');
      }

      const ai = new GoogleGenAI({ apiKey });

      const systemInstruction = extractionType === 'processo'
        ? `Você é um assistente de engenharia de dados especializado em controle de processos e gestão de contratos, com foco na GRMC (Gerência de Regulação e Monitoramento Contratual). Leia o documento principal e seus anexos (se houver) para extrair as informações solicitadas de forma consolidada. A análise dos trâmites deve focar na GRMC e em toda a tramitação e documentos gerados. Retorne APENAS um objeto JSON válido, sem formatação markdown. Se uma informação não for encontrada, retorne null.`
        : `Você é um assistente de engenharia de dados especializado em análise de normativos. 
           Sua tarefa é categorizar o documento em uma destas categorias: ${NORMATIVO_CATEGORIES.join(', ')} e definir a estrutura de colunas ideal para o controle deste documento específico.
           Identifique as informações mais relevantes e nomeie as colunas de forma técnica e profissional (ex: Número, Data de Publicação, Ementa, Órgão Emissor, Vigência, Partes, Valor, etc).
           Retorne APENAS um objeto JSON válido com as chaves sendo os nomes das colunas e os valores sendo os dados extraídos.
           O posicionamento das chaves no JSON deve refletir a ordem de importância.
           Inclua sempre as chaves 'CATEGORIA' e 'TÍTULO' como as primeiras. Não use formatação markdown.`;

      const textPart = {
        text: extractionType === 'processo' 
          ? 'Extraia as informações solicitadas a partir destes documentos (e-Doc principal e anexos).'
          : 'Analise este normativo, categorize-o e extraia as informações mais importantes para controle.',
      };

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: { parts: [...pdfParts, textPart] },
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          ...(extractionType === 'processo' ? { responseSchema: EXTRACTION_SCHEMA } : {}),
        },
      });

      const extractedData: Record<string, string> = {};
      try {
        const parsed = JSON.parse(response.text || '{}');
        for (const key in parsed) {
          extractedData[key] = (parsed[key] === 'null' || parsed[key] === null) ? '' : String(parsed[key] || '');
        }
      } catch {
        throw new Error('A IA não retornou um formato de dados válido. Tente novamente.');
      }

      setExtractedFiles(prev => prev.map(f => 
        f.id === newExtraction.id ? { ...f, data: extractedData, status: 'success' } : f
      ));
      toast.success(`Processo extraído com sucesso!`);
    } catch (error: unknown) {
      console.error('Gemini API Error:', error);
      const err = error as Error;
      let errMsg = err.message || 'Erro desconhecido na extração.';
      
      if (errMsg.includes('token count exceeds')) {
        errMsg = 'O documento é muito extenso ou complexo para a análise automática da IA (limite de tokens excedido).';
      } else if (errMsg.includes('API key not valid') || errMsg.includes('API_KEY_INVALID')) {
        errMsg = 'A chave da API do Gemini é inválida ou não foi configurada corretamente. Por favor, verifique a chave (NEXT_PUBLIC_GEMINI_API_KEY) no menu de configurações (Secrets) do AI Studio.';
      } else if (errMsg.includes('Unexpected token') || errMsg.includes('is not valid JSON') || errMsg.includes('503')) {
        errMsg = 'A API do Google Gemini está temporariamente indisponível ou sobrecarregada. Por favor, tente novamente em alguns instantes.';
      }
      
      setExtractedFiles(prev => prev.map(f => 
        f.id === newExtraction.id ? { ...f, status: 'error', error: errMsg } : f
      ));
      toast.error(`Falha ao processar: ${errMsg}`);
    }
  }, [extractionType]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 9
  });

  const handleDataChange = (id: string, field: string, value: string) => {
    setExtractedFiles(prev => prev.map(f => 
      f.id === id ? { ...f, data: { ...f.data, [field]: value } } : f
    ));
  };

  const handleAddColumn = () => {
    if (newColumnName && !columns.includes(newColumnName)) {
      setColumns([...columns, newColumnName]);
      setNewColumnName('');
      setIsColumnDialogOpen(false);
      toast.success(`Coluna "${newColumnName}" adicionada.`);
    }
  };

  const handleRenameColumn = (oldName: string, newName: string) => {
    if (newName && !columns.includes(newName)) {
      setColumns(columns.map(c => c === oldName ? newName : c));
      setExtractedFiles(prev => prev.map(f => {
        const newData = { ...f.data };
        if (newData[oldName] !== undefined) {
          newData[newName] = newData[oldName];
          delete newData[oldName];
        }
        return { ...f, data: newData };
      }));
      toast.success(`Coluna "${oldName}" renomeada para "${newName}".`);
    }
  };

  const handleMoveColumn = (index: number, direction: 'left' | 'right') => {
    const newColumns = [...columns];
    const targetIndex = direction === 'left' ? index - 1 : index + 1;
    if (targetIndex >= 0 && targetIndex < newColumns.length) {
      [newColumns[index], newColumns[targetIndex]] = [newColumns[targetIndex], newColumns[index]];
      setColumns(newColumns);
    }
  };

  const handleDeleteColumn = (colName: string) => {
    setColumns(columns.filter(c => c !== colName));
    toast.success(`Coluna "${colName}" removida.`);
  };

  const handleSaveToControl = (id: string) => {
    const fileData = extractedFiles.find(f => f.id === id);
    if (fileData && fileData.status === 'success') {
      const eDoc = fileData.data['Nº E-DOC'];
      const existingIndex = eDoc ? csvData.findIndex(row => row['Nº E-DOC'] === eDoc) : -1;

      if (existingIndex !== -1) {
        setDuplicateResolution({ extractionId: id, existingIndex });
      } else {
        saveExtractionToControl(id);
      }
    }
  };

  const handleAdvancedAnalysis = async (extractionId: string) => {
    const extraction = extractedFiles.find(f => f.id === extractionId);
    if (!extraction) return;

    setExtractedFiles(prev => prev.map(f => f.id === extractionId ? { ...f, status: 'processing' } : f));
    
    try {
      const pdfParts = await Promise.all(extraction.files.map(async (file) => {
        const base64String = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = (reader.result as string).split(',')[1];
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        return {
          inlineData: {
            mimeType: 'application/pdf',
            data: base64String,
          },
        };
      }));

      const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('Chave da API do Gemini não configurada (NEXT_PUBLIC_GEMINI_API_KEY).');
      }

      const ai = new GoogleGenAI({ apiKey });

      const systemInstruction = `Você é um assistente de engenharia de dados especializado em controle de processos e gestão de contratos, com foco na GRMC. Analise os documentos fornecidos e revise os dados extraídos abaixo. Corrija informações incorretas e preencha campos vazios se possível. Retorne APENAS um objeto JSON válido, sem formatação markdown. Se uma informação não for encontrada, mantenha o valor anterior.`;

      const textPart = {
        text: `Revise os dados extraídos abaixo a partir dos documentos fornecidos. Dados atuais: ${JSON.stringify(extraction.data).substring(0, 10000)}`,
      };

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: { parts: [...pdfParts, textPart] },
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: EXTRACTION_SCHEMA,
        },
      });

      const refinedData: Record<string, string> = { ...extraction.data };
      try {
        const parsed = JSON.parse(response.text || '{}');
        for (const key in parsed) {
          refinedData[key] = (parsed[key] === 'null' || parsed[key] === null) ? (refinedData[key] || '') : String(parsed[key] || '');
        }
      } catch {
        throw new Error('A IA não retornou um formato de dados válido.');
      }

      setExtractedFiles(prev => prev.map(f => 
        f.id === extractionId ? { ...f, data: refinedData, status: 'success' } : f
      ));
      toast.success(`Análise aprofundada concluída!`);
    } catch (error: unknown) {
      console.error('Gemini API Error:', error);
      const err = error as Error;
      setExtractedFiles(prev => prev.map(f => 
        f.id === extractionId ? { ...f, status: 'error', error: err.message } : f 
      ));
      toast.error(`Falha na análise: ${err.message}`);
    }
  };

  const saveExtractionToControl = async (extractionId: string, updateIndex?: number) => {
    if (!user) {
      toast.error('Você precisa estar logado para salvar dados no controle.');
      return;
    }

    const fileData = extractedFiles.find(f => f.id === extractionId);
    if (!fileData || fileData.status !== 'success') return;

    setExtractedFiles(prev => prev.map(f => f.id === extractionId ? { ...f, status: 'processing' } : f));

    try {
      const supabase = getSupabase();
      // Upload files to Storage
      const fileUrls: string[] = [];
      for (const file of fileData.files) {
        const filePath = `documents/${user.id}/${extractionId}/${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(filePath, file);
        
        if (uploadError) throw uploadError;
        
        const { data: { publicUrl } } = supabase.storage
          .from('documents')
          .getPublicUrl(filePath);
          
        fileUrls.push(publicUrl);
      }

      if (extractionType === 'normativo') {
        const normativoData = {
          data: fileData.data,
          userId: user.id,
          createdAt: new Date().toISOString(),
          fileUrls
        };
        const { error } = await supabase.from('normativos').insert(normativoData);
        if (error) throw error;
        
        setExtractedFiles(prev => prev.filter(f => f.id !== extractionId));
        toast.success('Normativo adicionado ao controle!');
        // Force refresh of data from Supabase
        setRefreshTrigger(prev => prev + 1);
        return;
      }

      const processData = {
        data: fileData.data,
        userId: user.id,
        status: 'success',
        createdAt: new Date().toISOString(),
        fileUrls
      };

      if (updateIndex !== undefined && csvData[updateIndex]?._id) {
        const { error } = await supabase
          .from('processes')
          .update(processData)
          .eq('id', csvData[updateIndex]._id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('processes').insert(processData);
        if (error) throw error;
      }

      setExtractedFiles(prev => prev.filter(f => f.id !== extractionId));
      setDuplicateResolution(null);
      toast.success('Dados adicionados ao controle!');
      // Force refresh of data from Supabase
      setRefreshTrigger(prev => prev + 1);
    } catch (error: unknown) {
      console.error('Error saving to Supabase:', error);
      handleSupabaseError(error, OperationType.WRITE, extractionType === 'normativo' ? 'normativos' : 'processes', user);
      setExtractedFiles(prev => prev.map(f => f.id === extractionId ? { ...f, status: 'error', error: 'Erro ao salvar no banco de dados.' } : f));
    }
  };

  const exportToCSV = (type: 'processos' | 'normativos') => {
    const data = type === 'processos' ? csvData : normativosData;
    const cols = type === 'processos' ? columns : normativosColumns;
    const filename = type === 'processos' ? 'CONTROLE_DE_PROCESSOS_GRMC.csv' : 'BASE_NORMATIVA_GRMC.csv';
    
    const emissionDate = `Relatório de ${type === 'processos' ? 'Processos' : 'Normativos'} - GRMC\nData de Emissão: ${currentTime.toLocaleString('pt-BR')}\n\n`;
    const csv = Papa.unparse(data, { columns: cols, delimiter: ';' });
    const blob = new Blob(['\uFEFF' + emissionDate + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Relatório de ${type} exportado em CSV!`);
  };

  const exportToPDF = (type: 'processos' | 'normativos') => {
    const data = type === 'processos' ? filteredData : filteredNormativosData;
    const cols = type === 'processos' ? columns : normativosColumns;
    const title = type === 'processos' ? 'RELATÓRIO DE PROCESSOS - GRMC' : 'BASE NORMATIVA - GRMC';
    const filename = type === 'processos' ? 'RELATORIO_PROCESSOS_GRMC.pdf' : 'BASE_NORMATIVA_GRMC.pdf';

    const orientation = type === 'processos' ? 'landscape' : 'portrait';
    const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    const drawHeader = (doc: jsPDF) => {
      doc.setFillColor(30, 58, 138);
      doc.rect(0, 0, pageWidth, 35, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('DESO - Companhia de Saneamento de Sergipe', 15, 15);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text('Gerência de Regulação e Monitoramento Contratual - GRMC', 15, 22);
      doc.text(title, 15, 28);
      doc.setFontSize(8);
      doc.text(`Emissão: ${currentTime.toLocaleString('pt-BR')}`, pageWidth - 70, 28);
    };

    const drawFooter = (doc: jsPDF, pageNumber: number, pageCount: number) => {
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text(`Página ${pageNumber} de ${pageCount}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
      doc.text('GRMC - Gerência de Regulação e Monitoramento Contratual', 15, pageHeight - 10);
    };

    // Filter out empty columns for the PDF
    const activeCols = cols.filter(col => !col.startsWith('_') && data.some(row => row[col] && row[col].trim() !== ''));
    const tableRows = data.map(row => activeCols.map(col => row[col] || ''));

    autoTable(doc, {
      head: [activeCols],
      body: tableRows,
      startY: 45,
      styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillColor: [30, 58, 138], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      margin: { top: 45, bottom: 20 },
      didDrawPage: (data) => {
        drawHeader(doc);
        drawFooter(doc, data.pageNumber, doc.getNumberOfPages());
      }
    });

    doc.save(filename);
    toast.success(`Relatório de ${type} exportado em PDF!`);
  };

  // Table Actions
  const handleDeleteRow = (index: number) => {
    setDeleteConfirmation({ index });
  };

  const confirmDeleteRow = async () => {
    if (deleteConfirmation !== null && user) {
      const supabase = getSupabase();
      const index = deleteConfirmation.index;
      const rowToDelete = csvData[index];
      const rowId = rowToDelete._id;
      const fileUrls = rowToDelete._fileUrls || [];
      
      try {
        // Delete files from Storage
        for (const url of fileUrls) {
          try {
            const filePath = url.split('/storage/v1/object/public/documents/')[1];
            if (filePath) {
              await supabase.storage.from('documents').remove([filePath]);
            }
          } catch (e) {
            console.error("Erro ao deletar arquivo do Storage:", url, e);
          }
        }

        const { error } = await supabase.from('processes').delete().eq('id', rowId);
        if (error) throw error;
        toast.success('Processo removido com sucesso.');
      } catch (error: unknown) {
        handleSupabaseError(error, OperationType.DELETE, `processes/${rowId}`, user);
      }
      setDeleteConfirmation(null);
    }
  };

  const confirmDeleteNormativoRow = async () => {
    if (normativosDeleteConfirmation !== null && user) {
      const supabase = getSupabase();
      const index = normativosDeleteConfirmation.index;
      const rowToDelete = normativosData[index];
      const rowId = rowToDelete._id;
      const fileUrls = rowToDelete._fileUrls || [];
      
      try {
        // Delete files from Storage
        for (const url of fileUrls) {
          try {
            const filePath = url.split('/storage/v1/object/public/documents/')[1];
            if (filePath) {
              await supabase.storage.from('documents').remove([filePath]);
            }
          } catch (e) {
            console.error("Erro ao deletar arquivo do Storage:", url, e);
          }
        }

        const { error } = await supabase.from('normativos').delete().eq('id', rowId);
        if (error) throw error;
        toast.success('Normativo removido com sucesso.');
      } catch (error: unknown) {
        handleSupabaseError(error, OperationType.DELETE, `normativos/${rowId}`, user);
      }
      setNormativosDeleteConfirmation(null);
    }
  };

  const restoreRow = (index: number) => {
    const rowToRestore = deletedRows[index];
    const rowId = rowToRestore._id;
    
    setCsvData(prev => [...prev, rowToRestore]);
    setDeletedRows(prev => prev.filter((_, i) => i !== index));
    
    if (rowId) {
      const files = deletedFiles[rowId];
      if (files) {
        setProcessFiles(prev => ({ ...prev, [rowId]: files }));
        setDeletedFiles(prev => {
          const newFiles = { ...prev };
          delete newFiles[rowId];
          return newFiles;
        });
      }
    }
    
    toast.success('Processo restaurado com sucesso.');
  };

  const restoreNormativoRow = (index: number) => {
    const rowToRestore = normativosDeletedRows[index];
    const rowId = rowToRestore._id;
    
    setNormativosData(prev => [...prev, rowToRestore]);
    setNormativosDeletedRows(prev => prev.filter((_, i) => i !== index));
    
    if (rowId) {
      const files = normativosDeletedFiles[rowId];
      if (files) {
        setNormativosFiles(prev => ({ ...prev, [rowId]: files }));
        setNormativosDeletedFiles(prev => {
          const newFiles = { ...prev };
          delete newFiles[rowId];
          return newFiles;
        });
      }
    }
    
    toast.success('Normativo restaurado com sucesso.');
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const analyzeProcesses = async (prompt: string, type: 'processo' | 'normativo' | 'combined' = 'processo', files: File[] = []) => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY! });
      
      let dataToAnalyze: Record<string, string>[] = [];
      if (type === 'processo') dataToAnalyze = csvData.slice(0, 40);
      else if (type === 'normativo') dataToAnalyze = normativosData.slice(0, 40);
      else dataToAnalyze = [...csvData.slice(0, 20), ...normativosData.slice(0, 20)];

      const context = JSON.stringify(dataToAnalyze.map(row => {
        const entry: Record<string, string> = {};
        Object.entries(row).forEach(([k, v]) => {
          if (k.startsWith('_')) return;
          entry[k] = typeof v === 'string' ? v.substring(0, 300) : v;
        });
        return entry;
      }));

      const parts: { text?: string; inlineData?: { data: string; mimeType: string } }[] = [
        { text: `Contexto GRMC/DESO: ${context}\n\nSolicitação: ${prompt}` }
      ];

      // Add files if any
      for (const file of files) {
        try {
          const base64 = await fileToBase64(file);
          parts.push({
            inlineData: {
              data: base64.split(',')[1],
              mimeType: file.type
            }
          });
        } catch (e) {
          console.error("Erro ao converter arquivo:", file.name, e);
        }
      }

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: { parts },
        config: {
          systemInstruction: `${GRMC_CONTEXT}\nVocê é o Analista Inteligente do GRMC. Sua tarefa é analisar dados e documentos (PDFs) para fornecer insights estratégicos. Responda de forma profissional e técnica.`
        }
      });
      return response.text || "Sem resposta.";
    } catch (error) {
      console.error(`Erro ao analisar:`, error);
      return "Desculpe, ocorreu um erro ao processar sua solicitação.";
    }
  };

  const startEditingRow = (index: number, row: Record<string, string>) => {
    setEditingRowIndex(index);
    setEditingRowData({ ...row });
  };

  const saveEditedRow = async () => {
    if (editingRowIndex !== null && user) {
      const supabase = getSupabase();
      const rowId = csvData[editingRowIndex]._id;
      const updatedData = { ...editingRowData };
      delete updatedData._id;
      delete updatedData._fileUrls;

      try {
        const { error } = await supabase
          .from('processes')
          .update({
            data: updatedData,
            updatedAt: new Date().toISOString()
          })
          .eq('id', rowId);
        if (error) throw error;
        
        setEditingRowIndex(null);
        setEditingRowData({});
        toast.success('Processo atualizado com sucesso.');
      } catch (error: unknown) {
        handleSupabaseError(error, OperationType.UPDATE, `processes/${rowId}`, user);
      }
    }
  };

  const cancelEditingRow = () => {
    setEditingRowIndex(null);
    setEditingRowData({});
  };

  // Derived Data for Table & Dashboard
  const filteredData = useMemo(() => {
    if (!searchTerm) return csvData;
    const lowerSearch = searchTerm.toLowerCase();
    return csvData.filter(row => 
      Object.values(row).some(val => val && val.toLowerCase().includes(lowerSearch))
    );
  }, [csvData, searchTerm]);

  const filteredNormativosData = useMemo(() => {
    if (!normativosSearchTerm) return normativosData;
    const lowerSearch = normativosSearchTerm.toLowerCase();
    return normativosData.filter(row => 
      Object.values(row).some(val => val && val.toLowerCase().includes(lowerSearch))
    );
  }, [normativosData, normativosSearchTerm]);

  const dashboardStats = useMemo(() => {
    const statusCounts = csvData.reduce((acc, row) => {
      const status = row['SITUAÇÃO - STATUS'] || 'Não Informado';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const statusData = Object.keys(statusCounts).map(key => ({ name: key, value: statusCounts[key] }));

    const remetenteCounts = csvData.reduce((acc, row) => {
      const remetente = row['REMETENTE'] || 'Não Informado';
      acc[remetente] = (acc[remetente] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const remetenteData = Object.keys(remetenteCounts).map(key => ({ name: key, value: remetenteCounts[key] })).sort((a,b) => b.value - a.value).slice(0, 5); // Top 5

    return { statusData, remetenteData, total: csvData.length };
  }, [csvData]);

  const generateGeneralSummary = async () => {
    if (csvData.length === 0) return;
    setIsGeneratingGeneralSummary(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY! });
      // Reduce context to avoid token limits (Top 30 rows, essential columns, truncated text)
      const essentialData = csvData.slice(0, 30).map(row => ({
        'Nº E-DOC': row['Nº E-DOC'],
        'ASSUNTO': typeof row['ASSUNTO'] === 'string' ? row['ASSUNTO'].substring(0, 200) : row['ASSUNTO'],
        'REMETENTE': row['REMETENTE'],
        'SITUAÇÃO - STATUS': row['SITUAÇÃO - STATUS']
      }));
      const context = JSON.stringify(essentialData);
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analise o panorama geral destes processos do GRMC: ${context}. Gere um resumo executivo de alto nível sobre o status geral, principais gargalos, unidades mais envolvidas e recomendações estratégicas.`,
        config: {
          systemInstruction: `${GRMC_CONTEXT}\nVocê é um gestor sênior de regulação de contratos. Seu objetivo é fornecer insights estratégicos baseados em dados de processos. IMPORTANTE: Não use formatação markdown como # ou * no texto, use apenas texto puro com quebras de linha.`
        }
      });

      const cleanText = (response.text || "Não foi possível gerar o resumo geral.")
        .replace(/[#*`_~>]/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      setGeneralSummary(cleanText);
      toast.success("Resumo geral gerado!");
    } catch (error) {
      console.error("Erro ao gerar resumo geral:", error);
      toast.error("Falha ao gerar resumo geral.");
    } finally {
      setIsGeneratingGeneralSummary(false);
    }
  };

  const generateDynamicInsights = async (type: 'processo' | 'normativo') => {
    const data = type === 'processo' ? csvData : normativosData;
    if (data.length === 0) return;
    
    if (type === 'processo') setIsGeneratingProcessInsights(true);
    else setIsGeneratingNormativosInsights(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY! });
      // Limit data and truncate values for insights
      const context = JSON.stringify(data.slice(0, 40).map(row => {
        const entry: Record<string, string> = {};
        Object.entries(row).forEach(([k, v]) => {
          if (k.startsWith('_')) return;
          entry[k] = typeof v === 'string' ? v.substring(0, 100) : v;
        });
        return entry;
      }));
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analise estes dados de ${type === 'processo' ? 'processos' : 'normativos'} e identifique os 3 indicadores (KPIs) mais relevantes que não sejam apenas contagem total. 
        Retorne APENAS um array JSON de objetos com as chaves "label", "value" e "color" (opcional, use classes tailwind como text-blue-600).
        Exemplo: [{"label": "Média de Prazo", "value": "15 dias", "color": "text-amber-600"}].
        Dados: ${context}`,
        config: {
          systemInstruction: `${GRMC_CONTEXT}\nVocê é um especialista em BI e análise de dados. Retorne apenas JSON puro.`,
          responseMimeType: "application/json"
        }
      });

      const insights = JSON.parse(response.text || "[]");
      if (type === 'processo') setProcessDynamicInsights(insights);
      else setNormativosDynamicInsights(insights);
      toast.success("Insights dinâmicos atualizados!");
    } catch (error) {
      console.error("Erro ao gerar insights:", error);
      toast.error("Falha ao gerar insights dinâmicos.");
    } finally {
      if (type === 'processo') setIsGeneratingProcessInsights(false);
      else setIsGeneratingNormativosInsights(false);
    }
  };

  const generateGeneralNormativosSummary = async () => {
    if (normativosData.length === 0) return;
    setIsGeneratingGeneralNormativosSummary(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY! });
      // Reduce context to avoid token limits (Top 30 rows, truncated titles)
      const essentialData = normativosData.slice(0, 30).map(row => ({
        'CATEGORIA': row['CATEGORIA'],
        'TÍTULO': typeof row['TÍTULO'] === 'string' ? row['TÍTULO'].substring(0, 200) : row['TÍTULO'],
        'DATA': row['DATA']
      }));
      const context = JSON.stringify(essentialData);
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analise o panorama geral destes normativos do GRMC: ${context}. Gere um resumo executivo sobre os tipos de normativos, temas recorrentes e impacto na regulação de contratos.`,
        config: {
          systemInstruction: `${GRMC_CONTEXT}\nVocê é um especialista em regulação de contratos. Forneça insights técnicos. IMPORTANTE: Não use formatação markdown como # ou * no texto, use apenas texto puro com quebras de linha.`
        }
      });

      const cleanText = (response.text || "Não foi possível gerar o resumo de normativos.")
        .replace(/[#*`_~>]/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      setGeneralNormativosSummary(cleanText);
      toast.success("Resumo de normativos gerado!");
    } catch (error) {
      console.error("Erro ao gerar resumo de normativos:", error);
      toast.error("Falha ao gerar resumo de normativos.");
    } finally {
      setIsGeneratingGeneralNormativosSummary(false);
    }
  };

  const generateCombinedAnalysis = async () => {
    if (csvData.length === 0 && normativosData.length === 0) return;
    setIsGeneratingCombinedAnalysis(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY! });
      // Reduce context significantly for combined analysis and truncate strings
      const processContext = JSON.stringify(csvData.slice(0, 20).map(r => ({
        'Nº E-DOC': r['Nº E-DOC'],
        'ASSUNTO': typeof r['ASSUNTO'] === 'string' ? r['ASSUNTO'].substring(0, 150) : r['ASSUNTO'],
        'SITUAÇÃO - STATUS': r['SITUAÇÃO - STATUS']
      })));
      const normativosContext = JSON.stringify(normativosData.slice(0, 20).map(r => ({
        'CATEGORIA': r['CATEGORIA'],
        'TÍTULO': typeof r['TÍTULO'] === 'string' ? r['TÍTULO'].substring(0, 150) : r['TÍTULO']
      })));
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Realize uma análise conjunta dos Processos e Normativos do GRMC.
        Processos: ${processContext}
        Normativos: ${normativosContext}
        
        Identifique como os normativos impactam os processos atuais, se há conformidade, riscos jurídicos ou operacionais, e sugira melhorias na gestão baseada nesta correlação.`,
        config: {
          systemInstruction: `${GRMC_CONTEXT}\nVocê é um consultor jurídico e de gestão de contratos. Forneça uma análise técnica e estratégica. IMPORTANTE: Não use formatação markdown como # ou * no texto, use apenas texto puro com quebras de linha.`
        }
      });

      const cleanText = (response.text || "Não foi possível gerar a análise conjunta.")
        .replace(/[#*`_~>]/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      setCombinedAnalysis(cleanText);
      toast.success("Análise conjunta gerada!");
    } catch (error) {
      console.error("Erro ao gerar análise conjunta:", error);
      toast.error("Falha ao gerar análise conjunta.");
    } finally {
      setIsGeneratingCombinedAnalysis(false);
    }
  };


  const generateGlobalSummary = async (type: 'processo' | 'normativo') => {
    const data = type === 'processo' ? csvData : normativosData;
    if (data.length === 0) return;

    if (type === 'processo') setIsGeneratingGlobalProcessSummary(true);
    else setIsGeneratingGlobalNormativoSummary(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY! });
      
      // Sample data for global summary (up to 50 rows)
      const sampledData = data.slice(0, 50).map(row => {
        const entry: Record<string, string> = {};
        Object.entries(row).forEach(([k, v]) => {
          if (k.startsWith('_')) return;
          entry[k] = typeof v === 'string' ? v.substring(0, 300) : v;
        });
        return entry;
      });

      const context = JSON.stringify(sampledData);
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Gere um Resumo Global Abrangente para a base de ${type === 'processo' ? 'Processos' : 'Normativos'} da GRMC/DESO.
        Dados: ${context}
        
        O resumo deve conter:
        - Visão Geral Quantitativa e Qualitativa
        - Principais Temas e Categorias
        - Análise de Prazos e Eficiência (se aplicável)
        - Recomendações de Gestão para a Superintendência.
        Seja extremamente profissional e detalhado.`,
        config: {
          systemInstruction: `${GRMC_CONTEXT}\nVocê é o Cérebro Digital da GRMC. Forneça relatórios executivos de alto nível. IMPORTANTE: Não use formatação markdown como # ou * no texto, use apenas texto puro com quebras de linha.`
        }
      });

      const cleanText = (response.text || "Não foi possível gerar o resumo global.")
        .replace(/[#*`_~>]/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      if (type === 'processo') setGlobalProcessSummary(cleanText);
      else setGlobalNormativoSummary(cleanText);
      
      toast.success(`Resumo Global de ${type === 'processo' ? 'Processos' : 'Normativos'} gerado!`);
    } catch (error) {
      console.error(`Erro ao gerar resumo global de ${type}:`, error);
      toast.error(`Falha ao gerar resumo global de ${type}.`);
    } finally {
      if (type === 'processo') setIsGeneratingGlobalProcessSummary(false);
      else setIsGeneratingGlobalNormativoSummary(false);
    }
  };

  const handleChatSubmit = async () => {
    if (!chatInput.trim()) return;
    
    const userMsg = chatInput;
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsGeneratingCustomReport(true);
    
    try {
      const response = await analyzeProcesses(userMsg, customReportType);
      setChatMessages(prev => [...prev, { role: 'assistant', content: response }]);
    } catch (error) {
      console.error("Erro no chat:", error);
      setChatMessages(prev => [...prev, { role: 'assistant', content: "Desculpe, não consegui processar sua dúvida agora." }]);
    } finally {
      setIsGeneratingCustomReport(false);
    }
  };

  const generateCustomReport = async () => {
    if (!customReportPrompt.trim()) return;
    setIsGeneratingCustomReport(true);
    try {
      const files = selectedFilesForAnalysis.map(f => f.file);
      const result = await analyzeProcesses(customReportPrompt, customReportType, files);

      const cleanText = (result || "Não foi possível gerar o relatório solicitado.")
        .replace(/[#*`_~>]/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      setCustomReportResult(cleanText);
      toast.success("Relatório gerado com sucesso!");
    } catch (error) {
      console.error("Erro ao gerar relatório customizado:", error);
      toast.error("Falha ao gerar relatório customizado.");
    } finally {
      setIsGeneratingCustomReport(false);
    }
  };

  const exportCustomReportCSV = () => {
    if (!customReportResult) return;
    const header = `RELATÓRIO INTELIGENTE - GRMC\nData de Emissão: ${currentTime.toLocaleString('pt-BR')}\n\n`;
    const blob = new Blob([header + customReportResult], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'RELATORIO_GRMC_CUSTOMIZADO.txt');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Relatório exportado em texto!");
  };

  const exportCustomReportPDF = () => {
    if (!customReportResult) return;
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const contentWidth = pageWidth - (margin * 2);
    
    const drawHeader = (doc: jsPDF) => {
      doc.setFillColor(30, 58, 138);
      doc.rect(0, 0, 210, 35, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('DESO - Companhia de Saneamento de Sergipe', 15, 15);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text('Gerência de Regulação e Monitoramento Contratual - GRMC', 15, 22);
      doc.text('RELATÓRIO INTELIGENTE - CÉREBRO DIGITAL', 15, 28);
      doc.setFontSize(8);
      doc.text(`Emissão: ${currentTime.toLocaleString('pt-BR')}`, 160, 28);
    };

    const drawFooter = (doc: jsPDF, pageNumber: number, pageCount: number) => {
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text(`Página ${pageNumber} de ${pageCount}`, 105, 285, { align: 'center' });
      doc.text('GRMC - Gerência de Regulação e Monitoramento Contratual', 15, 285);
    };

    drawHeader(doc);
    
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    const cleanText = customReportResult
      .replace(/[#*`_~>]/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    const splitText = doc.splitTextToSize(cleanText, contentWidth);
    let y = 45;
    const lineHeight = 6;
    
    splitText.forEach((line: string) => {
      if (y > pageHeight - 25) {
        doc.addPage();
        drawHeader(doc);
        y = 45;
      }
      doc.text(line, margin, y);
      y += lineHeight;
    });

    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      drawFooter(doc, i, pageCount);
    }

    doc.save('RELATORIO_GRMC_IA.pdf');
    toast.success("Relatório exportado em PDF!");
  };

  const generateProcessSummary = async (row: Record<string, string>, type: 'processo' | 'normativo' = 'processo') => {
    const rowId = row._id;
    if (!rowId) return;

    if (type === 'processo') setIsGeneratingSummary(prev => ({ ...prev, [rowId]: true }));
    else setIsGeneratingNormativoSummary(prev => ({ ...prev, [rowId]: true }));

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY! });
      
      // Truncate fields for single row summary if they are excessively large
      const truncatedRow: Record<string, string> = {};
      Object.entries(row).forEach(([k, v]) => {
        if (k.startsWith('_')) return;
        truncatedRow[k] = typeof v === 'string' && v.length > 5000 
          ? v.substring(0, 5000) + '... [TRUNCADO]' 
          : v;
      });

      const data = JSON.stringify(truncatedRow);
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Gere um resumo executivo estruturado para o ${type === 'processo' ? 'processo' : 'normativo'} GRMC: ${data}. 
        Estrutura sugerida:
        1. Identificação
        2. Pontos Chave e Relevância
        3. Status/Vigência
        4. Conclusão/Recomendações.
        Seja conciso e profissional.`,
        config: {
          systemInstruction: `${GRMC_CONTEXT}\nVocê é um consultor sênior especializado em gestão pública. Crie resumos executivos estruturados e profissionais. IMPORTANTE: Não use formatação markdown como # ou * no texto, use apenas texto puro com quebras de linha.`
        }
      });

      const cleanSummary = (response.text || "Não foi possível gerar o resumo.")
        .replace(/[#*`_~>]/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      if (type === 'processo') setSummaries(prev => ({ ...prev, [rowId]: cleanSummary }));
      else setNormativosSummaries(prev => ({ ...prev, [rowId]: cleanSummary }));
      toast.success("Resumo gerado com sucesso!");
    } catch (error) {
      console.error("Erro ao gerar resumo:", error);
      toast.error("Falha ao gerar resumo via IA.");
    } finally {
      if (type === 'processo') setIsGeneratingSummary(prev => ({ ...prev, [rowId]: false }));
      else setIsGeneratingNormativoSummary(prev => ({ ...prev, [rowId]: false }));
    }
  };

  const downloadSummaryPDF = (row: Record<string, string>, summary: string) => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const contentWidth = pageWidth - (margin * 2);

    // Clean summary text from markdown artifacts
    const cleanSummary = summary
      .replace(/[#*`_~>]/g, '') // Remove common markdown symbols
      .replace(/\n{3,}/g, '\n\n') // Normalize multiple newlines
      .trim();

    const drawHeader = (doc: jsPDF) => {
      doc.setFillColor(30, 58, 138);
      doc.rect(0, 0, 210, 35, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('DESO - Companhia de Saneamento de Sergipe', 15, 15);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text('Gerência de Regulação e Monitoramento Contratual - GRMC', 15, 22);
      doc.text('RESUMO EXECUTIVO INDIVIDUAL', 15, 28);
      doc.setFontSize(8);
      doc.text(`Emissão: ${currentTime.toLocaleString('pt-BR')}`, 160, 28);
    };

    const drawFooter = (doc: jsPDF, pageNumber: number, pageCount: number) => {
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text(`Página ${pageNumber} de ${pageCount}`, 105, 285, { align: 'center' });
      doc.text('GRMC - Gerência de Regulação e Monitoramento Contratual', 15, 285);
    };

    drawHeader(doc);

    // Record Info Box
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(margin, 45, contentWidth, 35, 2, 2, 'F');
    doc.setDrawColor(30, 58, 138);
    doc.setLineWidth(0.5);
    doc.roundedRect(margin, 45, contentWidth, 35, 2, 2, 'D');

    doc.setTextColor(30, 58, 138);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    
    const idValue = row['Nº E-DOC'] || row['TÍTULO'] || row._id || 'N/A';
    doc.text(`IDENTIFICAÇÃO: ${idValue}`, margin + 5, 53);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`CATEGORIA/ASSUNTO: ${row['CATEGORIA'] || row['ASSUNTO'] || 'N/A'}`, margin + 5, 60);
    doc.text(`DATA: ${row['DATA DE RECEBIMENTO'] || row['DATA'] || 'N/A'}`, margin + 5, 67);
    doc.text(`STATUS: ${row['SITUAÇÃO - STATUS'] || 'Ativo'}`, margin + 5, 74);

    doc.setTextColor(30, 41, 59);
    doc.setFontSize(10);
    
    const splitText = doc.splitTextToSize(cleanSummary, contentWidth);
    let y = 90;
    const lineHeight = 6;

    splitText.forEach((line: string) => {
      if (y > pageHeight - 25) {
        doc.addPage();
        drawHeader(doc);
        y = 45;
      }
      doc.text(line, margin, y);
      y += lineHeight;
    });

    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      drawFooter(doc, i, pageCount);
    }

    doc.save(`RESUMO_GRMC_${idValue.replace(/[^a-z0-9]/gi, '_')}.pdf`);
    toast.success("Resumo exportado em PDF!");
  };

  if (!isAuthReady) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-4">
        <Card className="w-full max-w-md shadow-xl border-t-4 border-[#1E3A8A]">
          <CardHeader className="text-center space-y-4">
            <div className="w-24 h-24 bg-[#1E3A8A] rounded-full flex items-center justify-center text-white font-bold text-2xl border-4 border-[#16A34A] mx-auto shadow-lg">
              DESO
            </div>
            <div>
              <CardTitle className="text-2xl font-bold text-[#1E3A8A]">GRMC DOC EXTRACT</CardTitle>
              <CardDescription className="text-[#16A34A] font-medium">
                Companhia de Saneamento de Sergipe
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-center text-slate-600 text-sm">
              {authMode === 'login'
                ? 'Acesse o sistema com seu e-mail e senha.'
                : 'Crie sua conta para acessar o sistema.'}
            </p>
            <div className="space-y-3">
              <div>
                <Label htmlFor="auth-email" className="text-slate-700 font-medium">E-mail</Label>
                <Input
                  id="auth-email"
                  type="email"
                  placeholder="seu@email.com"
                  value={authEmail}
                  onChange={e => setAuthEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (authMode === 'login' ? handleLogin() : handleSignUp())}
                  className="mt-1 h-11"
                  disabled={authLoading}
                />
              </div>
              <div>
                <Label htmlFor="auth-password" className="text-slate-700 font-medium">Senha</Label>
                <Input
                  id="auth-password"
                  type="password"
                  placeholder={authMode === 'signup' ? 'Mínimo 6 caracteres' : '••••••••'}
                  value={authPassword}
                  onChange={e => setAuthPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (authMode === 'login' ? handleLogin() : handleSignUp())}
                  className="mt-1 h-11"
                  disabled={authLoading}
                />
              </div>
            </div>
            <Button
              onClick={authMode === 'login' ? handleLogin : handleSignUp}
              disabled={authLoading}
              className="w-full bg-[#1E3A8A] hover:bg-[#163075] text-white h-12 text-base font-semibold shadow-md"
            >
              {authLoading ? 'Aguarde...' : authMode === 'login' ? 'Entrar' : 'Criar Conta'}
            </Button>
            <p className="text-center text-sm text-slate-500">
              {authMode === 'login' ? (
                <>
                  Não tem conta?{' '}
                  <button onClick={() => { setAuthMode('signup'); setAuthPassword(''); }} className="text-[#1E3A8A] font-semibold hover:underline">
                    Cadastre-se
                  </button>
                </>
              ) : (
                <>
                  Já tem conta?{' '}
                  <button onClick={() => { setAuthMode('login'); setAuthPassword(''); }} className="text-[#1E3A8A] font-semibold hover:underline">
                    Fazer login
                  </button>
                </>
              )}
            </p>
          </CardContent>
          <CardFooter className="text-center text-xs text-slate-400 border-t pt-4">
            Acesso restrito a colaboradores autorizados.
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl space-y-8">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center border-b pb-4 gap-4 bg-white p-6 rounded-xl shadow-sm border border-slate-100 mb-8">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-[#1E3A8A] rounded-full flex items-center justify-center text-white font-bold text-xl border-4 border-[#16A34A] shadow-sm shrink-0">
            DESO
          </div>
          <div>
            <h1 className="text-3xl font-bold text-[#1E3A8A]">Extrator de Documentos - GRMC</h1>
            <p className="text-[#16A34A] font-medium mt-1 flex items-center gap-2">
              COMPANHIA DE SANEAMENTO DE SERGIPE
              <span className="inline-block w-1 h-1 bg-slate-300 rounded-full"></span>
              <span className="text-blue-600 tabular-nums">{currentTime.toLocaleString('pt-BR')}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="text-right mr-4 hidden md:block">
            <p className="text-sm font-medium text-slate-900">{user.email?.split('@')[0] || 'Usuário'}</p>
            <p className="text-xs text-slate-500">{user.email}</p>
          </div>
          <Button 
            onClick={handleLogout}
            variant="outline"
            className="border-red-200 text-red-600 hover:bg-red-50"
          >
            Sair
          </Button>
          <Button 
            onClick={() => {
              setReportSubTab('reports_chat');
              setActiveTab('reports');
            }}
            className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md border-b-4 border-indigo-800 active:border-b-0 active:translate-y-1 transition-all"
          >
            <Brain className="w-5 h-5 mr-2 animate-pulse" />
            IA Interativa
          </Button>
        </div>
      </header>

      <div className="flex space-x-2 border-b pb-2">
        <Button 
          variant={activeTab === 'extract' ? 'default' : 'ghost'} 
          onClick={() => setActiveTab('extract')}
        >
          <FileUp className="w-4 h-4 mr-2" />
          Extração
        </Button>
        <Button 
          variant={activeTab === 'table' ? 'default' : 'ghost'} 
          onClick={() => setActiveTab('table')}
        >
          <List className="w-4 h-4 mr-2" />
          Processos Cadastrados
        </Button>
        <Button 
          variant={activeTab === 'normativos' ? 'default' : 'ghost'} 
          onClick={() => setActiveTab('normativos')}
        >
          <FileText className="w-4 h-4 mr-2" />
          Normativos Cadastrados
        </Button>
        <Button 
          variant={activeTab === 'dashboard' ? 'default' : 'ghost'} 
          onClick={() => setActiveTab('dashboard')}
        >
          <BarChart3 className="w-4 h-4 mr-2" />
          Dashboard de Processos
        </Button>
        <Button 
          variant={activeTab === 'dashboard_normativos' ? 'default' : 'ghost'} 
          onClick={() => setActiveTab('dashboard_normativos')}
        >
          <BarChart3 className="w-4 h-4 mr-2" />
          Dashboard de Normativos
        </Button>
        <Button 
          variant={activeTab === 'reports' ? 'default' : 'ghost'} 
          onClick={() => setActiveTab('reports')}
        >
          <FileText className="w-4 h-4 mr-2" />
          Emissão de Relatórios
        </Button>
      </div>

      {activeTab === 'extract' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-bottom-4">
          <div className="lg:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Configuração de Extração</CardTitle>
                <CardDescription>Selecione o tipo de documento que deseja processar.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2 mb-4">
                  <Button 
                    variant={extractionType === 'processo' ? 'default' : 'outline'} 
                    className="flex-1"
                    onClick={() => setExtractionType('processo')}
                  >
                    Processo (e-Doc)
                  </Button>
                  <Button 
                    variant={extractionType === 'normativo' ? 'default' : 'outline'} 
                    className="flex-1"
                    onClick={() => setExtractionType('normativo')}
                  >
                    Normativo
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Zona de Upload</CardTitle>
                <CardDescription>
                  {extractionType === 'processo' 
                    ? 'Arraste e solte até 9 arquivos PDF (e-Doc + Anexos).' 
                    : 'Arraste e solte o PDF do normativo (Contratos, Leis, etc).'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div 
                  {...getRootProps()} 
                  className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${isDragActive ? 'border-primary bg-primary/5' : 'border-slate-300 hover:border-primary'}`}
                >
                  <input {...getInputProps()} />
                  <Layers className="w-12 h-12 mx-auto text-slate-400 mb-4" />
                  {isDragActive ? (
                    <p className="text-primary font-medium">Solte os PDFs aqui...</p>
                  ) : (
                    <p className="text-slate-600">Arraste e solte até 9 PDFs juntos aqui, ou clique para selecionar</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {extractionType === 'processo' ? 'Gerenciamento de Colunas' : 'Colunas de Normativos'}
                    {extractionType === 'normativo' && (
                      <span className="bg-purple-100 text-purple-700 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">IA Managed</span>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {extractionType === 'processo' 
                      ? 'Configure manualmente as colunas do seu controle de processos.' 
                      : 'As colunas abaixo são detectadas e organizadas automaticamente pela IA conforme os documentos são processados.'}
                  </CardDescription>
                </div>
                {extractionType === 'processo' && (
                  <Dialog open={isColumnDialogOpen} onOpenChange={setIsColumnDialogOpen}>
                    <DialogTrigger className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 w-9">
                      <Plus className="w-4 h-4" />
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Adicionar Nova Coluna</DialogTitle>
                      </DialogHeader>
                      <div className="py-4">
                        <Label htmlFor="colName">Nome da Coluna</Label>
                        <Input 
                          id="colName" 
                          value={newColumnName} 
                          onChange={(e) => setNewColumnName(e.target.value)} 
                          placeholder="Ex: OBSERVAÇÕES"
                          className="mt-2"
                        />
                      </div>
                      <DialogFooter>
                        <Button onClick={handleAddColumn}>Adicionar</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {(extractionType === 'processo' ? columns : normativosColumns).map((col, index) => (
                    <div key={col} className={`text-xs font-medium px-2.5 py-1 rounded flex items-center gap-2 ${extractionType === 'processo' ? 'bg-slate-100 text-slate-800' : 'bg-purple-50 text-purple-800 border border-purple-100'}`}>
                      <span className={extractionType === 'processo' ? "cursor-pointer hover:underline" : ""} onClick={() => {
                        if (extractionType === 'processo') {
                          const newName = prompt(`Renomear coluna "${col}" para:`, col);
                          if (newName && newName !== col) handleRenameColumn(col, newName);
                        }
                      }}>{col}</span>
                      <div className="flex gap-1">
                        <button 
                          onClick={() => {
                            if (extractionType === 'processo') handleMoveColumn(index, 'left');
                            else {
                              const newCols = [...normativosColumns];
                              if (index > 0) {
                                [newCols[index], newCols[index-1]] = [newCols[index-1], newCols[index]];
                                setNormativosColumns(newCols);
                              }
                            }
                          }} 
                          disabled={index === 0} 
                          className="text-slate-400 hover:text-primary disabled:opacity-30"
                        >
                          <ChevronLeft className="w-3 h-3" />
                        </button>
                        <button 
                          onClick={() => {
                            if (extractionType === 'processo') handleMoveColumn(index, 'right');
                            else {
                              const newCols = [...normativosColumns];
                              if (index < normativosColumns.length - 1) {
                                [newCols[index], newCols[index+1]] = [newCols[index+1], newCols[index]];
                                setNormativosColumns(newCols);
                              }
                            }
                          }} 
                          disabled={index === (extractionType === 'processo' ? columns.length : normativosColumns.length) - 1} 
                          className="text-slate-400 hover:text-primary disabled:opacity-30"
                        >
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>
                      <button 
                        onClick={() => {
                          if (extractionType === 'processo') handleDeleteColumn(col);
                          else setNormativosColumns(normativosColumns.filter(c => c !== col));
                        }} 
                        className="text-slate-400 hover:text-red-500"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Preview de Extração</CardTitle>
                <CardDescription>Revise e edite os dados extraídos antes de salvar no controle.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {extractedFiles.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    Nenhum arquivo processado ainda. Faça o upload de PDFs para começar.
                  </div>
                ) : (
                  extractedFiles.map((extraction) => (
                    <div key={extraction.id} className="border rounded-lg p-4 space-y-4 bg-slate-50/50">
                      <div className="flex justify-between items-center border-b pb-2">
                        <div className="flex flex-col">
                          <h3 className="font-medium flex items-center gap-2">
                            <Layers className="w-4 h-4 text-primary" />
                            Processo Extraído ({extraction.files.length} arquivo{extraction.files.length > 1 ? 's' : ''})
                          </h3>
                          <span className="text-xs text-slate-500 mt-1">
                            {extraction.files.map(f => f.name).join(', ')}
                          </span>
                        </div>
                        <div className="flex items-center">
                          {extraction.status === 'processing' && <span className="text-sm text-amber-600 animate-pulse">Processando com IA...</span>}
                          {extraction.status === 'error' && <span className="text-sm text-red-600">Erro: {extraction.error}</span>}
                          {extraction.status === 'success' && <span className="text-sm text-emerald-600 flex items-center gap-1"><CheckCircle className="w-4 h-4"/> Extraído</span>}
                        </div>
                      </div>

                      {(extraction.status === 'success' || extraction.status === 'processing') && (
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {(extractionType === 'processo' ? columns : Object.keys(extraction.data).filter(k => k !== '_id')).map(col => (
                              <div key={col} className="space-y-1">
                                <Label className="text-xs text-slate-500">{col}</Label>
                                <Input 
                                  value={extraction.data[col] || ''} 
                                  onChange={(e) => handleDataChange(extraction.id, col, e.target.value)}
                                  className="h-8 text-sm"
                                />
                              </div>
                            ))}
                          </div>
                          <div className="flex justify-end pt-2 gap-2">
                            <Button onClick={() => handleAdvancedAnalysis(extraction.id)} variant="outline" className="text-amber-600 border-amber-600 hover:bg-amber-50" disabled={extraction.status === 'processing'}>
                              <Edit className="w-4 h-4 mr-2" />
                              {extraction.status === 'processing' ? 'Analisando...' : 'Análise Aprofundada'}
                            </Button>
                            <Button onClick={() => handleSaveToControl(extraction.id)} className="bg-emerald-600 hover:bg-emerald-700">
                              <Save className="w-4 h-4 mr-2" />
                              Registrar no Controle
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {activeTab === 'table' && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md w-full">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
              <Input
                type="text"
                placeholder="Pesquisar processos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:flex-none">
                <Input 
                  type="file" 
                  accept=".csv" 
                  onChange={handleCsvUpload} 
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <Button variant="outline" className="w-full border-blue-200 text-blue-700 hover:bg-blue-50">
                  <UploadCloud className="w-4 h-4 mr-2" />
                  Carregar CSV Base
                </Button>
              </div>
              <Button 
                variant="outline" 
                onClick={() => exportToCSV('processos')} 
                disabled={csvData.length === 0}
                className="border-blue-600 text-blue-600 hover:bg-blue-50 flex-1 sm:flex-none"
              >
                <Download className="w-4 h-4 mr-2" />
                Baixar CSV Atualizado
              </Button>
              <Button variant="outline" onClick={() => exportToCSV('processos')} className="border-[#1E3A8A] text-[#1E3A8A] hover:bg-blue-50 flex-1 sm:flex-none">
                <Download className="w-4 h-4 mr-2" />
                Exportar Planilha
              </Button>
              <Button variant="outline" onClick={() => exportToPDF('processos')} className="border-[#16A34A] text-[#16A34A] hover:bg-green-50 flex-1 sm:flex-none">
                <FileText className="w-4 h-4 mr-2" />
                Exportar PDF
              </Button>
            </div>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Processos Cadastrados ({filteredData.length})</CardTitle>
              <Button variant="outline" onClick={() => setIsTrashDialogOpen(true)} className="gap-2">
                <Trash2 className="w-4 h-4" /> Lixeira ({deletedRows.length})
              </Button>
            </CardHeader>
            <CardContent className="overflow-x-auto max-h-[600px] overflow-y-auto relative">
              {filteredData.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  Nenhum processo encontrado.
                </div>
              ) : (
                <Table>
                  <TableHeader className="sticky top-0 bg-white z-10 shadow-sm">
                    <TableRow>
                      <TableHead className="w-[100px] bg-white">Ações</TableHead>
                      {columns.filter(col => filteredData.some(row => row[col] && row[col].trim() !== '')).map(col => (
                        <TableHead key={col} className="whitespace-nowrap bg-white">{col}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredData.map((row) => {
                      // We need the actual index in csvData for editing/deleting
                      const actualIndex = csvData.indexOf(row);
                      const isEditing = editingRowIndex === actualIndex;

                      return (
                        <TableRow key={actualIndex}>
                          <TableCell className="flex gap-2">
                            {isEditing ? (
                              <>
                                <Button size="icon" variant="ghost" onClick={saveEditedRow} className="text-emerald-600 h-8 w-8">
                                  <Save className="w-4 h-4" />
                                </Button>
                                <Button size="icon" variant="ghost" onClick={cancelEditingRow} className="text-slate-500 h-8 w-8">
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button size="icon" variant="ghost" onClick={() => startEditingRow(actualIndex, row)} className="h-8 w-8">
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button size="icon" variant="ghost" onClick={() => handleDeleteRow(actualIndex)} className="text-red-500 h-8 w-8">
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                                {row._fileUrls && row._fileUrls.length > 0 && (
                                  <Button size="icon" variant="ghost" onClick={() => setViewingFilesRowId(row._id)} className="text-blue-500 h-8 w-8" title="Ver PDFs">
                                    <FileText className="w-4 h-4" />
                                  </Button>
                                )}
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => {
                                    const files = processFiles[row._id] || [];
                                    files.forEach(f => {
                                      if (!selectedFilesForAnalysis.some(sf => sf.id === row._id + f.name)) {
                                        setSelectedFilesForAnalysis(prev => [...prev, { id: row._id + f.name, name: f.name, type: 'processo', file: f }]);
                                      }
                                    });
                                    setActiveTab('reports');
                                    toast.success("Arquivos adicionados para análise na aba de Relatórios.");
                                  }}
                                  className="text-purple-600 h-8 w-8 hover:bg-purple-50"
                                  title="Analisar com IA"
                                >
                                  <Brain className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                          </TableCell>
                          {columns.filter(col => filteredData.some(row => row[col] && row[col].trim() !== '')).map(col => (
                            <TableCell key={col} className="min-w-[150px] max-w-[400px] whitespace-normal break-words" title={row[col]}>
                              {isEditing ? (
                                <Input 
                                  value={editingRowData[col] || ''} 
                                  onChange={(e) => setEditingRowData({...editingRowData, [col]: e.target.value})}
                                  className="h-8 text-sm min-w-[150px]"
                                />
                              ) : (
                                row[col]
                              )}
                            </TableCell>
                          ))}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'normativos' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md w-full">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
              <Input
                type="text"
                placeholder="Pesquisar normativos em todas as categorias..."
                value={normativosSearchTerm}
                onChange={(e) => setNormativosSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              <Button 
                variant="outline" 
                onClick={() => {
                  setActiveTab('reports');
                  generateGlobalSummary('normativo');
                }} 
                className="border-purple-600 text-purple-600 hover:bg-purple-50 flex-1 sm:flex-none"
              >
                <Brain className="w-4 h-4 mr-2" />
                Relatório de IA
              </Button>
              <Button variant="outline" onClick={() => exportToCSV('normativos')} className="border-[#1E3A8A] text-[#1E3A8A] hover:bg-blue-50 flex-1 sm:flex-none">
                <Download className="w-4 h-4 mr-2" />
                Exportar Planilha
              </Button>
              <Button variant="outline" onClick={() => exportToPDF('normativos')} className="border-[#16A34A] text-[#16A34A] hover:bg-green-50 flex-1 sm:flex-none">
                <FileText className="w-4 h-4 mr-2" />
                Exportar PDF
              </Button>
              <Button variant="outline" onClick={() => setIsNormativosTrashDialogOpen(true)} className="gap-2">
                <Trash2 className="w-4 h-4" /> Lixeira ({normativosDeletedRows.length})
              </Button>
            </div>
          </div>

          {normativosData.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12 text-slate-500">
                Nenhum normativo encontrado. Comece extraindo documentos na aba &quot;Extração&quot;.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-8">
              {[...NORMATIVO_CATEGORIES, 'Outros'].map(category => {
                const filteredData = normativosData.filter(row => {
                  const rowCat = row['CATEGORIA'] || 'Outros';
                  const matchesCategory = category === 'Outros' 
                    ? !NORMATIVO_CATEGORIES.includes(rowCat) 
                    : rowCat === category;
                  
                  const matchesSearch = !normativosSearchTerm || 
                    Object.values(row).some(val => val && val.toLowerCase().includes(normativosSearchTerm.toLowerCase()));
                  
                  return matchesCategory && matchesSearch;
                });

                if (filteredData.length === 0) return null;

                const activeCols = normativosColumns.filter(col => 
                  filteredData.some(row => row[col] && row[col].trim() !== '')
                );

                return (
                  <Card key={category} className="border-l-4 border-l-purple-500 shadow-sm hover:shadow-md transition-shadow">
                    <CardHeader className="pb-2 bg-slate-50/50">
                      <div className="flex justify-between items-center">
                        <CardTitle className="text-lg font-bold text-purple-900 flex items-center gap-2">
                          <Layers className="w-5 h-5 text-purple-600" />
                          {category}
                        </CardTitle>
                        <div className="flex items-center gap-3">
                          <span className="bg-purple-100 text-purple-700 text-xs px-3 py-1 rounded-full font-bold border border-purple-200">
                            {filteredData.length} {filteredData.length === 1 ? 'documento' : 'documentos'}
                          </span>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0 overflow-x-auto">
                      <Table>
                        <TableHeader className="bg-slate-100/50">
                          <TableRow>
                            <TableHead className="w-[100px] text-center font-bold text-slate-700">Ações</TableHead>
                            {activeCols.map(col => (
                              <TableHead key={col} className="whitespace-nowrap font-bold text-slate-700">{col}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredData.map((row, idx) => (
                            <TableRow key={row._id || idx} className="hover:bg-purple-50/30 transition-colors border-b border-slate-100">
                              <TableCell className="flex justify-center gap-1 py-3">
                                <Button 
                                  size="icon" 
                                  variant="ghost" 
                                  onClick={() => {
                                    const globalIdx = normativosData.findIndex(r => r._id === row._id);
                                    setNormativosDeleteConfirmation({ index: globalIdx });
                                  }} 
                                  className="text-red-500 h-8 w-8 hover:bg-red-50"
                                  title="Excluir"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                                {row._fileUrls && row._fileUrls.length > 0 && (
                                  <Button 
                                    size="icon" 
                                    variant="ghost" 
                                    onClick={() => setViewingFilesRowId(row._id)} 
                                    className="text-blue-600 h-8 w-8 hover:bg-blue-50"
                                    title="Ver Arquivos"
                                  >
                                    <FileText className="w-4 h-4" />
                                  </Button>
                                )}
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => {
                                    const files = normativosFiles[row._id] || [];
                                    files.forEach(f => {
                                      if (!selectedFilesForAnalysis.some(sf => sf.id === row._id + f.name)) {
                                        setSelectedFilesForAnalysis(prev => [...prev, { id: row._id + f.name, name: f.name, type: 'normativo', file: f }]);
                                      }
                                    });
                                    setActiveTab('reports');
                                    toast.success("Arquivos adicionados para análise na aba de Relatórios.");
                                  }}
                                  className="text-purple-600 h-8 w-8 hover:bg-purple-50"
                                  title="Analisar com IA"
                                >
                                  <Brain className="w-4 h-4" />
                                </Button>
                              </TableCell>
                              {activeCols.map(col => (
                                <TableCell key={col} className="min-w-[150px] max-w-[500px] whitespace-normal break-words text-sm text-slate-600 py-3">
                                  {row[col]}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'dashboard' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-[#1E3A8A]">Dashboard de Processos</h2>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => generateDynamicInsights('processo')}
              disabled={isGeneratingProcessInsights || csvData.length === 0}
              className="border-purple-600 text-purple-600 hover:bg-purple-50"
            >
              {isGeneratingProcessInsights ? 'Configurando...' : 'Reconfigurar Dashboard com IA'}
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-500">Total de Processos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{dashboardStats.total}</div>
              </CardContent>
            </Card>
            {processDynamicInsights.map((insight, i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-500">{insight.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`text-3xl font-bold ${insight.color || 'text-slate-900'}`}>{insight.value}</div>
                </CardContent>
              </Card>
            ))}
            {processDynamicInsights.length < 3 && (
              <>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-slate-500">Processos Concluídos</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-emerald-600">
                      {dashboardStats.statusData.find(s => s.name.toLowerCase().includes('concluído') || s.name.toLowerCase().includes('ok'))?.value || 0}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-slate-500">Principais Remetentes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-blue-600">
                      {dashboardStats.remetenteData.length > 0 ? dashboardStats.remetenteData[0].name : '-'}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Processos por Status</CardTitle>
              </CardHeader>
              <CardContent className="h-[300px]">
                {dashboardStats.statusData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dashboardStats.statusData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-500">Sem dados suficientes</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Distribuição Percentual</CardTitle>
              </CardHeader>
              <CardContent className="h-[300px]">
                {dashboardStats.statusData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={dashboardStats.statusData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {dashboardStats.statusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-500">Sem dados suficientes</div>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle>Evolução Temporal de Processos</CardTitle>
                <CardDescription>Volume de processos cadastrados por data.</CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                {csvData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={
                      Object.entries(csvData.reduce((acc, row) => {
                        const date = row['DATA'] || 'Sem Data';
                        acc[date] = (acc[date] || 0) + 1;
                        return acc;
                      }, {} as Record<string, number>))
                      .sort((a, b) => {
                        const dateA = a[0].split('/').reverse().join('-');
                        const dateB = b[0].split('/').reverse().join('-');
                        return new Date(dateA).getTime() - new Date(dateB).getTime();
                      })
                      .map(([name, value]) => ({ name, value }))
                    }>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Area type="monotone" dataKey="value" stroke="#3b82f6" fill="#93c5fd" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-500">Sem dados suficientes</div>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-3">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Panorama Geral do Controle (IA)</CardTitle>
                  <CardDescription>Análise estratégica de todo o conjunto de dados.</CardDescription>
                </div>
                <Button 
                  onClick={generateGeneralSummary} 
                  disabled={isGeneratingGeneralSummary || csvData.length === 0}
                  className="bg-blue-700 hover:bg-blue-800"
                >
                  {isGeneratingGeneralSummary ? 'Analisando...' : 'Gerar Panorama Estratégico'}
                </Button>
              </CardHeader>
              <CardContent>
                {generalSummary ? (
                  <div className="bg-blue-50 p-6 rounded-xl border border-blue-100 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed shadow-sm">
                    {generalSummary}
                  </div>
                ) : (
                  <div className="text-center py-12 text-slate-400 italic">
                    Clique no botão acima para gerar uma análise estratégica dos processos cadastrados.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {activeTab === 'dashboard_normativos' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-[#1E3A8A]">Dashboard de Normativos</h2>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => generateDynamicInsights('normativo')}
              disabled={isGeneratingNormativosInsights || normativosData.length === 0}
              className="border-purple-600 text-purple-600 hover:bg-purple-50"
            >
              {isGeneratingNormativosInsights ? 'Configurando...' : 'Reconfigurar Dashboard com IA'}
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-500">Total de Normativos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{normativosData.length}</div>
              </CardContent>
            </Card>
            {normativosDynamicInsights.map((insight, i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-500">{insight.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`text-3xl font-bold ${insight.color || 'text-slate-900'}`}>{insight.value}</div>
                </CardContent>
              </Card>
            ))}
            {normativosDynamicInsights.length < 3 && (
              <>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-slate-500">Categorias Identificadas</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-emerald-600">
                      {new Set(normativosData.map(n => n['CATEGORIA'])).size}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-slate-500">Última Atualização</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-blue-600">
                      {normativosData.length > 0 ? 'Hoje' : '-'}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="lg:col-span-3">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Panorama Geral de Normativos (IA)</CardTitle>
                  <CardDescription>Análise estratégica da base normativa cadastrada.</CardDescription>
                </div>
                <Button 
                  onClick={generateGeneralNormativosSummary} 
                  disabled={isGeneratingGeneralNormativosSummary || normativosData.length === 0}
                  className="bg-blue-700 hover:bg-blue-800"
                >
                  {isGeneratingGeneralNormativosSummary ? 'Analisando...' : 'Gerar Panorama de Normativos'}
                </Button>
              </CardHeader>
              <CardContent>
                {generalNormativosSummary ? (
                  <div className="bg-blue-50 p-6 rounded-xl border border-blue-100 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed shadow-sm">
                    {generalNormativosSummary}
                  </div>
                ) : (
                  <div className="text-center py-12 text-slate-400 italic">
                    Clique no botão acima para gerar uma análise estratégica dos normativos cadastrados.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Distribuição por Categoria</CardTitle>
              </CardHeader>
              <CardContent className="h-[300px]">
                {normativosData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={
                      Object.entries(normativosData.reduce((acc, n) => {
                        const cat = n['CATEGORIA'] || 'Outros';
                        acc[cat] = (acc[cat] || 0) + 1;
                        return acc;
                      }, {} as Record<string, number>)).map(([name, value]) => ({ name, value }))
                    }>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="value" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-500">Sem dados suficientes</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Mix de Normativos</CardTitle>
              </CardHeader>
              <CardContent className="h-[300px]">
                {normativosData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={
                          Object.entries(normativosData.reduce((acc, n) => {
                            const cat = n['CATEGORIA'] || 'Outros';
                            acc[cat] = (acc[cat] || 0) + 1;
                            return acc;
                          }, {} as Record<string, number>)).map(([name, value]) => ({ name, value }))
                        }
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                        label
                      >
                        {Object.entries(normativosData.reduce((acc, n) => {
                          const cat = n['CATEGORIA'] || 'Outros';
                          acc[cat] = (acc[cat] || 0) + 1;
                          return acc;
                        }, {} as Record<string, number>)).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-500">Sem dados suficientes</div>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle>Histórico de Normativos (por Ano)</CardTitle>
              </CardHeader>
              <CardContent className="h-[300px]">
                {normativosData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={
                      Object.entries(normativosData.reduce((acc, n) => {
                        const ano = n['ANO'] || 'S/A';
                        acc[ano] = (acc[ano] || 0) + 1;
                        return acc;
                      }, {} as Record<string, number>))
                      .sort((a, b) => a[0].localeCompare(b[0]))
                      .map(([name, value]) => ({ name, value }))
                    }>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Area type="monotone" dataKey="value" stroke="#8b5cf6" fill="#ddd6fe" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-500">Sem dados suficientes</div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {activeTab === 'reports' && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-[#1E3A8A]">Emissão de Relatórios</h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <Card className="lg:col-span-2">
              <CardHeader className="bg-indigo-50 border-b border-indigo-100">
                <CardTitle className="flex items-center gap-2 text-indigo-900">
                  <Brain className="w-5 h-5" />
                  Centro de Análise e Relatórios de IA (GRMC)
                </CardTitle>
                <CardDescription>Solicite relatórios, analise documentos ou tire dúvidas com o Cérebro Digital.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 pt-6">
                <Tabs value={reportSubTab} onValueChange={setReportSubTab} className="w-full">
                  <TabsList className="grid w-full grid-cols-2 mb-6">
                    <TabsTrigger value="reports_custom" className="flex items-center gap-2">
                      <Edit className="w-4 h-4" /> Relatórios e Análise
                    </TabsTrigger>
                    <TabsTrigger value="reports_chat" className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4" /> Analista de IA Interativo
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="reports_custom" className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs font-bold text-slate-600">O que você deseja analisar?</Label>
                        <Input 
                          placeholder="Ex: Liste os processos com maior risco de atraso..." 
                          value={customReportPrompt}
                          onChange={(e) => setCustomReportPrompt(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-bold text-slate-600">Base de Dados</Label>
                        <select 
                          className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                          value={customReportType}
                          onChange={(e) => setCustomReportType(e.target.value as 'processo' | 'normativo' | 'combined')}
                        >
                          <option value="processo">Apenas Processos</option>
                          <option value="normativo">Apenas Normativos</option>
                          <option value="combined">Base Integrada (Processos + Normativos)</option>
                        </select>
                      </div>
                    </div>

                    {selectedFilesForAnalysis.length > 0 && (
                      <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg space-y-2">
                        <div className="flex justify-between items-center">
                          <Label className="text-xs font-bold text-amber-800 flex items-center gap-1">
                            <FileUp className="w-3 h-3" /> Documentos Selecionados para Análise ({selectedFilesForAnalysis.length})
                          </Label>
                          <Button variant="ghost" size="sm" onClick={() => setSelectedFilesForAnalysis([])} className="h-6 text-[10px] text-amber-700">Limpar Seleção</Button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {selectedFilesForAnalysis.map(f => (
                            <div key={f.id} className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-amber-200 text-[10px] text-amber-900">
                              <span className="truncate max-w-[120px]">{f.name}</span>
                              <button onClick={() => setSelectedFilesForAnalysis(prev => prev.filter(sf => sf.id !== f.id))}>
                                <Plus className="w-3 h-3 rotate-45 text-amber-500" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button 
                        onClick={generateCustomReport} 
                        disabled={isGeneratingCustomReport || !customReportPrompt.trim()}
                        className="flex-1 bg-indigo-600 hover:bg-indigo-700 shadow-sm"
                      >
                        {isGeneratingCustomReport ? 'Processando...' : 'Gerar Relatório / Analisar'}
                      </Button>
                      <Button 
                        variant="outline"
                        onClick={generateCombinedAnalysis} 
                        disabled={isGeneratingCombinedAnalysis || (csvData.length === 0 && normativosData.length === 0)}
                        className="border-purple-600 text-purple-600 hover:bg-purple-50"
                      >
                        {isGeneratingCombinedAnalysis ? 'Analisando...' : 'Análise Conjunta'}
                      </Button>
                    </div>

                    {customReportResult && (
                      <div className="mt-6 space-y-4 animate-in fade-in zoom-in-95 duration-300">
                        <div className="bg-white p-6 rounded-lg border border-indigo-100 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed shadow-inner min-h-[200px]">
                          {customReportResult}
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={exportCustomReportCSV}>
                            <Download className="w-4 h-4 mr-2" /> Exportar Texto
                          </Button>
                          <Button variant="outline" size="sm" onClick={exportCustomReportPDF} className="text-red-600 border-red-200 hover:bg-red-50">
                            <FileText className="w-4 h-4 mr-2" /> Exportar PDF Profissional
                          </Button>
                        </div>
                      </div>
                    )}

                    {combinedAnalysis && !customReportResult && (
                      <div className="mt-6 space-y-4 animate-in fade-in zoom-in-95 duration-300">
                        <div className="bg-purple-50 p-6 rounded-lg border border-purple-100 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed shadow-inner">
                          {combinedAnalysis}
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => {
                            setCustomReportResult(combinedAnalysis);
                            exportCustomReportPDF();
                          }} className="text-red-600 border-red-200 hover:bg-red-50">
                            <FileText className="w-4 h-4 mr-2" /> Exportar Análise em PDF
                          </Button>
                        </div>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="reports_chat" className="space-y-4">
                    <div className="bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden flex flex-col h-[600px]">
                      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-4 text-white flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="bg-white/20 p-2 rounded-lg backdrop-blur-sm">
                            <Brain className="w-6 h-6" />
                          </div>
                          <div>
                            <h3 className="font-bold text-lg leading-tight">Analista de IA Interativo</h3>
                            <div className="flex items-center gap-2 text-indigo-100 text-xs">
                              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                              Cérebro Digital Online
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Label className="text-[10px] uppercase tracking-wider opacity-70">Contexto:</Label>
                          <select 
                            className="text-xs border-none rounded bg-white/10 hover:bg-white/20 px-2 py-1 text-white focus:ring-0 cursor-pointer transition-colors"
                            value={customReportType}
                            onChange={(e) => setCustomReportType(e.target.value as 'processo' | 'normativo' | 'combined')}
                          >
                            <option value="processo" className="text-slate-800">Processos</option>
                            <option value="normativo" className="text-slate-800">Normativos</option>
                            <option value="combined" className="text-slate-800">Integrada</option>
                          </select>
                        </div>
                      </div>
                      
                      <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50 scrollbar-thin scrollbar-thumb-slate-200">
                        {chatMessages.length === 0 && (
                          <div className="h-full flex flex-col items-center justify-center text-center space-y-4 max-w-md mx-auto">
                            <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 mb-2">
                              <MessageSquare className="w-10 h-10" />
                            </div>
                            <h4 className="text-xl font-bold text-slate-800">Olá! Eu sou o Cérebro Digital da GRMC.</h4>
                            <p className="text-sm text-slate-500">
                              Estou pronto para analisar seus processos e normativos. Pergunte-me sobre prazos, tendências ou peça um resumo de qualquer documento.
                            </p>
                            <div className="grid grid-cols-1 gap-2 w-full mt-4">
                              <button 
                                onClick={() => setChatInput("Quais são os processos com prazos mais críticos?")}
                                className="text-xs p-3 bg-white border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 text-slate-600 text-left transition-all"
                              >
                                &quot;Quais são os processos com prazos mais críticos?&quot;
                              </button>
                              <button 
                                onClick={() => setChatInput("Faça um resumo dos normativos de Contratos.")}
                                className="text-xs p-3 bg-white border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 text-slate-600 text-left transition-all"
                              >
                                &quot;Faça um resumo dos normativos de Contratos.&quot;
                              </button>
                            </div>
                          </div>
                        )}
                        {chatMessages.map((msg, i) => (
                          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                            <div className={`flex gap-3 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                                msg.role === 'user' ? 'bg-indigo-100 text-indigo-600' : 'bg-white border border-slate-200 text-purple-600 shadow-sm'
                              }`}>
                                {msg.role === 'user' ? <Edit className="w-4 h-4" /> : <Brain className="w-4 h-4" />}
                              </div>
                              <div className={`p-4 rounded-2xl text-sm leading-relaxed shadow-sm ${
                                msg.role === 'user' 
                                  ? 'bg-indigo-600 text-white rounded-tr-none' 
                                  : 'bg-white text-slate-800 rounded-tl-none border border-slate-100'
                              }`}>
                                {msg.content}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="p-4 bg-white border-t border-slate-100">
                        <div className="flex gap-2 bg-slate-100 p-2 rounded-xl focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-500 transition-all">
                          <Input 
                            value={chatInput} 
                            onChange={(e) => setChatInput(e.target.value)} 
                            onKeyDown={(e) => e.key === 'Enter' && !isGeneratingCustomReport && handleChatSubmit()}
                            placeholder="Digite sua dúvida técnica ou peça uma análise..." 
                            className="flex-1 border-none bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                            disabled={isGeneratingCustomReport}
                          />
                          <Button 
                            onClick={handleChatSubmit} 
                            disabled={isGeneratingCustomReport || !chatInput.trim()}
                            className="bg-indigo-600 hover:bg-indigo-700 rounded-lg px-6"
                          >
                            {isGeneratingCustomReport ? (
                              <div className="flex items-center gap-2">
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="hidden sm:inline">Enviar</span>
                                <Send className="w-4 h-4" />
                              </div>
                            )}
                          </Button>
                        </div>
                        <p className="text-[10px] text-center text-slate-400 mt-2">
                          O Cérebro Digital utiliza inteligência artificial para analisar dados da GRMC. Verifique informações críticas.
                        </p>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            <div className="space-y-8">
              <Card>
                <CardHeader className="bg-slate-900 text-white rounded-t-xl">
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Resumos Globais (Cérebro Digital)
                  </CardTitle>
                  <CardDescription className="text-slate-300">Visão estratégica consolidada.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                  <div className="grid grid-cols-2 gap-4">
                    <Button 
                      onClick={() => generateGlobalSummary('processo')} 
                      disabled={isGeneratingGlobalProcessSummary || csvData.length === 0}
                      className="bg-blue-600 hover:bg-blue-700 text-xs h-9"
                    >
                      {isGeneratingGlobalProcessSummary ? 'Processando...' : 'Global Processos'}
                    </Button>
                    <Button 
                      onClick={() => generateGlobalSummary('normativo')} 
                      disabled={isGeneratingGlobalNormativoSummary || normativosData.length === 0}
                      className="bg-purple-600 hover:bg-purple-700 text-xs h-9"
                    >
                      {isGeneratingGlobalNormativoSummary ? 'Processando...' : 'Global Normativos'}
                    </Button>
                  </div>

                  {globalProcessSummary && (
                    <div className="space-y-2">
                      <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 text-[11px] text-slate-700 whitespace-pre-wrap line-clamp-4">
                        {globalProcessSummary}
                      </div>
                      <Button variant="ghost" size="sm" className="text-blue-600 h-7 text-[10px]" onClick={() => {
                        setCustomReportResult(globalProcessSummary);
                        exportCustomReportPDF();
                      }}>
                        <Download className="w-3 h-3 mr-1" /> Exportar PDF Completo
                      </Button>
                    </div>
                  )}

                  {globalNormativoSummary && (
                    <div className="space-y-2">
                      <div className="bg-purple-50 p-4 rounded-lg border border-purple-100 text-[11px] text-slate-700 whitespace-pre-wrap line-clamp-4">
                        {globalNormativoSummary}
                      </div>
                      <Button variant="ghost" size="sm" className="text-purple-600 h-7 text-[10px]" onClick={() => {
                        setCustomReportResult(globalNormativoSummary);
                        exportCustomReportPDF();
                      }}>
                        <Download className="w-3 h-3 mr-1" /> Exportar PDF Completo
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="bg-emerald-50 border-b border-emerald-100">
                  <CardTitle className="flex items-center gap-2 text-emerald-900">
                    <Download className="w-5 h-5" />
                    Exportação de Dados Brutos
                  </CardTitle>
                  <CardDescription>Bases completas em formatos estruturados.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Processos</h4>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => exportToCSV('processos')}>
                        <Download className="w-3 h-3 mr-2" /> CSV
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => exportToPDF('processos')}>
                        <FileText className="w-3 h-3 mr-2" /> PDF
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Normativos</h4>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => exportToCSV('normativos')}>
                        <Download className="w-3 h-3 mr-2" /> CSV
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => exportToPDF('normativos')}>
                        <FileText className="w-3 h-3 mr-2" /> PDF
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

            <Card>
              <CardHeader className="bg-amber-50 border-b border-amber-100">
                <CardTitle className="flex items-center gap-2 text-amber-900">
                  <Edit className="w-5 h-5" />
                  Resumos Executivos Individuais
                </CardTitle>
                <CardDescription>Gere resumos técnicos para cada registro.</CardDescription>
                <div className="mt-4 relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                  <Input 
                    placeholder="Filtrar registros..." 
                    className="pl-8 bg-white"
                    value={summarySearchTerm}
                    onChange={(e) => setSummarySearchTerm(e.target.value)}
                  />
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <Tabs defaultValue="processos_res">
                  <TabsList className="grid w-full grid-cols-2 mb-4">
                    <TabsTrigger value="processos_res">Processos</TabsTrigger>
                    <TabsTrigger value="normativos_res">Normativos</TabsTrigger>
                  </TabsList>
                  <TabsContent value="processos_res">
                    <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                      {csvData.length === 0 ? (
                        <div className="text-center py-8 text-slate-500">Nenhum processo cadastrado.</div>
                      ) : (
                        csvData
                          .filter(row => !summarySearchTerm || Object.values(row).some(v => v?.toLowerCase().includes(summarySearchTerm.toLowerCase())))
                          .map((row, idx) => (
                          <div key={row._id || idx} className="p-3 border rounded-lg hover:bg-slate-50 transition-colors">
                            <div className="flex justify-between items-start gap-4">
                              <div className="space-y-1 flex-1">
                                <div className="font-semibold text-sm text-slate-900">{row['Nº E-DOC'] || 'Sem Número'}</div>
                                <div className="text-xs text-slate-500 line-clamp-1">{row['ASSUNTO'] || 'Sem Assunto'}</div>
                              </div>
                              <div className="flex gap-2">
                                {!summaries[row._id] ? (
                                  <Button 
                                    size="sm" 
                                    variant="outline" 
                                    onClick={() => generateProcessSummary(row)}
                                    disabled={isGeneratingSummary[row._id]}
                                    className="h-8 text-xs border-amber-600 text-amber-600 hover:bg-amber-50"
                                  >
                                    {isGeneratingSummary[row._id] ? 'Gerando...' : 'Gerar Resumo'}
                                  </Button>
                                ) : (
                                  <Button 
                                    size="sm" 
                                    variant="outline" 
                                    onClick={() => downloadSummaryPDF(row, summaries[row._id])}
                                    className="h-8 text-xs border-emerald-600 text-emerald-600 hover:bg-emerald-50"
                                  >
                                    <Download className="w-3 h-3 mr-1" /> PDF
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </TabsContent>
                  <TabsContent value="normativos_res">
                    <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                      {normativosData.length === 0 ? (
                        <div className="text-center py-8 text-slate-500">Nenhum normativo cadastrado.</div>
                      ) : (
                        normativosData
                          .filter(row => !summarySearchTerm || Object.values(row).some(v => v?.toLowerCase().includes(summarySearchTerm.toLowerCase())))
                          .map((row, idx) => (
                          <div key={row._id || idx} className="p-3 border rounded-lg hover:bg-slate-50 transition-colors">
                            <div className="flex justify-between items-start gap-4">
                              <div className="space-y-1 flex-1">
                                <div className="font-semibold text-sm text-slate-900">{row['TÍTULO'] || 'Sem Título'}</div>
                                <div className="text-xs text-slate-500 line-clamp-1">{row['CATEGORIA'] || 'Sem Categoria'}</div>
                              </div>
                              <div className="flex gap-2">
                                {!normativosSummaries[row._id] ? (
                                  <Button 
                                    size="sm" 
                                    variant="outline" 
                                    onClick={() => generateProcessSummary(row, 'normativo')}
                                    disabled={isGeneratingNormativoSummary[row._id]}
                                    className="h-8 text-xs border-amber-600 text-amber-600 hover:bg-amber-50"
                                  >
                                    {isGeneratingNormativoSummary[row._id] ? 'Gerando...' : 'Gerar Resumo'}
                                  </Button>
                                ) : (
                                  <Button 
                                    size="sm" 
                                    variant="outline" 
                                    onClick={() => downloadSummaryPDF(row, normativosSummaries[row._id])}
                                    className="h-8 text-xs border-emerald-600 text-emerald-600 hover:bg-emerald-50"
                                  >
                                    <Download className="w-3 h-3 mr-1" /> PDF
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
      )}

      <Dialog open={!!viewingFilesRowId} onOpenChange={(open) => !open && setViewingFilesRowId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Arquivos do Documento</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-4">
            {(() => {
              const row = csvData.find(r => r._id === viewingFilesRowId) || normativosData.find(r => r._id === viewingFilesRowId);
              const fileUrls = (row?._fileUrls as unknown as string[]) || [];
              
              if (fileUrls.length === 0) {
                return <p className="text-sm text-slate-500 text-center">Nenhum arquivo armazenado para este registro.</p>;
              }

              return fileUrls.map((url: string, idx: number) => {
                // Try to extract filename from URL or use a default
                let fileName = "Documento";
                try {
                  const decodedUrl = decodeURIComponent(url);
                  const parts = decodedUrl.split('/');
                  const lastPart = parts[parts.length - 1].split('?')[0];
                  fileName = lastPart.split('%2F').pop() || lastPart;
                } catch {
                  fileName = `Arquivo ${idx + 1}`;
                }

                return (
                  <div key={idx} className="flex items-center justify-between p-2 border rounded hover:bg-slate-50">
                    <span className="text-sm truncate max-w-[250px]" title={fileName}>{fileName}</span>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}>
                        <ExternalLink className="w-4 h-4 mr-2" /> Abrir
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => {
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = fileName;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                      }}>
                        <Download className="w-4 h-4 mr-2" /> Baixar
                      </Button>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!duplicateResolution} onOpenChange={(open) => !open && setDuplicateResolution(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Processo Duplicado Encontrado</DialogTitle>
            <DialogDescription>
              O processo com este Nº E-DOC já existe no controle. O que deseja fazer?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2 mt-4">
            <Button variant="outline" onClick={() => duplicateResolution && saveExtractionToControl(duplicateResolution.extractionId)}>
              Criar Nova Linha (Nova Parte)
            </Button>
            <Button onClick={() => duplicateResolution && saveExtractionToControl(duplicateResolution.extractionId, duplicateResolution.existingIndex)}>
              Atualizar Linha Existente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirmation} onOpenChange={() => setDeleteConfirmation(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir este processo? Ele será movido para a lixeira.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmation(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmDeleteRow}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Trash Dialog */}
      <Dialog open={isTrashDialogOpen} onOpenChange={setIsTrashDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Lixeira</DialogTitle>
            <DialogDescription>
              Visualize e restaure processos excluídos.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[400px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ações</TableHead>
                  {columns.map(col => <TableHead key={col}>{col}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {deletedRows.map((row, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <Button size="sm" onClick={() => restoreRow(index)}>Restaurar</Button>
                    </TableCell>
                    {columns.map(col => <TableCell key={col}>{row[col]}</TableCell>)}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="destructive" onClick={() => setIsEmptyTrashConfirmationOpen(true)} disabled={deletedRows.length === 0}>Esvaziar Lixeira</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Empty Trash Confirmation Dialog */}
      <Dialog open={isEmptyTrashConfirmationOpen} onOpenChange={setIsEmptyTrashConfirmationOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Esvaziamento</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja esvaziar a lixeira permanentemente? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEmptyTrashConfirmationOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={emptyTrash}>Esvaziar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Normativos Delete Confirmation Dialog */}
      <Dialog open={!!normativosDeleteConfirmation} onOpenChange={() => setNormativosDeleteConfirmation(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão de Normativo</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir este normativo? Ele será movido para a lixeira.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNormativosDeleteConfirmation(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmDeleteNormativoRow}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Normativos Trash Dialog */}
      <Dialog open={isNormativosTrashDialogOpen} onOpenChange={setIsNormativosTrashDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Lixeira de Normativos</DialogTitle>
            <DialogDescription>
              Visualize e restaure normativos excluídos.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[400px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ações</TableHead>
                  {normativosColumns.map(col => <TableHead key={col}>{col}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {normativosDeletedRows.map((row, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <Button size="sm" onClick={() => restoreNormativoRow(index)}>Restaurar</Button>
                    </TableCell>
                    {normativosColumns.map(col => <TableCell key={col}>{row[col]}</TableCell>)}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="destructive" onClick={() => setIsEmptyNormativosTrashConfirmationOpen(true)} disabled={normativosDeletedRows.length === 0}>Esvaziar Lixeira</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Empty Normativos Trash Confirmation Dialog */}
      <Dialog open={isEmptyNormativosTrashConfirmationOpen} onOpenChange={setIsEmptyNormativosTrashConfirmationOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Esvaziamento</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja esvaziar a lixeira de normativos permanentemente? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEmptyNormativosTrashConfirmationOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={emptyNormativosTrash}>Esvaziar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
