import React, { useState, useEffect } from 'react';
import { Button, Typography, Space } from 'antd';
import { ReloadOutlined, CheckCircleFilled, ClockCircleFilled } from '@ant-design/icons';

const { Text, Paragraph } = Typography;

interface RateLimitCardProps {
  initialSeconds?: number;
  language?: 'auto' | 'en' | 'ar';
  onRetry: () => void;
  loading?: boolean;
}

export const RateLimitCard: React.FC<RateLimitCardProps> = ({
  initialSeconds = 30,
  language = 'en',
  onRetry,
  loading = false,
}) => {
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);
  const isArabic = language === 'ar';

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setInterval(() => {
      setSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [secondsLeft]);

  const isReady = secondsLeft === 0;

  return (
    <div
      style={{
        padding: '16px 18px',
        borderRadius: '12px',
        backgroundColor: isReady ? 'rgba(82, 196, 26, 0.08)' : 'rgba(250, 140, 22, 0.08)',
        border: `1.5px solid ${isReady ? '#52c41a' : '#fa8c16'}`,
        marginTop: '8px',
        transition: 'all 0.3s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
        {isReady ? (
          <CheckCircleFilled style={{ fontSize: '20px', color: '#52c41a' }} />
        ) : (
          <ClockCircleFilled style={{ fontSize: '20px', color: '#fa8c16' }} />
        )}
        <Text strong style={{ fontSize: '15px', color: isReady ? '#389e0d' : '#d46b08' }}>
          {isReady
            ? isArabic
              ? '✅ الـ Rate رجع! الحصة متاحة الآن'
              : '✅ Rate Limit Restored! Quota is available'
            : isArabic
            ? '⏳ الـ Rate Limit خلص (429 Too Many Requests)'
            : '⏳ Gemini API Rate Limit Reached (429)'}
        </Text>
      </div>

      <Paragraph style={{ fontSize: '13px', margin: '4px 0 12px', color: 'rgba(0, 0, 0, 0.75)' }}>
        {isReady
          ? isArabic
            ? 'انتهت فترة الانتظار بنجاح. يمكنك الآن الضغط على الزر بالأسفل لإرسال السؤال والحصول على الإجابة.'
            : 'The cooldown period has finished. You can now retry to get your research answer.'
          : isArabic
          ? `تم استنفاد عدد الطلبات المسموح بها في الدقيقة لـ Gemini API. جاري الانتظار لإعادة فتح الـ Rate تلقائياً:`
          : `You have reached the temporary requests-per-minute quota for Gemini API. Waiting for quota reset:`}
      </Paragraph>

      <Space>
        {!isReady && (
          <div
            style={{
              padding: '4px 12px',
              borderRadius: '6px',
              backgroundColor: 'rgba(250, 140, 22, 0.15)',
              color: '#d46b08',
              fontWeight: 600,
              fontSize: '13px',
            }}
          >
            {isArabic ? `الـ Rate راجع خلال: ${secondsLeft} ثانية` : `Quota resets in: ${secondsLeft}s`}
          </div>
        )}

        <Button
          type={isReady ? 'primary' : 'default'}
          icon={<ReloadOutlined spin={loading} />}
          loading={loading}
          onClick={onRetry}
          style={{
            borderColor: isReady ? undefined : '#fa8c16',
            color: isReady ? undefined : '#d46b08',
          }}
        >
          {isArabic ? 'إعادة المحاولة الآن' : 'Retry Query Now'}
        </Button>
      </Space>
    </div>
  );
};
