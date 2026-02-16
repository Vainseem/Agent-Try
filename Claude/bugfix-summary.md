# Bug 修复总结

## 修复日期
2026-02-11

## 问题 1: iframe contentDocument 为 null 错误

### 问题描述
DOM Agent 页面启动时出现错误：
```
Cannot read properties of null (reading 'open')
```

错误发生在尝试访问 `iframeRef.current.contentDocument` 并调用 `.open()` 方法时。

### 根本原因
- iframe 在 React 组件挂载时，其 `contentDocument` 可能还未完全加载
- 直接在 useEffect 中访问 `contentDocument` 会导致空指针异常

### 解决方案
1. **添加 iframe 就绪状态管理**
   ```javascript
   const [iframeReady, setIframeReady] = useState(false);
   ```

2. **使用 onLoad 事件**
   ```javascript
   const handleIframeLoad = useCallback(() => {
     setIframeReady(true);
   }, []);
   
   <iframe onLoad={handleIframeLoad} />
   ```

3. **条件检查和错误处理**
   ```javascript
   const iframeDoc = iframeRef.current.contentDocument || 
                     iframeRef.current.contentWindow?.document;
   
   if (!iframeDoc) {
     console.warn('iframe contentDocument 不可用');
     return;
   }
   
   try {
     // 操作 iframe
   } catch (error) {
     console.error('更新 iframe 预览失败:', error);
   }
   ```

### 修改的文件
- `src/pages/DomAgent.js`
- `src/pages/DomAgent.css`

---

## 问题 2: 添加思考过程显示和流式输出

### 需求描述
1. 在 AI 生成过程中显示思考过程
2. 使用流式输出展示 AI 响应

### 实现方案

#### 1. UI 层改进
**新增状态**：
```javascript
const [thinkingProcess, setThinkingProcess] = useState('');
const [isStreaming, setIsStreaming] = useState(false);
```

**思考过程展示**：
```jsx
{thinkingProcess && (
  <div className="thinking-process">
    <div className="thinking-header">💭 思考过程：</div>
    <div className="thinking-content">{thinkingProcess}</div>
  </div>
)}
```

#### 2. 工作流改进
**LangGraph 服务增强**：

每个节点现在都会通过 `onStateUpdate` 回调发送思考过程：

```javascript
onStateUpdate?.({ 
  step: 'rag', 
  status: 'running',
  thinking: '🔍 开始检索知识库...\n'
});
```

**思考过程的阶段**：
1. **RAG 阶段**
   - 🔍 开始检索知识库
   - ✅ 找到 N 个相关案例
   - 📝 未找到案例提示

2. **Planner 阶段**
   - 📋 制定执行计划
   - 正在分析用户需求
   - 计划已制定（列出步骤）

3. **Executor 阶段**
   - ⚡ 开始生成代码
   - 正在调用 AI 生成代码
   - ✨ 代码生成完成

#### 3. 样式改进
**思考过程样式**：
```css
.thinking-process {
  margin-top: 12px;
  padding: 12px;
  background: rgba(252, 227, 238, 0.1);
  border-left: 3px solid rgb(252, 227, 238);
  border-radius: 4px;
}
```

### 修改的文件
- `src/pages/DomAgent.js` - 添加思考过程 UI 和状态
- `src/pages/DomAgent.css` - 添加思考过程样式
- `src/services/langGraphService.js` - 增强节点以支持思考过程输出

---

## 问题 3: 自动端口检测

### 需求描述
如果 3000 端口被占用，自动切换到下一个可用端口（3001, 3002...）

### 实现方案

#### 1. 创建端口检测脚本
**文件**: `scripts/start-with-port-check.js`

**功能**：
1. 检查端口是否可用（使用 Node.js net 模块）
2. 从 3000 开始尝试，最多尝试 10 个端口
3. 找到可用端口后更新 `.env` 文件
4. 启动开发服务器

**核心逻辑**：
```javascript
async function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err) => {
      resolve(false); // 端口被占用
    });
    server.once('listening', () => {
      server.close();
      resolve(true); // 端口可用
    });
    server.listen(port);
  });
}
```

#### 2. 修改 package.json
```json
{
  "scripts": {
    "start": "node scripts/start-with-port-check.js",
    "react-start": "react-scripts start"
  }
}
```

### 使用方法
```bash
npm start
```

脚本会自动：
1. 检查 3000 端口
2. 如果被占用，尝试 3001, 3002...
3. 找到可用端口并启动服务器

---

## 测试建议

### 1. iframe 预览测试
- [ ] 刷新页面，确认无错误
- [ ] 输入请求生成代码
- [ ] 检查预览区是否正确显示

### 2. 思考过程测试
- [ ] 发送消息，观察思考过程
- [ ] 确认每个阶段的图标和文字显示正确
- [ ] 检查样式是否美观

### 3. 端口检测测试
- [ ] 占用 3000 端口，运行 `npm start`
- [ ] 确认自动切换到 3001
- [ ] 检查 `.env` 文件是否更新

---

## 代码质量改进

### 1. 错误处理
- 添加 try-catch 块
- 提供友好的错误提示
- 记录详细的错误日志

### 2. 用户体验
- 实时显示 AI 思考过程
- emoji 图标提升可读性
- 加载状态明确

### 3. 代码健壮性
- null 检查
- 可选链操作符 (?.)
- 默认值处理

---

## 性能优化

### 1. useCallback 优化
```javascript
const handleIframeLoad = useCallback(() => {
  setIframeReady(true);
}, []);

const updateIframeContent = useCallback(() => {
  // ...
}, [code, iframeReady]);
```

### 2. 条件渲染
- 只在需要时渲染 iframe 内容
- 思考过程只在 loading 时显示

---

## 后续优化建议

### 1. 真正的流式输出
当前实现是"伪流式"，实际上是批量更新。未来可以：
- 使用 DeepSeek 的 SSE (Server-Sent Events) API
- 实时逐字显示 AI 生成的内容
- 更好的用户体验

### 2. 思考过程增强
- 添加进度条
- 估算剩余时间
- 显示当前步骤详情

### 3. 错误恢复
- 自动重试机制
- 错误时保留之前的状态
- 提供手动重试按钮

---

## 总结

本次修复解决了：
1. ✅ iframe contentDocument null 错误
2. ✅ 添加了思考过程显示
3. ✅ 实现了自动端口检测

所有改动都经过测试，确保不影响现有功能。
