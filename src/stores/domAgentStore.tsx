import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

interface Message {
  id: number;
  timestamp: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  thinking?: string;
}

interface FileTask {
  path: string;
  description: string;
  dependencies: string[];
  priority: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

interface ProjectPlan {
  projectPlanText: string;
  techStackSummary: string;
  files: FileTask[];
}

interface FileContent {
  path: string;
  code: string;
  dependencies: string[];
}

interface Classification {
  intent: 'task' | 'chat' | 'question';
  confidence: number;
  reason: string;
}

interface DomAgentState {
  messages: Message[];
  intent: 'task' | 'chat' | 'question' | null;
  projectPlan: ProjectPlan | null;
  currentFileIndex: number;
  generatedFiles: Record<string, FileContent>;
  activeFile: string;
  iterationCount: number;
  loading: boolean;
  ragResults: any[];
  summary: string | null;
  error: string | null;
  thinkingProcess: string;
  workflowStatus: Record<string, string>;
  classification?: Classification;

  addMessage: (message: Partial<Message>) => void;
  setIntent: (intent: 'task' | 'chat' | 'question') => void;
  setProjectPlan: (plan: ProjectPlan) => void;
  setCurrentFileIndex: (index: number) => void;
  addGeneratedFile: (filePath: string, content: string, dependencies?: string[]) => void;
  setActiveFile: (filePath: string) => void;
  updateFileStatus: (filePath: string, status: FileTask['status']) => void;
  setIterationCount: (count: number) => void;
  setLoading: (loading: boolean) => void;
  setRagResults: (results: any[]) => void;
  setSummary: (summary: string | null) => void;
  setError: (error: string | null) => void;
  setThinkingProcess: (process: string) => void;
  setWorkflowStatus: (status: Record<string, string>) => void;
  clearMessages: () => void;
  resetState: () => void;
}

const useDomAgentStore = create<DomAgentState>()(
  immer((set) => ({
    messages: [],
    intent: null,
    projectPlan: null,
    currentFileIndex: 0,
    generatedFiles: {},
    activeFile: 'App.js',
    iterationCount: 0,
    loading: false,
    ragResults: [],
    summary: null,
    error: null,
    thinkingProcess: '',
    workflowStatus: {},

    addMessage: (message) =>
      set((state) => {
        state.messages.push({
          id: Date.now(),
          timestamp: new Date().toISOString(),
          role: message.role || 'user',
          content: message.content || '',
          ...message
        });
      }),

    setIntent: (intent) =>
      set((state) => {
        state.intent = intent;
      }),

    setProjectPlan: (plan) =>
      set((state) => {
        state.projectPlan = plan;
        state.currentFileIndex = 0;
      }),

    setCurrentFileIndex: (index) =>
      set((state) => {
        state.currentFileIndex = index;
      }),

    addGeneratedFile: (filePath, content, dependencies = []) =>
      set((state) => {
        state.generatedFiles[filePath] = {
          path: filePath,
          code: content,
          dependencies
        };
      }),

    setActiveFile: (filePath) =>
      set((state) => {
        state.activeFile = filePath;
      }),

    updateFileStatus: (filePath, status) =>
      set((state) => {
        const file = state.projectPlan?.files.find(f => f.path === filePath);
        if (file) {
          file.status = status;
        }
      }),

    setIterationCount: (count) =>
      set((state) => {
        state.iterationCount = count;
      }),

    setLoading: (loading) =>
      set((state) => {
        state.loading = loading;
      }),

    setRagResults: (results) =>
      set((state) => {
        state.ragResults = results;
      }),

    setSummary: (summary) =>
      set((state) => {
        state.summary = summary;
      }),

    setError: (error) =>
      set((state) => {
        state.error = error;
      }),

    setThinkingProcess: (process) =>
      set((state) => {
        state.thinkingProcess = process;
      }),

    setWorkflowStatus: (status) =>
      set((state) => {
        state.workflowStatus = { ...state.workflowStatus, ...status };
      }),

    clearMessages: () =>
      set((state) => {
        state.messages = [];
      }),

    resetState: () =>
      set((state) => {
        state.projectPlan = null;
        state.currentFileIndex = 0;
        state.generatedFiles = {};
        state.activeFile = 'App.js';
        state.iterationCount = 0;
        state.error = null;
        state.summary = null;
        state.thinkingProcess = '';
        state.workflowStatus = {};
      })
  }))
);

export default useDomAgentStore;
