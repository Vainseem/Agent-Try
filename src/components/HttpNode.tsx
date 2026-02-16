import { ApiOutlined, DeleteOutlined } from '@ant-design/icons';
import type { Node, NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import { Button, Input, Select, Space } from 'antd';
import React, { memo } from 'react';
import './HttpNode.css';

const { TextArea } = Input;

export interface HttpNodeData extends Record<string, unknown> {
  method?: string;
  url?: string;
  headers?: string;
  body?: string;
  onChange?: (id: string, data: Partial<HttpNodeData>) => void;
  onDelete?: (id: string) => void;
}

export type HttpNodeType = Node<HttpNodeData>;

const HttpNode: React.FC<NodeProps<HttpNodeType>> = memo(({ data, id }) => {
  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    data.onChange?.(id, { url: e.target.value });
  };

  const handleMethodChange = (value: string) => {
    data.onChange?.(id, { method: value });
  };

  const handleHeadersChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    data.onChange?.(id, { headers: e.target.value });
  };

  const handleBodyChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    data.onChange?.(id, { body: e.target.value });
  };

  const handleDelete = () => {
    data.onDelete?.(id);
  };

  return (
    <div className="http-node">
      <Handle
        type="target"
        position={Position.Left}
        className="node-handle"
        style={{ background: 'rgb(252, 227, 238)' }}
      />

      <div className="node-header">
        <div className="node-title">
          <ApiOutlined />
          <span>HTTP Request</span>
        </div>
        <Button
          type="text"
          size="small"
          icon={<DeleteOutlined />}
          onClick={handleDelete}
          danger
        />
      </div>

      <div className="node-content">
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          <div className="node-field">
            <label>Method</label>
            <Select
              value={data.method || 'GET'}
              onChange={handleMethodChange}
              style={{ width: '100%' }}
              options={[
                { value: 'GET', label: 'GET' },
                { value: 'POST', label: 'POST' },
                { value: 'PUT', label: 'PUT' },
                { value: 'DELETE', label: 'DELETE' },
                { value: 'PATCH', label: 'PATCH' }
              ]}
            />
          </div>

          <div className="node-field">
            <label>URL</label>
            <Input
              value={data.url || ''}
              onChange={handleUrlChange}
              placeholder="https://api.example.com/data"
              size="small"
            />
          </div>

          <div className="node-field">
            <label>Headers (JSON)</label>
            <TextArea
              value={data.headers || ''}
              onChange={handleHeadersChange}
              placeholder='{"Content-Type": "application/json"}'
              rows={3}
              size="small"
            />
          </div>

          {['POST', 'PUT', 'PATCH'].includes(data.method || '') && (
            <div className="node-field">
              <label>Body (JSON)</label>
              <TextArea
                value={data.body || ''}
                onChange={handleBodyChange}
                placeholder='{"key": "value"}'
                rows={3}
                size="small"
              />
            </div>
          )}
        </Space>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="node-handle"
        style={{ background: 'rgb(252, 227, 238)' }}
      />
    </div>
  );
});

HttpNode.displayName = 'HttpNode';

export default HttpNode;
