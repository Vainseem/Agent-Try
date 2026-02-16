# AI Low-Code Hub

一个基于 AI 的低代码开发平台，集成了 DOM Agent（代码生成器）和 MCP Tool（工作流编辑器）。

## 🎯 功能特性

### 1. DOM Agent - 智能代码生成器
- 📝 **聊天式交互**：类似 Google AI Studio 的对话界面
- 🤖 **AI 驱动**：使用 deepseek-reasoner 模型生成代码
- 📚 **RAG 检索**：基于知识库检索相似案例，提高生成质量
- 🔄 **LangGraph 编排**：RAG → Planner → Executor 工作流
- 👁️ **实时预览**：即时查看生成的 HTML/CSS/JS 效果
- ✏️ **代码编辑**：支持在线修改生成的代码

### 2. MCP Tool - 可视化工作流编辑器
- 🎨 **拖拽式设计**：基于 React-Flow 的可视化画布
- 🔌 **HTTP 节点**：配置 URL、Method、Headers、Body
- 🔗 **节点连接**：通过连线定义执行顺序
- ▶️ **一键执行**：自动按拓扑顺序执行工作流
- 📊 **执行日志**：实时查看每个节点的执行状态
- 💾 **保存/加载**：支持工作流的导出和导入

## 🛠 技术栈

- **前端框架**：React 19 + Vite
- **UI 库**：Ant Design 6.3
- **状态管理**：Zustand + Immer
- **可视化**：React-Flow (@xyflow/react)
- **AI 模型**：deepseek-reasoner
- **HTTP 客户端**：Axios
- **主题色**：白色 (#FFFFFF) + 粉色 (rgb(252, 227, 238))

## 📁 项目结构

```
mcp-platform/
├── Claude/ # AI的所有总结内容以及阅读内容放置处
│ 
├── src/
│   ├── components/          # 可复用组件
│   │   ├── MainLayout.js    # 主布局（Header + Sider）
│   │   ├── MainLayout.css
│   │   ├── HttpNode.js      # HTTP 节点组件
│   │   └── HttpNode.css
│   ├── pages/               # 页面组件
│   │   ├── DomAgent.js      # DOM Agent 页面
│   │   ├── DomAgent.css
│   │   ├── McpTool.js       # MCP Tool 页面
│   │   └── McpTool.css
│   ├── stores/              # Zustand 状态管理
│   │   ├── domAgentStore.js # DOM Agent 状态
│   │   └── mcpToolStore.js  # MCP Tool 状态
│   ├── services/            # 服务层
│   │   ├── deepseekService.js    # DeepSeek API 调用
│   │   ├── ragService.js         # RAG 检索服务
│   │   └── langGraphService.js   # LangGraph 工作流
│   ├── data/                # 数据文件
│   │   └── knowledge_base.json   # RAG 知识库
│   ├── styles/              # 样式文件
│   │   └── theme.js         # 主题配置
│   ├── App.js               # 应用入口
│   ├── index.js
│   └── index.css
├── public/
├── .env.local               # 环境变量（API 密钥）
├── package.json
└── README.md
```

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

创建 `.env.local` 文件：

```env
REACT_APP_DEEPSEEK_API_KEY=your_api_key_here
REACT_APP_DEEPSEEK_BASE_URL=https://api.deepseek.com
```

### 3. 启动开发服务器

```bash
npm start
```

访问 [http://localhost:3000](http://localhost:3000)

## 📖 使用指南

### DOM Agent 使用步骤

1. **打开 DOM Agent 页面**：点击左侧菜单的 "DOM Agent"
2. **输入需求**：在聊天框中描述你想要的界面，例如：
   - "创建一个带有磨砂玻璃效果的登录框"
   - "设计一个符合粉色主题的数据卡片"
3. **查看生成**：AI 会自动生成 HTML、CSS、JavaScript 代码
4. **实时预览**：在右侧预览区查看效果
5. **修改代码**：可以直接在代码编辑器中修改

### MCP Tool 使用步骤

1. **打开 MCP Tool 页面**：点击左侧菜单的 "MCP Tool"
2. **添加节点**：点击 "添加 HTTP 节点" 按钮
3. **配置节点**：
   - 选择 HTTP Method (GET/POST/PUT/DELETE)
   - 输入 API URL
   - 配置 Headers (JSON 格式)
   - 配置 Body (POST/PUT/PATCH 时)
4. **连接节点**：拖拽节点的句柄建立连接
5. **执行工作流**：点击 "执行工作流" 按钮
6. **查看日志**：在右侧抽屉中查看执行结果

## 🎨 主题定制

项目使用自定义主题色：
- **主色**：rgb(252, 227, 238) - 粉色
- **背景色**：#FFFFFF - 白色
- **强调色**：用于卡片、按钮等

可以在 `src/styles/theme.js` 中修改主题配置。

## 🧠 AI 工作流

### LangGraph 节点

1. **RAG_Retriever**：检索相似的 Prompt 案例
2. **Planner**：制定代码生成计划
3. **Executor**：生成实际的 HTML/CSS/JS 代码

### RAG 知识库

位于 `src/data/knowledge_base.json`，包含 10 个高质量案例：
- 磨砂玻璃登录框
- 数据卡片
- 响应式导航栏
- 动画加载按钮
- 价格卡片
- 图片画廊
- 通知提示框
- 搜索框
- 进度条
- FAQ 组件

## 🔧 开发说明

### 添加新的节点类型

在 `src/components/` 中创建新的节点组件：

```jsx
import { Handle, Position } from '@xyflow/react';

const CustomNode = ({ data }) => {
  return (
    <div className="custom-node">
      <Handle type="target" position={Position.Left} />
      {/* 节点内容 */}
      <Handle type="source" position={Position.Right} />
    </div>
  );
};
```

然后在 `McpTool.js` 中注册：

```jsx
const nodeTypes = {
  httpNode: HttpNode,
  customNode: CustomNode
};
```

### 扩展 RAG 知识库

在 `knowledge_base.json` 中添加新案例：

```json
{
  "id": "11",
  "prompt": "描述",
  "output": {
    "html": "HTML 代码",
    "css": "CSS 代码",
    "js": "JavaScript 代码"
  }
}
```

## 📝 注意事项

1. **API 密钥安全**：不要将 `.env.local` 提交到版本控制
2. **跨域问题**：如果调用外部 API 遇到 CORS 错误，需要配置代理
3. **浏览器兼容性**：建议使用 Chrome/Edge 最新版本

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 👨‍💻 作者

AI Low-Code Hub Team

---

**版本**：v0.1.0 Beta  
**最后更新**：2026-02-11
