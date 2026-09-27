import { Heading, Section, Text } from "@react-email/components";
import { EmailLayout, emailStyles } from "./_components/EmailLayout";
import { EVENT } from "./_lib/event";
import { previewRepCredentialsProps } from "./_lib/preview-data";

export type RepCredentialsEmailProps = {
  bannerUrl: string;
  hubName: string;
  username: string;
  temporaryPassword: string;
  isResend: boolean;
  portalUrl: string;
};

export default function RepCredentialsEmail({
  bannerUrl,
  hubName,
  username,
  temporaryPassword,
  isResend,
  portalUrl,
}: RepCredentialsEmailProps) {
  return (
    <EmailLayout
      preview={`Your Homecoming representative sign-in details — ${hubName}`}
      bannerUrl={bannerUrl}
    >
      <Heading style={emailStyles.heading}>
        {isResend
          ? "Your sign-in details (reset)"
          : "Your representative account is ready"}
      </Heading>
      <Text style={emailStyles.paragraph}>Dear {hubName} representative,</Text>
      <Text style={emailStyles.paragraph}>
        {isResend
          ? "A new temporary password was issued for your hub's representative account. Your previous password no longer works."
          : "An account has been created for your hub on the Homecoming representative portal. Use the details below to sign in and complete your first-time setup."}
      </Text>

      <Text style={emailStyles.label}>Portal</Text>
      <Text style={emailStyles.value}>{portalUrl}</Text>

      <Text style={emailStyles.label}>Username</Text>
      <Text style={emailStyles.value}>{username}</Text>

      <Text style={emailStyles.label}>Temporary password</Text>
      <Text style={{ ...emailStyles.value, fontFamily: "monospace" }}>
        {temporaryPassword}
      </Text>

      <Section
        style={{
          margin: "20px 0",
          padding: "14px 16px",
          backgroundColor: "#f4f1ea",
          borderRadius: "6px",
        }}
      >
        <Text style={emailStyles.paragraph}>
          <strong>Next steps:</strong> sign in with the username and temporary
          password, then choose a new password and complete your profile. Your
          account is activated right away and you land in the portal.
        </Text>
        <Text style={emailStyles.muted}>
          Please keep this email safe — treat the temporary password as
          confidential until you have replaced it with your own.
        </Text>
      </Section>

      <Text style={emailStyles.paragraph}>
        Questions? Contact the registration desk at {EVENT.supportEmail} or
        reply to this email.
      </Text>
    </EmailLayout>
  );
}

RepCredentialsEmail.PreviewProps = previewRepCredentialsProps;
