import { App as AntApp, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { useState } from 'react';
import './App.css';
import MainLayout from './components/MainLayout';
import DomAgent from './pages/DomAgent';
import McpTool from './pages/McpTool';

function App() {
  const [currentPage, setCurrentPage] = useState<string>('dom-agent');

  const renderPage = () => {
    switch (currentPage) {
      case 'dom-agent':
        return <DomAgent />;
      case 'mcp-tool':
        return <McpTool />;
      default:
        return <DomAgent />;
    }
  };

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: 'rgb(252, 227, 238)',
          borderRadius: 8,
        },
      }}
    >
      <AntApp>
        <MainLayout currentPage={currentPage} onMenuChange={setCurrentPage}>
          {renderPage()}
        </MainLayout>
      </AntApp>
    </ConfigProvider>
  );
}

export default App;
