import { Edge, Node } from '@xyflow/react';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

interface ExecutionLog {
  id: number;
  timestamp: string;
  nodeId: string;
  status: 'running' | 'success' | 'error' | 'warning';
  message: string;
  data?: any;
  error?: any;
}

interface McpToolState {
  nodes: Node[];
  edges: Edge[];
  selectedNode: string | null;
  isExecuting: boolean;
  executionLogs: ExecutionLog[];

  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  addNode: (node: Partial<Node>) => void;
  updateNode: (nodeId: string, data: any) => void;
  deleteNode: (nodeId: string) => void;
  setSelectedNode: (nodeId: string | null) => void;
  addExecutionLog: (log: Partial<ExecutionLog>) => void;
  clearExecutionLogs: () => void;
  setIsExecuting: (isExecuting: boolean) => void;
  serializeToLangGraph: () => any;
  loadFromLangGraph: (config: any) => void;
}

const useMcpToolStore = create<McpToolState>()(
  immer((set, get) => ({
    nodes: [],
    edges: [],
    selectedNode: null,
    isExecuting: false,
    executionLogs: [],

    setNodes: (nodes) =>
      set((state) => {
        state.nodes = nodes;
      }),

    setEdges: (edges) =>
      set((state) => {
        state.edges = edges;
      }),

    addNode: (node) =>
      set((state) => {
        state.nodes.push({
          id: `node-${Date.now()}`,
          position: { x: 250, y: 100 },
          type: 'default',
          data: {},
          ...node
        } as Node);
      }),

    updateNode: (nodeId, data) =>
      set((state) => {
        const node = state.nodes.find((n) => n.id === nodeId);
        if (node) {
          node.data = { ...node.data, ...data };
        }
      }),

    deleteNode: (nodeId) =>
      set((state) => {
        state.nodes = state.nodes.filter((n) => n.id !== nodeId);
        state.edges = state.edges.filter(
          (e) => e.source !== nodeId && e.target !== nodeId
        );
      }),

    setSelectedNode: (nodeId) =>
      set((state) => {
        state.selectedNode = nodeId;
      }),

    addExecutionLog: (log) =>
      set((state) => {
        state.executionLogs.push({
          id: Date.now(),
          timestamp: new Date().toISOString(),
          nodeId: log.nodeId || 'system',
          status: log.status || 'running',
          message: log.message || '',
          ...log
        });
      }),

    clearExecutionLogs: () =>
      set((state) => {
        state.executionLogs = [];
      }),

    setIsExecuting: (isExecuting) =>
      set((state) => {
        state.isExecuting = isExecuting;
      }),

    serializeToLangGraph: () => {
      const { nodes, edges } = get();
      return {
        nodes: nodes.map((node) => ({
          id: node.id,
          type: node.type,
          data: node.data
        })),
        edges: edges.map((edge) => ({
          source: edge.source,
          target: edge.target,
          condition: edge.data?.condition
        }))
      };
    },

    loadFromLangGraph: (config) =>
      set((state) => {
        state.nodes = config.nodes.map((node: any, index: number) => ({
          ...node,
          position: { x: 100 + index * 200, y: 100 }
        }));
        state.edges = config.edges.map((edge: any, index: number) => ({
          id: `edge-${index}`,
          ...edge
        }));
      })
  }))
);

export default useMcpToolStore;
