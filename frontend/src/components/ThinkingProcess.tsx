import React, { useState } from 'react';
import { Space, Typography, Tag } from 'antd';
import { DownOutlined, UpOutlined, BulbOutlined, LoadingOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const { Text } = Typography;

interface ThinkingProcessProps {
  thought?: string;
  duration?: number;
  thinkingTokens?: number;
  loading?: boolean;
  language?: 'auto' | 'en' | 'ar';
}

export const ThinkingProcess: React.FC<ThinkingProcessProps> = ({
  thought,
  duration,
  thinkingTokens,
  loading = false,
  language = 'en',
}) => {
  const [expanded, setExpanded] = useState(false);
  const isArabic = language === 'ar';

  if (!thought && !loading) return null;

  const durationText = duration
    ? isArabic
      ? `فكر لمدة ${duration.toFixed(1)} ثانية`
      : `Thought for ${duration.toFixed(1)}s`
    : isArabic
    ? 'عملية التفكير والتحليل'
    : 'Thinking Process';

  return (
    <div
      style={{
        margin: '6px 0 14px 0',
        borderRadius: '10px',
        border: '1px solid rgba(150, 150, 150, 0.18)',
        backgroundColor: 'rgba(150, 150, 150, 0.04)',
        backdropFilter: 'blur(8px)',
        overflow: 'hidden',
        transition: 'all 0.25s ease',
      }}
    >
      {/* Clickable Header */}
      <div
        onClick={() => !loading && setExpanded(!expanded)}
        style={{
          padding: '8px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: loading ? 'default' : 'pointer',
          userSelect: 'none',
        }}
      >
        <Space size={8}>
          {loading ? (
            <LoadingOutlined style={{ color: '#1677ff', fontSize: '14px' }} />
          ) : (
            <BulbOutlined style={{ color: '#fa8c16', fontSize: '14px' }} />
          )}
          <Text strong style={{ fontSize: '13px', color: 'rgba(0,0,0,0.75)' }}>
            {loading
              ? isArabic
                ? 'جاري التفكير وتحليل الأبحاث الأكاديمية...'
                : 'Thinking and analyzing academic literature...'
              : durationText}
          </Text>
        </Space>

        <Space size={8}>
          {thinkingTokens !== undefined && thinkingTokens > 0 && (
            <Tag color="purple" style={{ margin: 0, fontSize: '11px', borderRadius: 4 }}>
              {thinkingTokens} {isArabic ? 'توكن تفكير' : 'think tokens'}
            </Tag>
          )}
          {!loading && (
            <span style={{ fontSize: '12px', color: 'rgba(0,0,0,0.45)' }}>
              {expanded ? <UpOutlined /> : <DownOutlined />}
            </span>
          )}
        </Space>
      </div>

      {/* Foldable Content */}
      {expanded && thought && (
        <div
          style={{
            padding: '10px 14px 12px',
            borderTop: '1px dashed rgba(150, 150, 150, 0.15)',
            backgroundColor: 'rgba(0, 0, 0, 0.02)',
            fontSize: '13px',
            lineHeight: 1.6,
            color: 'rgba(0, 0, 0, 0.7)',
          }}
        >
          <div className="markdown-content">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{thought}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
};
