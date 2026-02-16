import {
  ClearOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  SaveOutlined
} from '@ant-design/icons';
import {
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button, Card, Drawer, Space, message } from 'antd';
import axios from 'axios';
import React, { useCallback } from 'react';
import HttpNode, { type HttpNodeData, type HttpNodeType } from '../components/HttpNode';
import useMcpToolStore from '../stores/mcpToolStore';
import './McpTool.css';

// 注册自定义节点类型
const nodeTypes = {
  httpNode: HttpNode
};

/**
 * MCP Tool 页面
 * 基于 React-Flow 的可视化工作流编辑器
 */
const McpTool = () => {
  const {
    nodes: storeNodes,
    edges: storeEdges,
    setNodes: setStoreNodes,
    setEdges: setStoreEdges,
    updateNode,
    deleteNode,
    addExecutionLog,
    clearExecutionLogs,
    executionLogs,
    isExecuting,
    setIsExecuting
  } = useMcpToolStore();

  const [nodes, setNodes, onNodesChange] = useNodesState(storeNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(storeEdges);
  const [logDrawerVisible, setLogDrawerVisible] = React.useState(false);

  // 同步到 store
  React.useEffect(() => {
    setStoreNodes(nodes);
  }, [nodes, setStoreNodes]);

  React.useEffect(() => {
    setStoreEdges(edges);
  }, [edges, setStoreEdges]);

  // 连接节点
  const onConnect = useCallback(
    (params: Connection) => {
      const newEdge = {
        ...params,
        animated: true,
        style: { stroke: 'rgb(252, 227, 238)', strokeWidth: 2 }
      };
      setEdges((eds) => addEdge(newEdge, eds));
    },
    [setEdges]
  );

  // 添加 HTTP 节点
  const addHttpNode = () => {
    const newNode = {
      id: `http-${Date.now()}`,
      type: 'httpNode',
      position: {
        x: Math.random() * 400 + 100,
        y: Math.random() * 300 + 100
      },
      data: {
        method: 'GET',
        url: '',
        headers: '{}',
        body: '{}',
        onChange: handleNodeDataChange,
        onDelete: handleNodeDelete
      }
    };

    setNodes((nds) => [...nds, newNode]);
    message.success('已添加 HTTP 节点');
  };

  // 更新节点数据
  const handleNodeDataChange = (nodeId: string, newData: Partial<HttpNodeData>) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          return {
            ...node,
            data: { ...node.data, ...newData }
          };
        }
        return node;
      })
    );
    updateNode(nodeId, newData);
  };

  // 删除节点
  const handleNodeDelete = (nodeId: string) => {
    setNodes((nds) => nds.filter((node) => node.id !== nodeId));
    setEdges((eds) =>
      eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId)
    );
    deleteNode(nodeId);
    message.success('节点已删除');
  };

  // 执行工作流
  const executeWorkflow = async () => {
    if (nodes.length === 0) {
      message.warning('请先添加节点');
      return;
    }

    setIsExecuting(true);
    clearExecutionLogs();
    message.info('开始执行工作流...');

    try {
      // 按照拓扑顺序执行节点
      const executionOrder = getExecutionOrder(nodes, edges);

      for (const nodeId of executionOrder) {
        const node = nodes.find((n) => n.id === nodeId);

        if (node && node.type === 'httpNode') {
          await executeHttpNode(node);
        }
      }

      message.success('工作流执行完成');
      setLogDrawerVisible(true);
    } catch (error: any) {
      console.error('Workflow execution error:', error);
      message.error('执行失败：' + error.message);
      addExecutionLog({
        nodeId: 'system',
        status: 'error',
        message: error.message
      });
    } finally {
      setIsExecuting(false);
    }
  };

  // 执行 HTTP 节点
  const executeHttpNode = async (node: HttpNodeType) => {
    const { method, url, headers, body } = node.data;

    if (!url) {
      addExecutionLog({
        nodeId: node.id,
        status: 'warning',
        message: 'URL 为空，跳过执行'
      });
      return;
    }

    addExecutionLog({
      nodeId: node.id,
      status: 'running',
      message: `执行 ${method} ${url}`
    });

    try {
      let parsedHeaders = {};
      let parsedBody = {};

      try {
        parsedHeaders = headers ? JSON.parse(headers) : {};
      } catch (e) {
        throw new Error('Headers JSON 格式错误');
      }

      try {
        parsedBody = body && ['POST', 'PUT', 'PATCH'].includes(method || '')
          ? JSON.parse(body)
          : undefined;
      } catch (e) {
        throw new Error('Body JSON 格式错误');
      }

      const response = await axios({
        method: (method || 'GET').toLowerCase(),
        url,
        headers: parsedHeaders,
        data: parsedBody,
        timeout: 10000
      });

      addExecutionLog({
        nodeId: node.id,
        status: 'success',
        message: `成功: ${response.status} ${response.statusText}`,
        data: response.data
      });
    } catch (error: any) {
      addExecutionLog({
        nodeId: node.id,
        status: 'error',
        message: `失败: ${error.message}`,
        error: error.response?.data
      });
      throw error;
    }
  };

  // 获取执行顺序（简单的拓扑排序）
  const getExecutionOrder = (nodes: Node[], edges: Edge[]) => {
    // 简化版：如果没有边，按照节点顺序执行
    if (edges.length === 0) {
      return nodes.map((n) => n.id);
    }

    // TODO: 实现完整的拓扑排序
    // 这里简化为按照连接顺序执行
    const visited = new Set();
    const order: string[] = [];

    const visit = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);

      // 先访问依赖节点
      const incomingEdges = edges.filter((e) => e.target === nodeId);
      incomingEdges.forEach((edge) => visit(edge.source));

      order.push(nodeId);
    };

    nodes.forEach((node) => visit(node.id));
    return order;
  };

  // 清空画布
  const clearCanvas = () => {
    setNodes([]);
    setEdges([]);
    clearExecutionLogs();
    message.success('画布已清空');
  };

  // 保存工作流
  const saveWorkflow = () => {
    const workflow = {
      nodes: nodes.map(({ id, type, position, data }) => ({
        id,
        type,
        position,
        data: {
          method: data.method,
          url: data.url,
          headers: data.headers,
          body: data.body
        }
      })),
      edges
    };

    const json = JSON.stringify(workflow, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workflow-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    message.success('工作流已保存');
  };

  return (
    <div className="mcp-tool-container">
      <Card className="workflow-card" bodyStyle={{ padding: 0 }}>
        <div className="workflow-header">
          <h2>🔧 MCP 工作流编辑器</h2>
          <Space>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={addHttpNode}
            >
              添加 HTTP 节点
            </Button>
            <Button
              icon={<PlayCircleOutlined />}
              onClick={executeWorkflow}
              loading={isExecuting}
            >
              执行工作流
            </Button>
            <Button icon={<SaveOutlined />} onClick={saveWorkflow}>
              保存
            </Button>
            <Button icon={<ClearOutlined />} onClick={clearCanvas} danger>
              清空
            </Button>
          </Space>
        </div>

        <div className="reactflow-wrapper">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            fitView
            className="reactflow-canvas"
          >
            <Background color="#f0f0f0" gap={16} />
            <Controls />
            <MiniMap
              style={{ background: 'rgb(252, 227, 238)' }}
              nodeColor="#fff"
              maskColor="rgba(252, 227, 238, 0.2)"
            />

            <Panel position="top-left" className="workflow-panel">
              <div className="panel-info">
                <div>节点数: {nodes.length}</div>
                <div>连接数: {edges.length}</div>
              </div>
            </Panel>
          </ReactFlow>
        </div>
      </Card>

      {/* 执行日志抽屉 */}
      <Drawer
        title="执行日志"
        placement="right"
        width={400}
        open={logDrawerVisible}
        onClose={() => setLogDrawerVisible(false)}
      >
        <div className="execution-logs">
          {executionLogs.length === 0 ? (
            <div className="empty-logs">暂无执行日志</div>
          ) : (
            executionLogs.map((log, index) => (
              <div key={index} className={`log-item log-${log.status}`}>
                <div className="log-header">
                  <span className="log-node">节点: {log.nodeId}</span>
                  <span className="log-time">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div className="log-message">{log.message}</div>
                {log.data && (
                  <pre className="log-data">
                    {JSON.stringify(log.data, null, 2)}
                  </pre>
                )}
              </div>
            ))
          )}
        </div>
      </Drawer>
    </div>
  );
};

export default McpTool;
