import React, { useState, useEffect, useRef } from 'react';
import { Button, Tooltip, message, Space, Tag } from 'antd';
import { AudioOutlined, AudioMutedOutlined, LoadingOutlined } from '@ant-design/icons';

// Interface for Web Speech API
interface IWindow extends Window {
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
}

interface VoiceRecorderProps {
  onTranscript: (text: string) => void;
  language: 'auto' | 'en' | 'ar';
  disabled?: boolean;
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({
  onTranscript,
  language,
  disabled = false,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [hasSupport, setHasSupport] = useState(true);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const win = window as unknown as IWindow;
    const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setHasSupport(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      const resolvedLang = language === 'ar' ? 'ar-EG' : language === 'en' ? 'en-US' : (navigator.language || 'ar-EG');
      recognition.lang = resolvedLang;

      recognition.onstart = () => {
        setIsRecording(true);
      };

      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          if (item.isFinal) {
            finalTranscript += item[0].transcript;
          }
        }
        if (finalTranscript) {
          onTranscript(finalTranscript.trim());
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
          message.error(
            language === 'ar'
              ? 'يرجى السماح بصلاحية الميكروفون في المتصفح لتفعيل الصوت.'
              : 'Please allow microphone permissions in your browser.'
          );
        }
        setIsRecording(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
    } catch (err) {
      console.warn('Could not initialize SpeechRecognition:', err);
      setHasSupport(false);
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }
    };
  }, [language, onTranscript]);

  const toggleRecording = () => {
    if (!hasSupport) {
      message.warning(
        language === 'ar'
          ? 'المتصفح الحالي لا يدعم تحويل الصوت لنص. يرجى تجربة Google Chrome أو Microsoft Edge.'
          : 'Speech recognition is not supported in this browser. Please use Chrome or Edge.'
      );
      return;
    }

    if (isRecording) {
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
      setIsRecording(false);
    } else {
      try {
        if (recognitionRef.current) {
          const resolvedLang = language === 'ar' ? 'ar-EG' : language === 'en' ? 'en-US' : (navigator.language || 'ar-EG');
          recognitionRef.current.lang = resolvedLang;
          recognitionRef.current.start();
          setIsRecording(true);
        }
      } catch (err) {
        console.error('Failed to start speech recognition:', err);
      }
    }
  };

  return (
    <Space size={6} align="center">
      <Tooltip
        title={
          isRecording
            ? language === 'ar'
              ? 'إيقاف التسجيل الصوتي'
              : 'Stop voice recording'
            : language === 'ar'
            ? 'تحدث بصوتك لتحويله لكلام'
            : 'Voice Input (Speech-to-Text)'
        }
      >
        <Button
          type={isRecording ? 'primary' : 'text'}
          danger={isRecording}
          shape="circle"
          size="middle"
          disabled={disabled}
          icon={
            isRecording ? (
              <AudioOutlined style={{ fontSize: 16, animation: 'pulse 1.2s infinite' }} />
            ) : hasSupport ? (
              <AudioOutlined style={{ fontSize: 16 }} />
            ) : (
              <AudioMutedOutlined style={{ fontSize: 16, color: '#bbb' }} />
            )
          }
          onClick={toggleRecording}
        />
      </Tooltip>

      {isRecording && (
        <Tag color="error" style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
          <LoadingOutlined />
          <span>{language === 'ar' ? 'جاري الاستماع... تحدث الآن' : 'Listening... Speak now'}</span>
        </Tag>
      )}
    </Space>
  );
};
