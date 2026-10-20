import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'

export type NotificationEmailProps = {
  heading: string
  message: string
  ctaLabel?: string
  ctaUrl?: string
  appUrl: string
}

export function NotificationEmail({ heading, message, ctaLabel, ctaUrl, appUrl }: NotificationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{heading}</Preview>
      <Body style={{ backgroundColor: '#f8fafc', fontFamily: 'Helvetica, Arial, sans-serif' }}>
        <Container style={{ backgroundColor: '#ffffff', margin: '0 auto', padding: '32px', maxWidth: '480px' }}>
          <Text style={{ fontSize: '18px', fontWeight: 700, color: '#0e7490', margin: '0 0 24px' }}>MTA</Text>
          <Heading style={{ fontSize: '20px', color: '#0f172a', margin: '0 0 16px' }}>{heading}</Heading>
          <Text style={{ fontSize: '14px', color: '#475569', lineHeight: '22px', margin: '0 0 24px' }}>{message}</Text>
          {ctaUrl && (
            <Section style={{ margin: '0 0 24px' }}>
              <Button
                href={ctaUrl}
                style={{
                  backgroundColor: '#0e7490',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontSize: '14px',
                  fontWeight: 600,
                  padding: '12px 24px',
                  textDecoration: 'none',
                }}
              >
                {ctaLabel ?? 'View in portal'}
              </Button>
            </Section>
          )}
          <Hr style={{ borderColor: '#e2e8f0', margin: '24px 0' }} />
          <Text style={{ fontSize: '12px', color: '#94a3b8', lineHeight: '18px', margin: 0 }}>
            MTA · Need help? Contact support at{' '}
            <Link href="mailto:support@mta.example" style={{ color: '#0e7490' }}>
              support@mta.example
            </Link>
            <br />
            <Link href={`${appUrl}/profile?tab=notifications`} style={{ color: '#0e7490' }}>
              Manage notification preferences
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  )
}
