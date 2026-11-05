import React, { useState } from 'react';
import { Modal, Form, Input, Select, Button, Space, message, Tag, Switch } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, SyncOutlined, ExperimentOutlined } from '@ant-design/icons';
import type { AppSettings } from '../types';
import { checkBackendHealth } from '../services/api';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (newSettings: AppSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  onClose,
  settings,
  onSave,
}) => {
  const [form] = Form.useForm<AppSettings>();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'failed' | null>(null);

  const handleTestConnection = async () => {
    const currentUrl = form.getFieldValue('backendUrl') || settings.backendUrl;
    setTesting(true);
    setTestResult(null);

    const isAlive = await checkBackendHealth(currentUrl);
    setTesting(false);

    if (isAlive) {
      setTestResult('success');
      message.success('Backend is reachable!');
    } else {
      setTestResult('failed');
      message.error('Unable to reach backend. Check URL or CORS settings.');
    }
  };

  const handleFinish = (values: AppSettings) => {
    onSave({
      ...settings,
      ...values,
    });
    message.success('Settings saved successfully');
    onClose();
  };

  return (
    <Modal
      title="Settings & Backend Connection"
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={settings}
        onFinish={handleFinish}
      >
        <Form.Item
          label="Backend API Base URL"
          name="backendUrl"
          rules={[{ required: true, message: 'Please enter the backend URL' }]}
          extra="Default ASP.NET local URL is http://localhost:5023 or http://localhost:5246."
        >
          <Input placeholder="http://localhost:5023" />
        </Form.Item>

        <Form.Item label="Connection Status">
          <Space>
            <Button
              icon={<SyncOutlined spin={testing} />}
              loading={testing}
              onClick={handleTestConnection}
            >
              Test Connection
            </Button>
            {testResult === 'success' && (
              <Tag icon={<CheckCircleOutlined />} color="success">
                Connected
              </Tag>
            )}
            {testResult === 'failed' && (
              <Tag icon={<CloseCircleOutlined />} color="error">
                Offline / Unreachable
              </Tag>
            )}
          </Space>
        </Form.Item>

        <Form.Item
          label={
            <Space>
              <ExperimentOutlined style={{ color: '#fa8c16' }} />
              <span>Local Demo / Mock Mode</span>
            </Space>
          }
          name="useMockMode"
          valuePropName="checked"
          extra="Enable to test the UI and citations locally right now without waiting for backend or Gemini API keys."
        >
          <Switch checkedChildren="Mock On" unCheckedChildren="Live API" />
        </Form.Item>

        <Form.Item label="Preferred Response Language" name="language">
          <Select
            options={[
              { label: 'English', value: 'en' },
              { label: 'العربية (Arabic)', value: 'ar' },
            ]}
          />
        </Form.Item>

        <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
          <Space>
            <Button onClick={onClose}>Cancel</Button>
            <Button type="primary" htmlType="submit">
              Save Settings
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
};
