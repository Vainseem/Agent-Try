import {
  ApiOutlined,
  RobotOutlined
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { Layout, Menu } from 'antd';
import React, { useState } from 'react';
import './MainLayout.css';

const { Header, Sider, Content } = Layout;

interface MainLayoutProps {
  children: React.ReactNode;
  currentPage: string;
  onMenuChange?: (page: string) => void;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children, currentPage, onMenuChange }) => {
  const [collapsed, setCollapsed] = useState(false);

  const menuItems: MenuProps['items'] = [
    {
      key: 'dom-agent',
      icon: <RobotOutlined />,
      label: 'DOM Agent',
    },
    {
      key: 'mcp-tool',
      icon: <ApiOutlined />,
      label: 'MCP Tool',
    }
  ];

  return (
    <Layout className="main-layout">
      <Header className="main-header">
        <div className="logo">
          <span className="logo-icon">🤖</span>
          <span className="logo-text">AI Low-Code Hub</span>
        </div>
        <div className="header-right">
          <span className="version-tag">Beta v0.1</span>
        </div>
      </Header>

      <Layout className="main-layout-content">
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          width={200}
          className="main-sider"
          theme="light"
        >
          <Menu
            mode="inline"
            selectedKeys={[currentPage]}
            items={menuItems}
            onClick={({ key }) => onMenuChange && onMenuChange(key)}
            className="main-menu"
          />
        </Sider>

        <Layout className="main-content-layout">
          <Content className="main-content">
            {children}
          </Content>
        </Layout>
      </Layout>
    </Layout>
  );
};

export default MainLayout;
