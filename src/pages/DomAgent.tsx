import { ClearOutlined, CodeOutlined, EyeOutlined, FileOutlined, SendOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { SandpackCodeEditor, SandpackLayout, SandpackPreview, SandpackProvider, useSandpack } from '@codesandbox/sandpack-react';
import { githubLight } from '@codesandbox/sandpack-themes';
import { App as AntApp, Button, Card, Collapse, Input, Segmented, Spin, Tag } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { runDomAgentWorkflow } from '../services/langGraphService';
import { getRandomCases } from '../services/ragService';
import useDomAgentStore from '../stores/domAgentStore';
import './DomAgent.css';

const { TextArea } = Input;

interface Message {
  role: 'user' | 'assistant';
  content: string;
  thinking?: string; // 新增思考过程字段
}

/**
 * Sandpack 错误监听器组件
 * 监听并收集 Sandpack 的各种错误类型
 */
const SandpackErrorListener = ({ onError }: { onError: (errors: any[]) => void }) => {
  const { listen, sandpack } = useSandpack();
  const errorsRef = useRef<any[]>([]);

  useEffect(() => {
    const unsubscribe = listen((msg: any) => {
      // 捕获各种类型的错误（使用宽松的类型检查以适配 Sandpack 的多种错误格式）
      const msgType = String(msg.type || '');
      const hasError = msgType.includes('error') ||
        (msg.action && String(msg.action).includes('error')) ||
        msg.error ||
        (msg.status === 'error');

      if (hasError) {
        console.log('[Sandpack Error Captured]', msg);

        // 构建标准化的错误对象
        const errorInfo = {
          type: msgType,
          message: msg.message || msg.title || msg.error?.message || String(msg.error || ''),
          path: msg.path || '',
          line: msg.line || null,
          column: msg.column || null,
          payload: msg.payload || msg,
          timestamp: Date.now()
        };

        // 避免重复错误
        const isDuplicate = errorsRef.current.some(
          e => e.message === errorInfo.message && e.path === errorInfo.path
        );

        if (!isDuplicate && errorInfo.message) {
          errorsRef.current.push(errorInfo);
          onError([...errorsRef.current]);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [listen, onError]);

  // 监听 Sandpack 状态中的错误
  useEffect(() => {
    if (sandpack?.error) {
      console.log('[Sandpack State Error]', sandpack.error);
      const errorInfo = {
        type: 'state-error',
        message: sandpack.error.message || String(sandpack.error),
        path: '',
        line: null,
        column: null,
        payload: sandpack.error,
        timestamp: Date.now()
      };

      const isDuplicate = errorsRef.current.some(
        e => e.message === errorInfo.message
      );

      if (!isDuplicate) {
        errorsRef.current.push(errorInfo);
        onError([...errorsRef.current]);
      }
    }
  }, [sandpack?.error, onError]);

  return null;
};

/**
 * DOM Agent 页面（升级版）
 * 支持多轮思考和多文件生成
 */
const DomAgent = () => {
  const { message } = AntApp.useApp();
  const {
    messages,
    projectPlan,
    generatedFiles,
    activeFile,
    loading,
    thinkingProcess,
    workflowStatus,
    ragResults,
    addMessage,
    setProjectPlan,
    addGeneratedFile,
    setActiveFile,
    setLoading,
    setThinkingProcess,
    setWorkflowStatus,
    setRagResults,
    clearMessages,
    resetState
  } = useDomAgentStore();

  const [inputValue, setInputValue] = useState('');
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview');
  const [sandpackErrors, setSandpackErrors] = useState<any[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 自动滚动到最新消息
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 获取建议提示
  const getSuggestions = () => {
    const cases = getRandomCases(3);
    return cases.map(c => c.prompt);
  };

  const [suggestions] = useState(getSuggestions());

  // 发送消息
  const handleSendMessage = async () => {
    if (!inputValue.trim()) {
      message.warning('请输入内容');
      return;
    }

    const userMessage: Message = {
      role: 'user',
      content: inputValue.trim()
    };

    addMessage(userMessage);
    setInputValue('');
    setLoading(true);
    setThinkingProcess('');
    setWorkflowStatus({});

    try {
      // 构建初始状态
      const state = {
        messages: [...messages, userMessage],
        generatedFiles: generatedFiles || {},
        currentFileIndex: 0,
        iterationCount: 0,
        ragResults: []
      };

      let currentThinking = '';

      // 执行工作流（传递 Sandpack 错误用于精确路径修复）
      const result = await runDomAgentWorkflow(
        state,
        (update: any) => {
          setWorkflowStatus({
            [update.step]: update.status
          });

          // 处理思考过程
          if (update.thinking) {
            currentThinking += update.thinking;
            setThinkingProcess(currentThinking);
          }

          // 更新数据
          if (update.status === 'completed') {
            if (update.step === 'rag') {
              setRagResults(update.data || []);
            } else if (update.step === 'planner') {
              setProjectPlan(update.data);
            } else if (update.step === 'executor' && update.data) {
              addGeneratedFile(
                update.data.filePath,
                update.data.code,
                []
              );
              // 如果是第一个文件，设置为激活状态
              if (!activeFile || activeFile === 'App.js') {
                setActiveFile(update.data.filePath);
              }
            }
          }
        },
        sandpackErrors // 传递 Sandpack 错误用于精确路径修复
      );

      // 更新最终消息
      if (result.messages.length > messages.length + 1) {
        const assistantMessage = result.messages[result.messages.length - 1];
        addMessage(assistantMessage);
      }

    } catch (error: any) {
      console.error('Workflow error:', error);
      message.error('生成失败：' + error.message);
      addMessage({
        role: 'assistant',
        content: '抱歉，出现了错误。请稍后重试。'
      });
    } finally {
      setLoading(false);
      setThinkingProcess('');
    }
  };

  // 使用建议
  const handleUseSuggestion = (suggestion: string) => {
    setInputValue(suggestion);
  };

  // 清空对话
  const handleClear = () => {
    clearMessages();
    resetState();
    setRagResults([]);
    setSandpackErrors([]); // 清空 Sandpack 错误
    message.success('已清空对话');
    setActiveFile('App.js');
  };

  // 准备 Sandpack 文件
  const sandpackFiles: Record<string, string> = {};

  if (Object.keys(generatedFiles).length > 0) {
    // 添加所有生成的文件
    Object.entries(generatedFiles).forEach(([path, fileContent]) => {
      sandpackFiles[`/${path}`] = fileContent.code;
    });
  } else {
    // 默认文件
    sandpackFiles['/App.js'] = `import React from 'react';\n\nexport default function App() {\n  return (\n    <div style={{ padding: "40px", textAlign: "center" }}>\n      <h2>👋 欢迎使用 DOM Agent</h2>\n      <p>请在左侧输入您的想法，AI 将为您生成完整的 React 项目</p>\n    </div>\n  );\n}`;
  }

  // 文件标签页
  const fileTabItems = Object.keys(generatedFiles).length > 0
    ? Object.keys(generatedFiles).map(filePath => ({
      key: filePath,
      label: (
        <span>
          <FileOutlined style={{ marginRight: 4 }} />
          {filePath}
        </span>
      ),
    }))
    : [];

  return (
    <div className="dom-agent-container">
      {/* 左侧聊天区 */}
      <div className="chat-pane">
        <div className="chat-header">
          <div>
            <h2>💬 AI 对话助手</h2>
            {projectPlan && (
              <div className="project-info">
                <Tag color="blue">{projectPlan.techStackSummary}</Tag>
                <Tag color="green">{projectPlan.files.length} 个文件</Tag>
              </div>
            )}
          </div>
          <Button
            icon={<ClearOutlined />}
            onClick={handleClear}
            size="small"
          >
            清空
          </Button>
        </div>

        {/* 消息列表 */}
        <div className="messages-container">
          {messages.length === 0 && (
            <div className="welcome-message">
              <h3>👋 欢迎使用 DOM Agent Pro</h3>
              <p>告诉我你想要创建什么项目，我会帮你生成完整的多文件 React 代码！</p>

              <div className="suggestions">
                <div className="suggestions-title">
                  <ThunderboltOutlined /> 试试这些：
                </div>
                {suggestions.map((suggestion, index) => (
                  <Tag
                    key={index}
                    color="pink"
                    className="suggestion-tag"
                    onClick={() => handleUseSuggestion(suggestion)}
                  >
                    {suggestion}
                  </Tag>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, index) => (
            <div
              key={index}
              className={`message ${msg.role === 'user' ? 'user-message' : 'assistant-message'}`}
            >
              <div className="message-avatar">
                {msg.role === 'user' ? '👤' : '🤖'}
              </div>
              <div className="message-content">
                {msg.thinking && (
                  <div style={{ marginBottom: 12 }}>
                    <Collapse
                      size="small"
                      items={[
                        {
                          key: 'thinking',
                          label: '💡 查看思考过程',
                          children: (
                            <pre className="thinking-content">
                              {msg.thinking}
                            </pre>
                          )
                        }
                      ]}
                    />
                  </div>
                )}
                <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="message assistant-message">
              <div className="message-avatar">🤖</div>
              <div className="message-content">
                <div style={{ marginBottom: 8 }}>
                  <Spin size="small" />
                  <span style={{ marginLeft: 8 }}>
                    {workflowStatus.initialize === 'running' && '初始化项目...'}
                    {workflowStatus.classifier === 'running' && '分析意图...'}
                    {workflowStatus.rag === 'running' && '检索相关案例...'}
                    {workflowStatus.planner === 'running' && '制定项目计划...'}
                    {workflowStatus.executor === 'running' && '生成代码...'}
                    {workflowStatus.integrator === 'running' && '整合文件...'}
                  </span>
                </div>

                {/* 思考过程显示 */}
                {thinkingProcess && (
                  <div className="thinking-process">
                    <div className="thinking-header">💭 思考过程：</div>
                    <div className="thinking-content">{thinkingProcess}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* 输入区 */}
        <div className="input-container">
          <TextArea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="描述你想要的 React 项目，支持多文件生成..."
            autoSize={{ minRows: 2, maxRows: 6 }}
            disabled={loading}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleSendMessage}
            loading={loading}
            disabled={!inputValue.trim()}
          >
            发送
          </Button>
        </div>

        {/* 工作流状态 */}
        {(ragResults.length > 0 || projectPlan || sandpackErrors.length > 0) && (
          <div className="workflow-info">
            {ragResults.length > 0 && (
              <Tag color="green">找到 {ragResults.length} 个相关案例</Tag>
            )}
            {projectPlan && (
              <Tag color="blue">计划：{projectPlan.files.length} 个文件</Tag>
            )}
            {sandpackErrors.length > 0 && (
              <Tag color="orange">🔬 检测到 {sandpackErrors.length} 个 Sandpack 错误，Agent 将精确修复</Tag>
            )}
          </div>
        )}
      </div>

      {/* 右侧预览区 */}
      <div className="preview-pane">
        <Card className="preview-card" styles={{ body: { padding: 0, height: '100%' } }}>
          <div className="preview-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <h3>⚛️ 多文件 React 项目预览</h3>
              <span className="preview-subtitle">
                实时编译 · {Object.keys(generatedFiles).length} 个文件
              </span>
            </div>
            <Segmented
              value={viewMode}
              onChange={(value) => setViewMode(value as 'preview' | 'code')}
              options={[
                { value: 'preview', icon: <EyeOutlined />, label: '预览' },
                { value: 'code', icon: <CodeOutlined />, label: '代码' },
              ]}
              size="small"
            />
          </div>

          <div className="sandpack-container">
            <SandpackProvider
              template="react"
              theme={githubLight}
              files={sandpackFiles}
              options={{
                autorun: true,
                autoReload: true,
              }}
              customSetup={{
                dependencies: {
                  'antd': '^5.12.0',
                  '@ant-design/icons': '^5.2.0',
                  'lucide-react': 'latest',
                  'react': '^18.2.0',
                  'react-dom': '^18.2.0',
                  'react-router-dom': '^6.28.0',
                  'react-router': '^6.28.0',
                  'echarts': '^5.5.0',
                  'dayjs': '^1.11.13',
                  'echarts-for-react': '^3.0.0',
                },
              }}
            >
              <SandpackErrorListener onError={setSandpackErrors} />
              <SandpackLayout style={{ height: '100%', border: 'none', background: 'transparent' }}>
                <div style={{
                  display: viewMode === 'code' ? 'block' : 'none',
                  height: '100%',
                  width: '100%',
                  flex: 1
                }}>
                  <SandpackCodeEditor
                    showTabs
                    showLineNumbers
                    showInlineErrors
                    wrapContent
                    style={{ height: '100%' }}
                  />
                </div>
                <div style={{
                  display: viewMode === 'preview' ? 'block' : 'none',
                  height: '100%',
                  width: '100%',
                  flex: 1
                }}>
                  <SandpackPreview
                    showNavigator={false}
                    showOpenInCodeSandbox={false}
                    style={{ height: '100%' }}
                  />
                </div>
              </SandpackLayout>
            </SandpackProvider>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default DomAgent;
