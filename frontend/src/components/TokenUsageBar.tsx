import React from 'react';
import { Space, Typography, Tooltip } from 'antd';
import { ThunderboltOutlined, InfoCircleOutlined } from '@ant-design/icons';
import type { TokenUsage } from '../types';

const { Text } = Typography;

interface TokenUsageBarProps {
  usage?: TokenUsage;
  language?: 'auto' | 'en' | 'ar';
}

export const TokenUsageBar: React.FC<TokenUsageBarProps> = ({
  usage,
  language = 'en',
}) => {
  if (!usage || !usage.totalTokens) return null;

  const isArabic = language === 'ar';
  const details = usage.details;

  const tooltipContent = details ? (
    <div style={{ fontSize: '11.5px', lineHeight: 1.6, padding: '2px' }}>
      <div style={{ fontWeight: 600, marginBottom: 4, borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
        {isArabic ? 'تفاصيل استهلاك التوكنز:' : 'Token Usage Breakdown:'}
      </div>
      <div>• {isArabic ? 'التعليمات (System):' : 'System Prompt:'} {details.systemPromptTokens}</div>
      <div>• {isArabic ? 'أوراق البحث (Papers):' : 'Papers Context:'} {details.papersTokens}</div>
      <div>• {isArabic ? 'الذاكرة (Memory):' : '5-Turn Memory:'} {details.historyTokens}</div>
      <div>• {isArabic ? 'الملخص (Summary):' : 'Chat Summary:'} {details.summaryTokens}</div>
      <div>• {isArabic ? 'سؤالك (User):' : 'User Query:'} {details.userTokens}</div>
      {usage.thinkingTokens !== undefined && (
        <div>• {isArabic ? 'التفكير (Think):' : 'Thinking:'} {usage.thinkingTokens}</div>
      )}
      <div>• {isArabic ? 'المخرجات (Result):' : 'Output:'} {usage.completionTokens}</div>
    </div>
  ) : null;

  return (
    <div
      style={{
        marginTop: '10px',
        paddingTop: '6px',
        borderTop: '1px solid rgba(150, 150, 150, 0.12)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '11.5px',
        color: 'rgba(0, 0, 0, 0.45)',
        userSelect: 'none',
      }}
    >
      <Space size={6}>
        <ThunderboltOutlined style={{ color: '#1677ff', fontSize: '11px' }} />
        <Text style={{ fontSize: '11.5px', color: 'rgba(0, 0, 0, 0.55)', fontWeight: 500 }}>
          {isArabic ? 'إجمالي التوكنز:' : 'Total Tokens:'}{' '}
          <strong style={{ color: '#1677ff' }}>{usage.totalTokens}</strong>
        </Text>
        {tooltipContent && (
          <Tooltip title={tooltipContent} placement="top">
            <InfoCircleOutlined style={{ cursor: 'pointer', color: '#8c8c8c', fontSize: '11px' }} />
          </Tooltip>
        )}
      </Space>

      <Space size={10} style={{ fontSize: '11px', color: 'rgba(0, 0, 0, 0.45)' }}>
        <span>
          {isArabic ? 'المدخلات (Input):' : 'Input:'} <strong>{usage.promptTokens}</strong>
        </span>
        {usage.thinkingTokens !== undefined && usage.thinkingTokens > 0 && (
          <span>
            {isArabic ? 'التفكير (Think):' : 'Think:'} <strong style={{ color: '#722ed1' }}>{usage.thinkingTokens}</strong>
          </span>
        )}
        <span>
          {isArabic ? 'المخرجات (Result):' : 'Result:'} <strong style={{ color: '#52c41a' }}>{usage.completionTokens}</strong>
        </span>
      </Space>
    </div>
  );
};
