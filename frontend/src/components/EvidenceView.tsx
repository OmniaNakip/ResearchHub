import React from 'react';
import { Collapse, Tag, Typography, Space, Button } from 'antd';
import { BookOutlined, LinkOutlined, CheckCircleOutlined } from '@ant-design/icons';
import type { ClaimResponse } from '../types';

const { Text, Paragraph } = Typography;

interface EvidenceViewProps {
  claims: ClaimResponse[];
}

export const EvidenceView: React.FC<EvidenceViewProps> = ({ claims }) => {
  if (!claims || claims.length === 0) return null;

  const items = claims.map((claim, idx) => {
    const totalEvidence = claim.evidence?.length || 0;

    return {
      key: String(idx),
      label: (
        <Space orientation="horizontal" style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space>
            <CheckCircleOutlined style={{ color: '#52c41a' }} />
            <Text strong style={{ fontSize: '13px' }}>
              Claim {idx + 1}: {claim.text.length > 80 ? claim.text.substring(0, 80) + '...' : claim.text}
            </Text>
          </Space>
          <Space>
            {claim.type && <Tag color="blue">{claim.type}</Tag>}
            <Tag color="cyan">{totalEvidence} source{totalEvidence > 1 ? 's' : ''}</Tag>
          </Space>
        </Space>
      ),
      children: (
        <div>
          <Paragraph type="secondary" style={{ marginBottom: 12 }}>
            <strong>Full Claim Statement:</strong> {claim.text}
          </Paragraph>

          {claim.evidence && claim.evidence.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {claim.evidence.map((ev, evIdx) => (
                <div
                  key={evIdx}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(0, 0, 0, 0.03)',
                    borderLeft: '3px solid #1677ff',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Space size={4}>
                      <BookOutlined style={{ color: '#1677ff' }} />
                      <Text strong style={{ fontSize: '12px' }}>
                        Source Passage #{evIdx + 1}
                      </Text>
                    </Space>
                    {ev.retrievalScore > 0 && (
                      <Tag color="geekblue" style={{ fontSize: '11px' }}>
                        Score: {(ev.retrievalScore * 100).toFixed(0)}%
                      </Tag>
                    )}
                  </div>
                  <Paragraph
                    style={{
                      fontSize: '12px',
                      color: 'rgba(0,0,0,0.75)',
                      marginBottom: 8,
                      fontStyle: 'italic',
                    }}
                  >
                    "{ev.sourcePassage}"
                  </Paragraph>
                  {ev.paperLink && (
                    <Button
                      type="link"
                      size="small"
                      icon={<LinkOutlined />}
                      href={ev.paperLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ padding: 0, height: 'auto', fontSize: '12px' }}
                    >
                      Open Research Paper / DOI
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <Text type="secondary" italic>No direct passages attached.</Text>
          )}
        </div>
      ),
    };
  });

  return (
    <div style={{ marginTop: 12 }}>
      <Collapse
        size="small"
        items={items}
        style={{ borderRadius: 8 }}
      />
    </div>
  );
};
