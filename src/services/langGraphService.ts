import { chatCompletion } from './deepseekService';
import { retrieveSimilarCases } from './ragService';

interface WorkflowState {
  messages: any[];
  generatedFiles: Record<string, any>;
  currentFileIndex: number;
  iterationCount: number;
  ragResults?: any[];
  contextInfo?: any;
  projectPlan?: {
    files: any[];
    projectPlanText: string;
    techStackSummary: string;
  };
  intent?: string;
  classification?: any;
  allTasksCompleted?: boolean;
  currentGeneratedFile?: any;
  [key: string]: any;
}

type StateUpdateCallback = (update: {
  step: string;
  status: string;
  thinking?: string;
  data?: any;
}) => void;

/**
 * 升级版 LangGraph 工作流服务
 * 支持多轮思考和多文件生成
 */

/**
 * 常量配置
 */
const CONSTANTS = {
  MAX_ITERATIONS: 20,          // 最大迭代次数
  MAX_FILES_PER_PROJECT: 10,   // 单个项目最多文件数
};

/**
 * 辅助函数：解析 LLM 返回的 JSON
 * 自动处理 Markdown 代码块和非标准格式
 */
const parseJsonFromResponse = (content: string) => {
  if (!content) {
    throw new Error('Response content is empty');
  }

  let jsonString = content.trim();

  // 移除 Markdown 代码块标记
  if (jsonString.includes('```json')) {
    jsonString = jsonString.replace(/```json\n?|\n?```/g, '');
  } else if (jsonString.includes('```')) {
    jsonString = jsonString.replace(/```\n?|\n?```/g, '');
  }

  jsonString = jsonString.trim();

  // 尝试解析
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    const errorMsg = (error as Error).message;
    console.error('[JSON Parse Error] Raw content:', content);
    console.error('[JSON Parse Error] Processed string:', jsonString);
    console.error('[JSON Parse Error] Error:', errorMsg);

    // 检查是否是截断问题
    if (errorMsg.includes('Unterminated string') || errorMsg.includes('Unexpected end of JSON')) {
      throw new Error(`JSON 解析失败：返回内容被截断。${errorMsg}\n\n这通常是因为 max_tokens 设置过小，或者 LLM 返回的内容过长。请尝试简化需求或增加 max_tokens。`);
    }

    throw new Error(`Failed to parse JSON: ${errorMsg}`);
  }
};

/**
 * Node 1: Initialize - 初始化节点
 * 扫描上下文，处理引用文件
 */
const initializeNode = async (state: WorkflowState, onStateUpdate?: StateUpdateCallback) => {
  console.log('[Initialize Node] 初始化上下文...');

  onStateUpdate?.({
    step: 'initialize',
    status: 'running',
    thinking: '🔍 初始化项目上下文...\n'
  });

  const lastMessage = state.messages[state.messages.length - 1];
  const userInput = lastMessage.content;

  // 1. 历史记录摘要逻辑
  // 如果消息数量超过 50 条，压缩前 40 条
  let messages = [...state.messages];
  if (messages.length > 50) {
    onStateUpdate?.({
      step: 'initialize',
      status: 'running',
      thinking: '📚 历史记录过长，正在生成摘要...\n'
    });

    const messagesToSummarize = messages.slice(0, 40);
    const recentMessages = messages.slice(40);

    const summaryPrompt = `请简要总结以下对话的历史记录，保留关键的技术决策、用户需求和已实现的功能。
对话内容：
${JSON.stringify(messagesToSummarize)}
`;

    try {
      const response = await chatCompletion([
        { role: 'system', content: '你是一个专业的对话摘要助手。' },
        { role: 'user', content: summaryPrompt }
      ]);

      const summary = response.content;
      messages = [
        { role: 'system', content: `【历史对话摘要】：${summary}` },
        ...recentMessages
      ];

      console.log('[Initialize Node] 历史记录已压缩');
    } catch (error) {
      console.error('[Initialize Node] 摘要生成失败，保留原始记录', error);
    }
  }

  // 分析用户输入，提取关键信息
  const contextInfo = {
    userInput,
    timestamp: new Date().toISOString(),
    projectContext: state.generatedFiles || {},
    messages // 更新后的消息列表
  };

  onStateUpdate?.({
    step: 'initialize',
    status: 'completed',
    data: contextInfo
  });

  return {
    ...state,
    messages: state.contextInfo?.messages || state.messages, // 确保使用更新后的消息列表（如果发生了摘要）
    contextInfo // 更新 contextInfo
  };
};

/**
 * Node 2: Classifier - 意图分类节点
 * 判断用户意图：task（任务）、chat（闲聊）、question（问题）
 */
const classifierNode = async (state: WorkflowState, onStateUpdate?: StateUpdateCallback) => {
  console.log('[Classifier Node] 分类用户意图...');

  onStateUpdate?.({
    step: 'classifier',
    status: 'running',
    thinking: '🤔 分析用户意图...\n'
  });

  const userInput = state.contextInfo.userInput;

  // 使用 LLM 进行意图分类
  const systemPrompt = `你是一个意图分类器。分析用户输入，判断其意图类型。

用户输入：${userInput}

返回 JSON 格式：
{
  "intent": "task | chat | question",
  "confidence": 0.0-1.0,
  "reason": "分类原因"
}

意图定义：
- task: 用户要求创建、修改、实现某个功能或组件（如"创建一个登录页面"）
- chat: 普通闲聊或问候（如"你好"、"谢谢"）
- question: 询问技术问题或概念解释（如"React Hooks 是什么"）`;

  try {
    const response = await chatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userInput }
    ], { json_mode: true });

    const classification = parseJsonFromResponse(response.content);

    onStateUpdate?.({
      step: 'classifier',
      status: 'completed',
      thinking: `✅ 意图分类：${classification.intent}\n原因：${classification.reason}\n`,
      data: classification
    });

    return {
      ...state,
      intent: classification.intent,
      classification
    };
  } catch (error) {
    console.error('[Classifier Node] 错误:', error);
    return {
      ...state,
      intent: 'task' // 默认为任务
    };
  }
};

/**
 * Node 3: Planner - 项目规划节点
 * 生成项目计划和文件任务列表
 */
const plannerNode = async (state: WorkflowState, onStateUpdate?: StateUpdateCallback) => {
  const userInput = state.contextInfo.userInput;
  const messages = state.contextInfo.messages || state.messages; // 使用处理过的消息列表
  const ragResults = state.ragResults || [];
  const generatedFiles = state.generatedFiles || {};

  console.log('[Planner Node] 制定项目计划...');

  onStateUpdate?.({
    step: 'planner',
    status: 'running',
    thinking: '📋 制定项目计划和文件结构...\n'
  });

  // 构建提示词
  let systemPrompt = `你是一个专业的 React 项目架构师，尤其擅长使用 Ant Design 进行企业级后台开发。
根据用户需求，制定完整的项目计划和文件结构。

用户需求：${userInput}

当前已生成的文件：
${Object.keys(generatedFiles).map(path => `- ${path}: ${generatedFiles[path].description || '无描述'}`).join('\n')}

`;

  if (messages.length > 1) {
    systemPrompt += `对话历史：\n${JSON.stringify(messages.slice(-10))}\n\n`;
  }

  if (ragResults.length > 0) {
    systemPrompt += `参考案例（请重点参考后台管理系统结构）：\n`;
    ragResults.forEach((case_: any, index: number) => {
      systemPrompt += `案例 ${index + 1}：${case_.prompt}\n`;
    });
  }

  systemPrompt += `
请制定详细的项目计划，包括所有需要创建的文件。

注意：
1. 如果用户是修改现有功能，请识别出需要修改的文件。
2. 如果是新功能，请列出需要创建的新文件。
3. 不要重置项目，而是在现有基础上进行增量修改。
4. 优先使用 Ant Design (antd) 的组件，如 Layout, Menu, Table, Form 等。

严格要求：
1. 最多创建 ${CONSTANTS.MAX_FILES_PER_PROJECT} 个文件
2. 每个文件都必须有清晰的职责
3. 文件之间的依赖关系要明确
4. 必须包含一个入口文件 App.js，且必须放在文件列表的最后生成
5. 组件文件建议使用 .jsx 后缀，入口文件必须是 App.js
6. 使用 React 函数组件和 Hooks
7. 可以使用 lucide-react 图标库
8. 文件生成顺序必须遵循依赖关系：先生成子组件，最后生成 App.js
9. 如果需要构建复杂页面，请拆分为多个子组件（如 Header, Sidebar, Content 等）
10. 【重要】description 字段必须简短（不超过30个字），避免 JSON 过长被截断

返回 JSON 格式（必须完整且符合 JSON 规范）：
{
  "projectPlanText": "项目整体描述（简洁）",
  "techStackSummary": "使用的技术栈（简洁）",
  "files": [
    {
      "path": "components/Layout/MainLayout.jsx",
      "description": "主布局组件",
      "dependencies": [],
      "priority": 1
    },
    {
      "path": "App.js",
      "description": "主应用入口",
      "dependencies": ["components/Layout/MainLayout.jsx"],
      "priority": 2
    }
  ]
}

【警告】：必须返回完整、有效的 JSON，确保所有字符串都正确闭合！`;

  try {
    let response = await chatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: '请制定项目计划' }
    ], { json_mode: true, max_tokens: 20000 });

    let projectPlan;
    try {
      projectPlan = parseJsonFromResponse(response.content);
    } catch (parseError) {
      console.error('[Planner Node] JSON Parse Error on first attempt. Retrying with larger max_tokens...', parseError);

      // 重试一次，使用更大的 max_tokens
      try {
        response = await chatCompletion([
          { role: 'system', content: systemPrompt + '\n\n【紧急】上次响应被截断，请务必返回完整、简洁的 JSON！' },
          { role: 'user', content: '请制定项目计划，确保 JSON 完整' }
        ], { json_mode: true, max_tokens: 20000 });

        projectPlan = parseJsonFromResponse(response.content);
        console.log('[Planner Node] Retry successful!');
      } catch (retryError) {
        console.error('[Planner Node] Retry also failed:', retryError);
        throw new Error('项目计划生成失败：JSON 解析错误。可能是返回内容过长或格式错误。请尝试简化需求。');
      }
    }

    // 初始化文件状态
    projectPlan.files.forEach((file: any) => {
      file.status = 'pending';
    });

    // 简单排序：将 App.js 移到最后，确保子组件先生成
    projectPlan.files.sort((a: any, b: any) => {
      if (a.path === 'App.js') return 1;
      if (b.path === 'App.js') return -1;
      return 0;
    });

    onStateUpdate?.({
      step: 'planner',
      status: 'completed',
      thinking: `✅ 项目计划制定完成\n文件数量：${projectPlan.files.length}\n`,
      data: projectPlan
    });

    return {
      ...state,
      projectPlan
    };
  } catch (error) {
    console.error('[Planner Node] 错误:', error);
    throw error;
  }
};

/**
 * Node 4: Executor - 执行节点
 * 执行当前文件的生成任务
 */
const executorNode = async (state: WorkflowState, onStateUpdate?: StateUpdateCallback) => {
  const { projectPlan, currentFileIndex, generatedFiles, iterationCount } = state;

  // 检查迭代次数
  if (iterationCount >= CONSTANTS.MAX_ITERATIONS) {
    onStateUpdate?.({
      step: 'executor',
      status: 'failed',
      thinking: '❌ 达到最大迭代次数\n'
    });
    throw new Error('达到最大迭代次数');
  }

  // 检查是否所有文件都已完成
  if (currentFileIndex >= projectPlan!.files.length) {
    onStateUpdate?.({
      step: 'executor',
      status: 'completed',
      thinking: '✨ 所有文件生成完成！\n'
    });
    return {
      ...state,
      allTasksCompleted: true
    };
  }

  const currentFile = projectPlan!.files[currentFileIndex];

  console.log(`[Executor Node] 生成文件: ${currentFile.path}`);

  onStateUpdate?.({
    step: 'executor',
    status: 'running',
    thinking: `⚡ 正在生成文件：${currentFile.path}\n描述：${currentFile.description}\n`
  });

  // 构建上下文：包含所有已生成的依赖文件，无论是否显式声明
  let contextFiles = '';
  const allGeneratedFiles = Object.values(generatedFiles);
  if (allGeneratedFiles.length > 0) {
    contextFiles = '\n已生成的组件文件（可直接引用）：\n';
    allGeneratedFiles.forEach((file: any) => {
      contextFiles += `\n--- ${file.path} ---\n// 导出: ${file.exports}\n${file.code}\n`;
    });
  }

  // 检查是否是修改现有文件
  const existingFile = generatedFiles[currentFile.path] || generatedFiles[currentFile.path.replace(/^\.?\//, '')];
  let modificationInstruction = '';

  if (existingFile) {
    console.log(`[Executor Node] 检测到现有文件，准备修改: ${currentFile.path}`);
    modificationInstruction = `
IMPORTANT: 您正在修改一个现有的文件！
以下是该文件的当前代码：
\`\`\`javascript
${existingFile.code}
\`\`\`

请基于用户的最新需求（${projectPlan!.projectPlanText}）对上述代码进行修改。
- 保留未被修改的功能。
- 只更新需要变更的部分。
- 确保修改后的代码仍然是完整的、可运行的。
`;
  }

  // 构建提示词
  const systemPrompt = `你是一个资深的 React 开发工程师。请生成以下文件的完整代码。

项目计划：${projectPlan!.projectPlanText}
技术栈：${projectPlan!.techStackSummary}

当前任务：生成 ${currentFile.path}
任务描述：${currentFile.description}
${contextFiles}
${modificationInstruction}

严格要求：
1. 必须是完整的、可运行的 React 代码
2. 使用 export default 导出主组件
3. 如果需要导入其他组件，使用相对路径（例如：当前在 App.js，引用 components/Button.jsx 应使用 './components/Button'）
4. 确保正确处理文件路径引用，特别是对于已生成的组件
5. 只能使用 React Hooks（useState, useEffect 等）
6. 可以使用 lucide-react 图标库
7. 使用内联样式或 Tailwind CSS 类名
8. 主题色：rgb(252, 227, 238)
9. 代码必须优雅、可维护
10. 普通组件使用 .jsx，入口文件必须是 App.js
11. 路径引用规范：
    - 同级目录：'./Component'
    - 子目录：'./components/Component'
    - 父目录：'../Component'
12. 【重要】Ant Design 5.x API 规范：
    - Dropdown 使用 menu 属性，不要使用已废弃的 overlay
    - Menu 使用 items 数组，不要使用已废弃的 Menu.Item 子组件
    - Form.Item 的 rules 使用数组格式
    - 使用最新的 Ant Design 5.x API

返回 JSON 格式（必须完整且符合 JSON 规范）：
{
  "code": "完整的 React 组件代码",
  "explanation": "实现说明（简短）",
  "imports": ["依赖的其他文件路径列表"],
  "exports": "导出的组件名称"
}`;

  try {
    const response = await chatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `请生成 ${currentFile.path}` }
    ], { json_mode: true, max_tokens: 20000 });

    const result = parseJsonFromResponse(response.content);

    onStateUpdate?.({
      step: 'executor',
      status: 'completed',
      thinking: `✅ ${currentFile.path} 生成完成\n`,
      data: {
        filePath: currentFile.path,
        code: result.code
      }
    });

    return {
      ...state,
      currentGeneratedFile: {
        path: currentFile.path,
        code: result.code,
        explanation: result.explanation,
        imports: result.imports || [],
        exports: result.exports
      },
      iterationCount: iterationCount + 1
    };
  } catch (error: any) {
    console.error('[Executor Node] 错误:', error);

    onStateUpdate?.({
      step: 'executor',
      status: 'failed',
      thinking: `❌ ${currentFile.path} 生成失败：${error.message}\n`
    });

    throw error;
  }
};

/**
 * Node 5: Integrator - 整合节点
 * 将生成的文件整合到项目中
 */
const integratorNode = async (state: WorkflowState, onStateUpdate?: StateUpdateCallback) => {
  const { currentGeneratedFile, generatedFiles, currentFileIndex } = state;

  console.log('[Integrator Node] 整合文件...');

  onStateUpdate?.({
    step: 'integrator',
    status: 'running',
    thinking: `🔗 整合 ${currentGeneratedFile.path}...\n`
  });

  // 规范化文件路径：移除开头的 / 或 ./
  const normalizedPath = currentGeneratedFile.path.replace(/^\.?\//, '');

  // 将文件添加到已生成文件列表
  const updatedGeneratedFiles = {
    ...generatedFiles,
    [normalizedPath]: {
      path: normalizedPath,
      code: currentGeneratedFile.code,
      dependencies: currentGeneratedFile.imports || [],
      exports: currentGeneratedFile.exports
    }
  };

  onStateUpdate?.({
    step: 'integrator',
    status: 'completed',
    thinking: `✅ ${normalizedPath} 已整合\n进度：${currentFileIndex + 1}/${state.projectPlan!.files.length}\n`
  });

  return {
    ...state,
    generatedFiles: updatedGeneratedFiles,
    currentFileIndex: currentFileIndex + 1
  };
};

// 简易 path.dirname
const getDirname = (path: string) => {
  const parts = path.split('/');
  parts.pop();
  return parts.join('/');
};

// 简易 path.resolve (仅处理相对路径)
const resolveImportPath = (currentFilePath: string, importPath: string) => {
  if (!importPath.startsWith('.')) return null; // 忽略库引用，如 'react'

  const currentDir = getDirname(currentFilePath);
  const parts = currentDir ? currentDir.split('/') : [];
  const segments = importPath.split('/');

  for (const segment of segments) {
    if (segment === '.') continue;
    if (segment === '..') {
      if (parts.length > 0) parts.pop();
    } else {
      parts.push(segment);
    }
  }

  return parts.join('/');
};

/**
 * Node 6: Path Correction - 路径修复节点
 * 检查并修复文件间的路径引用问题
 */
const pathCorrectionNode = async (state: WorkflowState, onStateUpdate?: StateUpdateCallback) => {
  const { generatedFiles } = state;
  const filePaths = Object.keys(generatedFiles);
  const brokenFiles: { path: string; imports: string[] }[] = [];

  console.log('[Path Correction Node] 检查路径引用...');

  onStateUpdate?.({
    step: 'pathCorrection',
    status: 'running',
    thinking: '🔍 正在检查并修复文件路径引用...\n'
  });

  // 1. 扫描所有文件，找出无效引用
  filePaths.forEach(filePath => {
    const fileContent = generatedFiles[filePath].code;
    const importRegex = /import\s+.*\s+from\s+['"](.*?)['"]/g;
    let match;
    const brokenImports = [];

    while ((match = importRegex.exec(fileContent)) !== null) {
      const importPath = match[1];
      if (importPath.startsWith('.')) {
        const resolvedPath = resolveImportPath(filePath, importPath);
        // 尝试匹配 .jsx, .js 或无后缀
        const exists = filePaths.some(p =>
          p === resolvedPath ||
          p === `${resolvedPath}.jsx` ||
          p === `${resolvedPath}.js`
        );

        if (!exists) {
          brokenImports.push(importPath);
        }
      }
    }

    if (brokenImports.length > 0) {
      brokenFiles.push({ path: filePath, imports: brokenImports });
    }
  });

  if (brokenFiles.length === 0) {
    onStateUpdate?.({
      step: 'pathCorrection',
      status: 'completed',
      thinking: '✅ 所有路径引用正确\n'
    });
    return state;
  }

  // 2. 如果有错误，调用 LLM 修复
  console.log(`[Path Correction Node] 发现 ${brokenFiles.length} 个文件存在路径错误，开始修复...`);

  const filesToFixContext = brokenFiles.map(f => {
    return `文件: ${f.path}\n错误引用: ${f.imports.join(', ')}\n当前代码:\n${generatedFiles[f.path].code}\n`;
  }).join('\n---\n');

  const systemPrompt = `你是一个代码修复专家。检测到以下 React 文件存在路径引用错误（import 的文件不存在）。
当前项目所有文件列表：
${filePaths.join('\n')}

需要修复的文件：
${filesToFixContext}

请修复这些文件的 import 路径，确保它们指向正确存在的组件。
注意：
1. 你的任务是修正 import 语句，使其能正确找到文件。
2. 考虑相对路径的层级关系（./ vs ../）。
3. 只返回修复后的完整代码。

返回 JSON 格式：
{
  "fixes": [
    {
      "path": "文件路径",
      "code": "修复后的完整代码"
    }
  ]
}`;

  try {
    const response = await chatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: '请修复路径错误' }
    ], { json_mode: true, max_tokens: 20000 });

    const result = parseJsonFromResponse(response.content);
    const updatedGeneratedFiles = { ...generatedFiles };

    result.fixes.forEach((fix: any) => {
      if (updatedGeneratedFiles[fix.path]) {
        updatedGeneratedFiles[fix.path] = {
          ...updatedGeneratedFiles[fix.path],
          code: fix.code
        };
      }
    });

    onStateUpdate?.({
      step: 'pathCorrection',
      status: 'completed',
      thinking: `✅ 已修复 ${result.fixes.length} 个文件的路径引用错误\n`
    });

    return {
      ...state,
      generatedFiles: updatedGeneratedFiles
    };

  } catch (error) {
    console.error('[Path Correction Node] 修复失败:', error);
    onStateUpdate?.({
      step: 'pathCorrection',
      status: 'failed',
      thinking: '⚠️ 路径自动修复失败，请手动检查\n'
    });
    return state;
  }
};

/**
 * Node 7: Sandpack Path Review Node - Sandpack 路径审查节点
 * 基于 Sandpack 的真实运行时错误，精确修复路径问题
 */
const sandpackPathReviewNode = async (
  state: WorkflowState,
  sandpackErrors: any[],
  onStateUpdate?: StateUpdateCallback
) => {
  const { generatedFiles } = state;

  // 如果没有 Sandpack 错误，直接返回
  if (!sandpackErrors || sandpackErrors.length === 0) {
    console.log('[Sandpack Path Review Node] 没有 Sandpack 错误，跳过');
    return state;
  }

  console.log('[Sandpack Path Review Node] 开始基于 Sandpack 错误审查路径...');

  onStateUpdate?.({
    step: 'sandpackPathReview',
    status: 'running',
    thinking: '🔬 正在基于 Sandpack 真实错误审查路径问题...\n'
  });

  // 解析 Sandpack 错误，提取路径相关的错误
  const pathErrors: { file: string; error: string; line?: number }[] = [];

  sandpackErrors.forEach((err) => {
    const errorMsg = err.message || err.title || JSON.stringify(err);

    // 匹配常见的路径错误模式
    const patterns = [
      /Cannot find module ['"](.+?)['"]/, // Module not found
      /Failed to resolve ['"](.+?)['"]/, // Resolution failure
      /Could not find dependency: ['"](.+?)['"]/, // Dependency not found
      /Module not found: Can't resolve ['"](.+?)['"]/, // Webpack error
      /Error: Cannot find module ['"](.+?)['"]/, // Node.js error
    ];

    for (const pattern of patterns) {
      const match = errorMsg.match(pattern);
      if (match) {
        pathErrors.push({
          file: err.path || 'unknown',
          error: errorMsg,
          line: err.line
        });
        break;
      }
    }
  });

  if (pathErrors.length === 0) {
    onStateUpdate?.({
      step: 'sandpackPathReview',
      status: 'completed',
      thinking: '✅ Sandpack 错误中未发现路径相关问题\n'
    });
    return state;
  }

  console.log(`[Sandpack Path Review Node] 发现 ${pathErrors.length} 个路径相关错误`);

  // 构建详细的错误上下文
  const filePaths = Object.keys(generatedFiles);
  const errorContext = pathErrors.map(err =>
    `文件: ${err.file}\n错误: ${err.error}\n${err.line ? `行号: ${err.line}\n` : ''}`
  ).join('\n---\n');

  // 获取涉及错误的文件内容
  const involvedFiles = [...new Set(pathErrors.map(e => e.file))];
  const filesContext = involvedFiles
    .filter(f => f !== 'unknown' && generatedFiles[f])
    .map(f => `\n=== ${f} ===\n${generatedFiles[f].code}`)
    .join('\n');

  const systemPrompt = `你是一个专业的路径修复专家。现在有真实的 Sandpack 运行时错误报告，需要你精确修复路径引用问题。

【当前项目所有文件列表】：
${filePaths.join('\n')}

【Sandpack 报告的路径错误】：
${errorContext}

【涉及错误的文件内容】：
${filesContext}

【修复要求】：
1. 仔细分析每个错误，确定正确的路径引用
2. 只修改 import 语句的路径部分，保持其他代码完全不变
3. 确保修复后的路径指向实际存在的文件
4. 考虑相对路径的层级关系（./ 表示同级，../ 表示上级）
5. React 组件文件可能是 .jsx 或 .js 后缀，import 时通常省略后缀
6. 必须返回完整的修复后代码，不能只返回部分

【返回格式】（必须是完整有效的 JSON）：
{
  "fixes": [
    {
      "path": "文件路径",
      "code": "修复后的完整代码",
      "explanation": "修复说明（简短）"
    }
  ]
}`;

  try {
    const response = await chatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: '请根据 Sandpack 错误精确修复路径问题' }
    ], { json_mode: true, max_tokens: 20000 });

    const result = parseJsonFromResponse(response.content);
    const updatedGeneratedFiles = { ...generatedFiles };

    let fixCount = 0;
    result.fixes.forEach((fix: any) => {
      if (updatedGeneratedFiles[fix.path]) {
        updatedGeneratedFiles[fix.path] = {
          ...updatedGeneratedFiles[fix.path],
          code: fix.code
        };
        fixCount++;
        console.log(`[Sandpack Path Review Node] 修复: ${fix.path} - ${fix.explanation}`);
      }
    });

    onStateUpdate?.({
      step: 'sandpackPathReview',
      status: 'completed',
      thinking: `✅ 已基于 Sandpack 错误修复 ${fixCount} 个文件的路径问题\n`
    });

    return {
      ...state,
      generatedFiles: updatedGeneratedFiles
    };

  } catch (error) {
    console.error('[Sandpack Path Review Node] 修复失败:', error);
    onStateUpdate?.({
      step: 'sandpackPathReview',
      status: 'failed',
      thinking: '⚠️ Sandpack 路径审查失败，已回退到静态分析\n'
    });
    return state;
  }
};

/**
 * Node 8: Review Node - 审查节点
 * 检查生成结果是否满足用户需求，如果不足则补充计划
 */
const reviewNode = async (state: WorkflowState, onStateUpdate?: StateUpdateCallback) => {
  const { generatedFiles, projectPlan, contextInfo } = state;
  const userInput = contextInfo.userInput;

  console.log('[Review Node] 审查生成结果...');

  onStateUpdate?.({
    step: 'review',
    status: 'running',
    thinking: '🤔 正在审查项目完整性...\n'
  });

  const generatedFilesList = Object.keys(generatedFiles).map(p => `- ${p}`).join('\n');

  const systemPrompt = `你是一个严格的代码审查员。请检查当前生成的项目文件是否完全满足用户的需求。

用户需求：${userInput}

当前已生成的文件列表：
${generatedFilesList}

原始项目计划：
${projectPlan?.projectPlanText}

判断标准：
1. 页面结构是否完整（例如：是否包含了 Header, Sidebar, Footer, Content 等部分）？
2. 是否遗漏了关键的功能模块？
3. 如果是后台管理系统，是否有完整的 Layout？

如果认为当前项目已完成，请返回 completed: true。
如果认为有遗漏，请返回 completed: false，并列出需要补充生成的文件任务。

返回 JSON 格式：
{
  "completed": boolean,
  "reason": "审查意见",
  "newFiles": [ // 仅当 completed 为 false 时需要
    {
      "path": "components/Sidebar.jsx",
      "description": "补充侧边栏导航组件",
      "dependencies": [],
      "priority": 1
    }
  ]
}`;

  try {
    const response = await chatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: '请审查项目' }
    ], { json_mode: true, max_tokens: 20000 });

    const reviewResult = parseJsonFromResponse(response.content);

    if (reviewResult.completed) {
      onStateUpdate?.({
        step: 'review',
        status: 'completed',
        thinking: `✅ 审查通过：${reviewResult.reason}\n`
      });
      return state;
    } else {
      console.log('[Review Node] 发现遗漏，补充计划...');
      onStateUpdate?.({
        step: 'review',
        status: 'warning',
        thinking: `⚠️ 审查发现不足：${reviewResult.reason}，正在补充 ${reviewResult.newFiles.length} 个文件...\n`
      });

      // 将新文件追加到计划中，并重置 allTasksCompleted 标志
      const newFiles = reviewResult.newFiles.map((f: any) => ({ ...f, status: 'pending' }));

      // 更新 projectPlan
      const updatedProjectPlan = {
        ...state.projectPlan!,
        files: [...state.projectPlan!.files, ...newFiles]
      };

      return {
        ...state,
        projectPlan: updatedProjectPlan,
        allTasksCompleted: false, // 强制重新进入循环
        // currentFileIndex 保持不变，循环逻辑会自动处理后续未完成的文件
      };
    }

  } catch (error) {
    console.error('[Review Node] 审查失败:', error);
    return state; // 忽略错误，继续流程
  }
};

/**
 * 主工作流：运行完整的状态机
 */
export const runDomAgentWorkflow = async (
  initialState: any,
  onStateUpdate?: StateUpdateCallback,
  sandpackErrors?: any[]
) => {
  try {
    let state = initialState;
    let accumulatedThinking = ''; // 本地累计思考过程

    // 包装回调函数以收集思考过程
    const handleStateUpdate: StateUpdateCallback = (update) => {
      if (update.thinking) {
        accumulatedThinking += update.thinking;
      }
      if (onStateUpdate) {
        onStateUpdate(update);
      }
    };

    // Step 1: Initialize
    handleStateUpdate({ step: 'initialize', status: 'running' });
    state = await initializeNode(state, handleStateUpdate);

    // Step 2: RAG 检索
    handleStateUpdate({
      step: 'rag',
      status: 'running',
      thinking: '🔍 检索相关案例...\n'
    });

    const userQuery = state.messages[state.messages.length - 1].content;
    const ragResults = retrieveSimilarCases(userQuery, 2);
    state.ragResults = ragResults;

    handleStateUpdate({
      step: 'rag',
      status: 'completed',
      data: ragResults,
      thinking: `✅ 找到 ${ragResults.length} 个相关案例\n`
    });

    // Step 3: Classify
    state = await classifierNode(state, handleStateUpdate);

    // 如果不是任务，直接返回
    if (state.intent !== 'task') {
      handleStateUpdate({
        step: 'chat',
        status: 'completed',
        thinking: '💬 这不是一个开发任务，进入聊天模式\n'
      });

      return {
        ...state,
        messages: [
          ...state.messages,
          {
            role: 'assistant',
            content: '我是一个代码生成助手。如果您想创建 React 组件或项目，请告诉我具体需求！',
            thinking: accumulatedThinking
          }
        ]
      };
    }

    // Step 4: Plan
    state = await plannerNode(state, handleStateUpdate);

    // Step 5-7: 循环执行 Executor → Integrator
    while (state.currentFileIndex < state.projectPlan!.files.length) {
      // Execute
      state = await executorNode(state, handleStateUpdate);

      if (state.allTasksCompleted) {
        break;
      }

      // Integrate
      state = await integratorNode(state, handleStateUpdate);
    }

    // Step 8: Path Correction (静态分析)
    state = await pathCorrectionNode(state, handleStateUpdate);

    // Step 8.5: Sandpack Path Review (基于真实运行时错误)
    if (sandpackErrors && sandpackErrors.length > 0) {
      state = await sandpackPathReviewNode(state, sandpackErrors, handleStateUpdate);
    }

    // Step 9: Review & Loop (新增节点)
    state = await reviewNode(state, handleStateUpdate);

    // 如果 Review 决定补充文件，通过递归或循环再次执行 Executor
    // 这里使用简单的 while 循环检查是否有 pending 状态的文件
    let hasPendingFiles = state.projectPlan!.files.some((f: any) => f.status === 'pending');
    let loopCount = 0;
    const MAX_LOOPS = 3; // 防止无限循环

    while (hasPendingFiles && loopCount < MAX_LOOPS) {
      console.log(`[Workflow] 进入第 ${loopCount + 1} 轮补充生成...`);
      loopCount++;

      // 重新执行 Executor -> Integrator 循环
      while (state.currentFileIndex < state.projectPlan!.files.length) {
        state = await executorNode(state, handleStateUpdate);
        if (state.allTasksCompleted) break;
        state = await integratorNode(state, handleStateUpdate);
      }

      // 再次进行路径修复和审查
      state = await pathCorrectionNode(state, handleStateUpdate);

      // 如果有 Sandpack 错误，进行精确修复
      if (sandpackErrors && sandpackErrors.length > 0) {
        state = await sandpackPathReviewNode(state, sandpackErrors, handleStateUpdate);
      }

      state = await reviewNode(state, handleStateUpdate);

      hasPendingFiles = state.projectPlan!.files.some((f: any) => f.status === 'pending');
    }

    // 生成最终摘要消息
    const fileList = Object.keys(state.generatedFiles).join('\n- ');

    const summaryMessage = {
      role: 'assistant',
      content: `✨ 项目生成完成！\n\n已创建文件：\n- ${fileList}\n\n您可以在右侧预览区查看和切换文件。`,
      thinking: accumulatedThinking // 传递思考过程
    };

    return {
      ...state,
      messages: [
        ...state.messages,
        summaryMessage
      ]
    };

  } catch (error: any) {
    console.error('[Workflow] 执行错误:', error);

    onStateUpdate?.({
      step: 'error',
      status: 'failed',
      thinking: `\n❌ 发生错误: ${error.message}\n`
    });

    throw error;
  }
};

export default {
  runDomAgentWorkflow,
  initializeNode,
  classifierNode,
  plannerNode,
  executorNode,
  integratorNode,
  pathCorrectionNode,
  sandpackPathReviewNode,
  reviewNode
};
