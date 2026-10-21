import { useNavigate } from 'react-router-dom';
import { Button } from '@alfalab/core-components/button';
import { Typography } from '@alfalab/core-components/typography';

import { useFeed } from '@/features/feed/hooks';
import { Card, Row, SmallTag, Stack, Text, uiStyles as s } from '@/shared/ui';

import styles from '../home.module.css';

export function FeedBlock() {
  const navigate = useNavigate();
  const feed = useFeed(3);
  if (feed.isLoading || feed.isError || !feed.data?.items.length) return null;
  return (
    <section>
      <Typography.Title tag='h2' view='small' className={s.pageTitle}>
        Новости для вашего бизнеса
      </Typography.Title>
      <div className={s.grid3} style={{ marginTop: 16 }}>
        {feed.data.items.map((item) => (
          <Card key={item.id} compact className={styles.feedCard}>
            <Stack gap={8}>
              <Row gap={6}>
                {item.tags.map((t) => (
                  <SmallTag key={t}>{t}</SmallTag>
                ))}
              </Row>
              <Text medium tag='div'>
                {item.title}
              </Text>
              <Text small secondary tag='div'>
                {item.body}
              </Text>
              <Text small tag='div' className={styles.relevance}>
                {item.relevance_reason}
              </Text>
              {item.cta && (
                <div>
                  <Button view='transparent' size={32} onClick={() => navigate(item.cta!.route)}>
                    {item.cta.label}
                  </Button>
                </div>
              )}
            </Stack>
          </Card>
        ))}
      </div>
    </section>
  );
}
