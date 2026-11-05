import React, { useState, useEffect, useRef } from 'react';
import {
  ConfigProvider,
  theme,
  Button,
  Space,
  Typography,
  Tooltip,
  Badge,
  Tag,
  Popover,
  message,
  Popconfirm,
} from 'antd';
import {
  Bubble,
  Sender,
  Prompts,
  Welcome,
  Conversations,
  XProvider,
} from '@ant-design/x';
import {
  PlusOutlined,
  SettingOutlined,
  DeleteOutlined,
  MoonOutlined,
  SunOutlined,
  RobotOutlined,
  UserOutlined,
  BookOutlined,
  RocketOutlined,
  ExperimentOutlined,
  MedicineBoxOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  CopyOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import type { ChatMessage, Conversation, AppSettings } from './types';
import { askQuestionStream, checkBackendHealth, RateLimitError } from './services/api';
import { SettingsModal } from './components/SettingsModal';
import { EvidenceView } from './components/EvidenceView';
import { RateLimitCard } from './components/RateLimitCard';
import { VoiceRecorder } from './components/VoiceRecorder';
import { ThinkingProcess } from './components/ThinkingProcess';
import { TokenUsageBar } from './components/TokenUsageBar';
import './App.css';

const { Text } = Typography;

const DEFAULT_SETTINGS: AppSettings = {
  backendUrl: import.meta.env.VITE_BACKEND_URL || 'http://localhost:5023',
  language: (import.meta.env.VITE_DEFAULT_LANGUAGE as 'auto' | 'en' | 'ar') || 'auto',
  isDarkMode: false,
  useMockMode: false,
};

const SUGGESTED_PROMPTS = [
  {
    key: '1',
    icon: <RocketOutlined style={{ color: '#1677ff' }} />,
    label: 'Transformer Architectures',
    description: 'What are the key innovations introduced in "Attention Is All You Need"?',
  },
  {
    key: '2',
    icon: <ExperimentOutlined style={{ color: '#52c41a' }} />,
    label: 'Quantum Computing',
    description: 'Explain recent advances in quantum error mitigation algorithms.',
  },
  {
    key: '3',
    icon: <MedicineBoxOutlined style={{ color: '#eb2f96' }} />,
    label: 'CRISPR & Gene Editing',
    description: 'Summarize clinical trial progress of CRISPR therapies in human medicine.',
  },
  {
    key: '4',
    icon: <BookOutlined style={{ color: '#722ed1' }} />,
    label: 'LLM Reasoning & RAG',
    description: 'How does retrieval-augmented generation improve factual accuracy in LLMs?',
  },
];

export const App: React.FC = () => {
  // Load settings from localStorage
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('researchhub_settings');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // fallback
      }
    }
    return DEFAULT_SETTINGS;
  });

  // Load conversations from localStorage
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    const saved = localStorage.getItem('researchhub_conversations');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {
        // fallback
      }
    }
    const initialId = Date.now().toString();
    return [
      {
        id: initialId,
        title: 'New Research Chat',
        messages: [],
        updatedAt: Date.now(),
      },
    ];
  });

  const [activeKey, setActiveKey] = useState<string>(() => {
    return conversations[0]?.id || '1';
  });

  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isBackendHealthy, setIsBackendHealthy] = useState<boolean | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Sync settings
  useEffect(() => {
    localStorage.setItem('researchhub_settings', JSON.stringify(settings));
    document.documentElement.classList.toggle('dark-theme', settings.isDarkMode);
  }, [settings]);

  // Sync conversations
  useEffect(() => {
    localStorage.setItem('researchhub_conversations', JSON.stringify(conversations));
  }, [conversations]);

  // Check backend health on initial mount and when url changes
  useEffect(() => {
    let mounted = true;
    checkBackendHealth(settings.backendUrl).then((healthy) => {
      if (mounted) setIsBackendHealthy(healthy);
    });
    return () => {
      mounted = false;
    };
  }, [settings.backendUrl]);

  // Scroll to bottom when messages change
  const currentConversation = conversations.find((c) => c.id === activeKey) || conversations[0];
  const messages = currentConversation?.messages || [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Create new chat
  const handleNewChat = () => {
    const newId = Date.now().toString();
    const newConv: Conversation = {
      id: newId,
      title: 'New Research Chat',
      messages: [],
      updatedAt: Date.now(),
    };
    setConversations((prev) => [newConv, ...prev]);
    setActiveKey(newId);
  };

  // Delete chat
  const handleDeleteChat = (id: string) => {
    setConversations((prev) => {
      const filtered = prev.filter((c) => c.id !== id);
      if (filtered.length === 0) {
        const freshId = Date.now().toString();
        const freshConv: Conversation = {
          id: freshId,
          title: 'New Research Chat',
          messages: [],
          updatedAt: Date.now(),
        };
        setActiveKey(freshId);
        return [freshConv];
      }
      if (activeKey === id) {
        setActiveKey(filtered[0].id);
      }
      return filtered;
    });
    message.success('Conversation deleted');
  };

  // Clear all chats
  const handleClearAll = () => {
    const newId = Date.now().toString();
    const fresh: Conversation = {
      id: newId,
      title: 'New Research Chat',
      messages: [],
      updatedAt: Date.now(),
    };
    setConversations([fresh]);
    setActiveKey(newId);
    message.success('All conversations cleared');
  };

  // Send message
  const handleSend = async (queryText?: string) => {
    const textToSend = (queryText || inputText).trim();
    if (!textToSend || loading) return;

    setInputText('');

    const userMessageId = Date.now().toString();
    const assistantMessageId = (Date.now() + 1).toString();

    const userTokens = Math.max(1, Math.round(textToSend.length / 3.6));
    const userMessage: ChatMessage = {
      id: userMessageId,
      role: 'user',
      content: textToSend,
      timestamp: Date.now(),
      usage: {
        promptTokens: userTokens,
        completionTokens: 0,
        totalTokens: userTokens,
      },
    };

    const targetConvId = activeKey;
    const assistantPlaceholder: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      loading: true,
      isStreaming: true,
      timestamp: Date.now(),
    };

    // Update conversation with user query and loading placeholder
    setConversations((prev) =>
      prev.map((conv) => {
        if (conv.id === targetConvId) {
          const isFirst = conv.messages.length === 0;
          const newTitle = isFirst ? (textToSend.slice(0, 30) + (textToSend.length > 30 ? '...' : '')) : conv.title;
          return {
            ...conv,
            title: newTitle,
            updatedAt: Date.now(),
            messages: [...conv.messages, userMessage, assistantPlaceholder],
          };
        }
        return conv;
      })
    );

    setLoading(true);

    const currentConv = conversations.find((c) => c.id === targetConvId);
    const recentHistory = (currentConv?.messages || [])
      .slice(-5)
      .map((m) => ({ role: m.role, content: m.content }));
    const chatSummary = currentConv?.summary;

    try {
      const response = await askQuestionStream(
        textToSend,
        settings.language,
        settings.backendUrl,
        settings.useMockMode,
        chatSummary,
        recentHistory,
        {
          onThought: (_chunk, accumulatedThought) => {
            setConversations((prev) =>
              prev.map((conv) => {
                if (conv.id === targetConvId) {
                  return {
                    ...conv,
                    messages: conv.messages.map((m) => {
                      if (m.id === assistantMessageId) {
                        return {
                          ...m,
                          thought: accumulatedThought,
                        };
                      }
                      return m;
                    }),
                  };
                }
                return conv;
              })
            );
          },
          onChunk: (_chunk, accumulated) => {
            setConversations((prev) =>
              prev.map((conv) => {
                if (conv.id === targetConvId) {
                  return {
                    ...conv,
                    messages: conv.messages.map((m) => {
                      if (m.id === assistantMessageId) {
                        return {
                          ...m,
                          content: accumulated,
                          loading: false,
                          isStreaming: true,
                        };
                      }
                      return m;
                    }),
                  };
                }
                return conv;
              })
            );
          },
        }
      );

      setConversations((prev) =>
        prev.map((conv) => {
          if (conv.id === targetConvId) {
            return {
              ...conv,
              summary: response.updatedSummary || conv.summary,
              updatedAt: Date.now(),
              messages: conv.messages.map((m) => {
                if (m.id === assistantMessageId) {
                  return {
                    ...m,
                    content: response.answer,
                    thought: response.thought,
                    thinkingDuration: response.thinkingDuration,
                    usage: response.usage,
                    claims: response.claims,
                    loading: false,
                    isStreaming: false,
                  };
                }
                return m;
              }),
            };
          }
          return conv;
        })
      );
      setIsBackendHealthy(true);
    } catch (err: unknown) {
      if (err instanceof RateLimitError) {
        setConversations((prev) =>
          prev.map((conv) => {
            if (conv.id === targetConvId) {
              return {
                ...conv,
                updatedAt: Date.now(),
                messages: conv.messages.map((m) => {
                  if (m.id === assistantMessageId) {
                    return {
                      ...m,
                      content: '',
                      isRateLimited: true,
                      loading: false,
                      isStreaming: false,
                      error: err.message,
                    };
                  }
                  return m;
                }),
              };
            }
            return conv;
          })
        );
        return;
      }

      const errMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setConversations((prev) =>
        prev.map((conv) => {
          if (conv.id === targetConvId) {
            return {
              ...conv,
              updatedAt: Date.now(),
              messages: conv.messages.map((m) => {
                if (m.id === assistantMessageId) {
                  return {
                    ...m,
                    content: `⚠️ **Error communicating with backend:**\n\n${errMessage}\n\n*Please ensure the ASP.NET backend is running at \`${settings.backendUrl}\` and CORS is enabled.*`,
                    loading: false,
                    isStreaming: false,
                    error: errMessage,
                  };
                }
                return m;
              }),
            };
          }
          return conv;
        })
      );
      setIsBackendHealthy(false);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    message.success('Copied to clipboard');
  };

  // Format conversations for Ant Design X Conversations component
  const conversationItems = conversations.map((c) => ({
    key: c.id,
    label: c.title,
    icon: <BookOutlined />,
  }));

  return (
    <ConfigProvider
      theme={{
        algorithm: settings.isDarkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: '#1677ff',
          borderRadius: 8,
        },
      }}
    >
      <XProvider>
        <div className={`app-container ${settings.isDarkMode ? 'dark-theme' : ''}`}>
          {/* Sidebar */}
          {!sidebarCollapsed && (
            <div
              className="sidebar"
              style={{
                backgroundColor: settings.isDarkMode ? '#141414' : '#f9f9fb',
              }}
            >
              {/* Sidebar Header */}
              <div style={{ padding: '16px 14px', display: 'flex', gap: 8 }}>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={handleNewChat}
                  style={{ flex: 1 }}
                >
                  New Research Chat
                </Button>
                <Tooltip title="Collapse Sidebar">
                  <Button
                    type="text"
                    icon={<MenuFoldOutlined />}
                    onClick={() => setSidebarCollapsed(true)}
                  />
                </Tooltip>
              </div>

              {/* Conversation List */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }}>
                <Conversations
                  items={conversationItems}
                  activeKey={activeKey}
                  onActiveChange={(key) => setActiveKey(key)}
                  menu={(item) => ({
                    items: [
                      {
                        key: 'delete',
                        label: 'Delete Chat',
                        icon: <DeleteOutlined />,
                        danger: true,
                      },
                    ],
                    onClick: ({ key }) => {
                      if (key === 'delete') {
                        handleDeleteChat(item.key);
                      }
                    },
                  })}
                />
              </div>

              {/* Sidebar Footer */}
              <div
                style={{
                  padding: '12px 14px',
                  borderTop: settings.isDarkMode
                    ? '1px solid rgba(255, 255, 255, 0.08)'
                    : '1px solid rgba(0, 0, 0, 0.06)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Space>
                  <Tooltip title={settings.isDarkMode ? 'Light Mode' : 'Dark Mode'}>
                    <Button
                      type="text"
                      icon={settings.isDarkMode ? <SunOutlined /> : <MoonOutlined />}
                      onClick={() =>
                        setSettings((prev) => ({ ...prev, isDarkMode: !prev.isDarkMode }))
                      }
                    />
                  </Tooltip>
                  <Tooltip title="Backend & Language Settings">
                    <Button
                      type="text"
                      icon={<SettingOutlined />}
                      onClick={() => setSettingsOpen(true)}
                    />
                  </Tooltip>
                </Space>

                <Popconfirm
                  title="Clear all chat history?"
                  onConfirm={handleClearAll}
                  okText="Clear"
                  cancelText="Cancel"
                  okButtonProps={{ danger: true }}
                >
                  <Tooltip title="Clear All Chats">
                    <Button type="text" danger icon={<DeleteOutlined />} />
                  </Tooltip>
                </Popconfirm>
              </div>
            </div>
          )}

          {/* Main Chat Area */}
          <div
            className="chat-container"
            style={{
              backgroundColor: settings.isDarkMode ? '#1f1f1f' : '#ffffff',
            }}
          >
            {/* Header */}
            <div
              className="chat-header"
              style={{
                backgroundColor: settings.isDarkMode ? '#141414' : '#ffffff',
              }}
            >
              <Space>
                {sidebarCollapsed && (
                  <Tooltip title="Expand Sidebar">
                    <Button
                      type="text"
                      icon={<MenuUnfoldOutlined />}
                      onClick={() => setSidebarCollapsed(false)}
                    />
                  </Tooltip>
                )}
                <BookOutlined style={{ fontSize: 18, color: '#1677ff' }} />
                <Text strong style={{ fontSize: 16 }}>
                  ResearchHub AI
                </Text>
                {settings.useMockMode ? (
                  <Tag
                    color="orange"
                    icon={<ExperimentOutlined />}
                    style={{ cursor: 'pointer', marginLeft: 8 }}
                    onClick={() => setSettingsOpen(true)}
                  >
                    Local Demo Mode
                  </Tag>
                ) : (
                  <Badge
                    status={isBackendHealthy ? 'success' : isBackendHealthy === false ? 'error' : 'warning'}
                    text={
                      isBackendHealthy
                        ? 'API Connected'
                        : isBackendHealthy === false
                        ? 'Backend Offline'
                        : 'Connecting...'
                    }
                    style={{ marginLeft: 8 }}
                  />
                )}
              </Space>

              <Space>
                {currentConversation?.summary && (
                  <Popover
                    title="🧠 Rolling Context Summary"
                    content={
                      <div style={{ maxWidth: 360, fontSize: '12.5px', lineHeight: 1.55 }}>
                        {currentConversation.summary}
                      </div>
                    }
                  >
                    <Tag color="cyan" style={{ cursor: 'pointer', margin: 0 }}>
                      🧠 Memory Active
                    </Tag>
                  </Popover>
                )}
                <Tooltip title="Configure API Base URL & Language">
                  <Button
                    size="small"
                    icon={<SettingOutlined />}
                    onClick={() => setSettingsOpen(true)}
                  >
                    API Settings
                  </Button>
                </Tooltip>
              </Space>
            </div>

            {/* Messages Area */}
            <div className="chat-messages">
              <div className="chat-messages-inner">
                {messages.length === 0 ? (
                  <div style={{ padding: '40px 0' }}>
                    <Welcome
                      icon={<BookOutlined style={{ fontSize: 44, color: '#1677ff' }} />}
                      title="ResearchHub Academic Assistant"
                      description="Ask any academic or scientific research question. Responses are synthesized by Gemini and grounded directly in research papers from OpenAlex with verifiable citations."
                      style={{ marginBottom: 32 }}
                    />

                    <Prompts
                      title="Explore Suggested Topics"
                      items={SUGGESTED_PROMPTS}
                      onItemClick={(info) => {
                        const desc = info.data.description;
                        if (typeof desc === 'string') {
                          handleSend(desc);
                        }
                      }}
                    />
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {messages.map((msg) => (
                      <Bubble
                        key={msg.id}
                        placement={msg.role === 'user' ? 'end' : 'start'}
                        avatar={
                          msg.role === 'user' ? (
                            <div
                              style={{
                                width: 34,
                                height: 34,
                                borderRadius: '50%',
                                background: '#1677ff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#fff',
                              }}
                            >
                              <UserOutlined />
                            </div>
                          ) : (
                            <div
                              style={{
                                width: 34,
                                height: 34,
                                borderRadius: '50%',
                                background: '#52c41a',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#fff',
                              }}
                            >
                              <RobotOutlined />
                            </div>
                          )
                        }
                        loading={msg.loading && !msg.content && !msg.thought}
                        content={
                          msg.isRateLimited ? (
                            <RateLimitCard
                              language={settings.language}
                              loading={loading}
                              onRetry={() => {
                                const lastUserMsg = [...messages]
                                  .reverse()
                                  .find((m) => m.role === 'user');
                                if (lastUserMsg) {
                                  handleSend(lastUserMsg.content);
                                }
                              }}
                            />
                          ) : (
                            <div>
                              {msg.role === 'assistant' && (
                                <ThinkingProcess
                                  thought={msg.thought}
                                  duration={msg.thinkingDuration}
                                  thinkingTokens={msg.usage?.thinkingTokens}
                                  loading={msg.loading && !msg.content}
                                  language={settings.language}
                                />
                              )}
                              {msg.content && (
                                <div className="markdown-content">
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {msg.content}
                                  </ReactMarkdown>
                                  {msg.isStreaming && <span className="streaming-cursor" />}
                                </div>
                              )}
                              {msg.claims && msg.claims.length > 0 && (
                                <EvidenceView claims={msg.claims} />
                              )}
                              {msg.usage && !msg.loading && !msg.isStreaming && (
                                <TokenUsageBar usage={msg.usage} language={settings.language} />
                              )}
                            </div>
                          )
                        }
                        footer={
                          msg.role === 'assistant' && !msg.loading && !msg.isStreaming && msg.content && !msg.isRateLimited ? (
                            <Space size={4} style={{ marginTop: 6 }}>
                              <Tooltip title="Copy Answer">
                                <Button
                                  type="text"
                                  size="small"
                                  icon={<CopyOutlined />}
                                  onClick={() => handleCopy(msg.content)}
                                />
                              </Tooltip>
                              <Tooltip title="Regenerate">
                                <Button
                                  type="text"
                                  size="small"
                                  icon={<ReloadOutlined />}
                                  onClick={() => {
                                    // Find last user question
                                    const lastUserMsg = [...messages]
                                      .reverse()
                                      .find((m) => m.role === 'user');
                                    if (lastUserMsg) {
                                      handleSend(lastUserMsg.content);
                                    }
                                  }}
                                />
                              </Tooltip>
                            </Space>
                          ) : undefined
                        }
                      />
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>
            </div>

            {/* Input Footer */}
            <div
              className="chat-footer"
              style={{
                backgroundColor: settings.isDarkMode ? '#141414' : '#ffffff',
              }}
            >
              <div className="chat-footer-inner">
                <Sender
                  loading={loading}
                  value={inputText}
                  onChange={(val) => setInputText(val)}
                  onSubmit={() => handleSend()}
                  prefix={
                    <VoiceRecorder
                      language={settings.language}
                      disabled={loading}
                      onTranscript={(transcript) => {
                        setInputText((prev) => (prev ? `${prev} ${transcript}` : transcript));
                      }}
                    />
                  }
                  placeholder={
                    settings.language === 'ar'
                      ? 'اسأل أي سؤال علمي أو اضغط على الميكروفون للتحدث بصوتك...'
                      : "Ask a research question or click microphone to speak..."
                  }
                />
                <div className="chat-disclaimer">
                  ResearchHub searches OpenAlex academic papers and Gemini AI. Citations are linked directly to peer-reviewed sources.
                </div>
              </div>
            </div>
          </div>

          {/* Settings Modal */}
          <SettingsModal
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            settings={settings}
            onSave={(newSettings) => setSettings(newSettings)}
          />
        </div>
      </XProvider>
    </ConfigProvider>
  );
};

export default App;
